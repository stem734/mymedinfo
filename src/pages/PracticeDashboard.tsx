import React, { useCallback, useEffect, useDeferredValue, useMemo, useRef, useState } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  CheckCircle,
  Edit2,
  Eye,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Pill,
  Plus,
  Save,
  Search,
  Star,
  Syringe,
  Trash2,
} from 'lucide-react';
import type { MedContent } from '../medicationData';
import { resolvePath } from '../subdomainUtils';
import MedicationPreviewModal from '../components/MedicationPreviewModal';
import ConfirmDialog from '../components/ConfirmDialog';
import DisclaimerDialog from '../components/DisclaimerDialog';
import Modal from '../components/Modal';
import { getCurrentUserAdminRole } from '../adminAccess';
import { type MedicationRecord, useMedicationCatalog } from '../medicationCatalog';
import { getFunctionErrorMessage } from '../supabaseFunctionError';
import { fetchCardTemplates } from '../cardTemplateStore';
import type { CardTemplateRecord, HealthCheckTemplatePayload } from '../cardTemplateTypes';
import {
  withImmunisationTemplateDefaults,
  withLongTermConditionTemplateDefaults,
  withScreeningTemplateDefaults,
  type ImmunisationTemplate,
  type LongTermConditionTemplate,
  type PatientResourceLink,
  type ScreeningTemplate,
} from '../patientTemplateCatalog';
import {
  clearPracticeCardTemplate,
  fetchPracticeCardTemplates,
  savePracticeCardTemplate,
  type PracticeCardTemplateRow,
  type PracticeTemplateBuilderType,
} from '../practiceCardTemplateStore';
import {
  CUSTOM_CARD_DISCLAIMER_TEXT,
  GLOBAL_TEMPLATE_DISCLAIMER_TEXT,
  PRACTICE_SELECTION_STORAGE_KEY,
  coercePracticeSummary,
  type PracticeMembership,
  type PracticeMedicationCardRow,
  type PracticeSummary,
} from '../practicePortal';

type PracticeMembershipRow = {
  id: string;
  practice_id: string;
  user_uid: string;
  role: 'admin' | 'editor';
  is_default: boolean;
  practice: PracticeSummary | PracticeSummary[] | null;
};

type QueryErrorLike = {
  code?: string;
  message?: string;
};

type CustomCardDraft = {
  code: string;
  title: string;
  description: string;
  badge: 'NEW' | 'REAUTH' | 'GENERAL';
  category: string;
  keyInfoMode: 'do' | 'dont';
  keyInfo: string[];
  nhsLink: string;
  trendLinks: Array<{ title: string; url: string }>;
  sickDaysNeeded: boolean;
  reviewMonths: number;
  contentReviewDate: string;
};

type ServiceDomain = 'medication' | PracticeTemplateBuilderType;
type DashboardDomain = 'overview' | ServiceDomain;

type PlatformConfig = {
  service_medication_enabled: boolean;
  service_healthcheck_enabled: boolean;
  service_screening_enabled: boolean;
  service_immunisation_enabled: boolean;
  service_ltc_enabled: boolean;
};

const PLATFORM_CONFIG_KEY: Record<ServiceDomain, keyof PlatformConfig> = {
  medication: 'service_medication_enabled',
  healthcheck: 'service_healthcheck_enabled',
  screening: 'service_screening_enabled',
  immunisation: 'service_immunisation_enabled',
  ltc: 'service_ltc_enabled',
};
type EditablePatientTemplate = ScreeningTemplate | ImmunisationTemplate | LongTermConditionTemplate;

type PracticeTemplateDraft = {
  builderType: PracticeTemplateBuilderType;
  templateId: string;
  label: string;
  headline: string;
  explanation: string;
  importantMessage: string;
  guidanceText: string;
  linksText: string;
  payloadJson: string;
  isJsonMode: boolean;
};

type DisclaimerRequest = {
  title: string;
  message: string;
  checkboxLabel: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
};

const EMPTY_TREND_LINK = { title: '', url: '' };

const DASHBOARD_DOMAINS: Array<{ id: ServiceDomain; label: string }> = [
  { id: 'medication', label: 'Medication cards' },
  { id: 'healthcheck', label: 'Health checks' },
  { id: 'screening', label: 'Screening' },
  { id: 'immunisation', label: 'Immunisations' },
  { id: 'ltc', label: 'Long term conditions' },
];

const DOMAIN_ICONS: Record<ServiceDomain, React.ReactNode> = {
  medication: <Pill size={15} aria-hidden="true" />,
  healthcheck: <HeartPulse size={15} aria-hidden="true" />,
  screening: <Search size={15} aria-hidden="true" />,
  immunisation: <Syringe size={15} aria-hidden="true" />,
  ltc: <Activity size={15} aria-hidden="true" />,
};

const NON_MEDICATION_DOMAIN_LABELS: Record<PracticeTemplateBuilderType, string> = {
  healthcheck: 'Health checks',
  screening: 'Screening',
  immunisation: 'Immunisations',
  ltc: 'Long term conditions',
};

const DOMAIN_FEATURE_KEY: Record<PracticeTemplateBuilderType, keyof PracticeSummary> = {
  healthcheck: 'healthcheck_enabled',
  screening: 'screening_enabled',
  immunisation: 'immunisation_enabled',
  ltc: 'ltc_enabled',
};

const PRACTICE_MEMBERSHIP_SELECT_BASE = `
  id,
  practice_id,
  user_uid,
  role,
  is_default,
  practice:practices(
    id,
    name,
    ods_code,
    contact_email,
    is_active,
    link_visit_count,
    patient_rating_count,
    patient_rating_total,
    last_accessed,
    selected_medications
  )
`;

const PRACTICE_MEMBERSHIP_SELECT_WITH_FEATURES = `
  id,
  practice_id,
  user_uid,
  role,
  is_default,
  practice:practices(
    id,
    name,
    ods_code,
    contact_email,
    is_active,
    link_visit_count,
    patient_rating_count,
    patient_rating_total,
    last_accessed,
    selected_medications,
    medication_enabled,
    healthcheck_enabled,
    screening_enabled,
    immunisation_enabled,
    ltc_enabled
  )
`;

const domainFeatureEnabled = (practice: PracticeSummary, domain: ServiceDomain) =>
  domain === 'medication' ? practice.medication_enabled !== false : practice[DOMAIN_FEATURE_KEY[domain]] === true;

const platformServiceEnabled = (platformConfig: PlatformConfig | null, domain: ServiceDomain) =>
  platformConfig?.[PLATFORM_CONFIG_KEY[domain]] === true;

const isMissingColumnError = (error: unknown) => {
  const row = (error && typeof error === 'object' ? error : {}) as QueryErrorLike;
  const message = typeof row.message === 'string' ? row.message.toLowerCase() : '';
  return row.code === '42703' || (message.includes('column') && message.includes('does not exist'));
};

const safeSessionStorageGet = (key: string) => {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSessionStorageSet = (key: string, value: string) => {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore unavailable sessionStorage (for example restrictive browser modes).
  }
};

const isEditablePatientTemplate = (value: unknown): value is EditablePatientTemplate => {
  const row = value as Partial<EditablePatientTemplate> | null;
  return Boolean(row && typeof row.id === 'string' && typeof row.label === 'string' && Array.isArray(row.guidance) && Array.isArray(row.nhsLinks));
};

const getTemplateDisplayCode = (builderType: PracticeTemplateBuilderType, templateId: string, payload: unknown) => {
  if (!isEditablePatientTemplate(payload)) return templateId;
  if (builderType === 'screening') return withScreeningTemplateDefaults(payload as ScreeningTemplate).code || templateId;
  if (builderType === 'immunisation') return (payload as ImmunisationTemplate).code || templateId;
  if (builderType === 'ltc') return (payload as LongTermConditionTemplate).code || templateId;
  return templateId;
};

const resourceLinksToText = (links: PatientResourceLink[]) =>
  links.map((link) => [link.title, link.url, link.description].join(' | ')).join('\n');

const textToResourceLinks = (value: string): PatientResourceLink[] =>
  value
    .split('\n')
    .map((line) => {
      const [title = '', url = '', description = ''] = line.split('|').map((part) => part.trim());
      return { title, url, description };
    })
    .filter((link) => link.title && link.url);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalisePracticeSummary = (value: PracticeSummary | PracticeSummary[] | null | undefined): PracticeSummary | null => {
  const practice = Array.isArray(value) ? value[0] : value;
  return coercePracticeSummary(practice);
};

const buildMedicationPreview = (medication: MedicationRecord, practiceCard?: PracticeMedicationCardRow): MedContent => {
  if (practiceCard?.source_type === 'custom') {
    const keyInfoMode = practiceCard.key_info_mode === 'dont' ? 'dont' : medication.keyInfoMode || 'do';
    const keyInfo = Array.isArray(practiceCard.key_info) ? practiceCard.key_info : medication.keyInfo;

    return {
      code: medication.code,
      title: practiceCard.title || medication.title,
      description: practiceCard.description || medication.description,
      badge: practiceCard.badge || medication.badge,
      category: practiceCard.category || medication.category,
      keyInfoMode,
      keyInfo,
      doKeyInfo: Array.isArray(practiceCard.do_key_info) && practiceCard.do_key_info.length > 0
        ? practiceCard.do_key_info
        : keyInfoMode === 'do'
          ? keyInfo
          : [],
      dontKeyInfo: Array.isArray(practiceCard.dont_key_info) && practiceCard.dont_key_info.length > 0
        ? practiceCard.dont_key_info
        : keyInfoMode === 'dont'
          ? keyInfo
          : [],
      generalKeyInfo: Array.isArray(practiceCard.general_key_info) ? practiceCard.general_key_info : [],
      nhsLink: typeof practiceCard.nhs_link === 'string' ? practiceCard.nhs_link : medication.nhsLink,
      trendLinks: Array.isArray(practiceCard.trend_links) ? practiceCard.trend_links : medication.trendLinks,
      sickDaysNeeded:
        typeof practiceCard.sick_days_needed === 'boolean'
          ? practiceCard.sick_days_needed
          : medication.sickDaysNeeded,
      reviewMonths:
        typeof practiceCard.review_months === 'number'
          ? practiceCard.review_months
          : medication.reviewMonths,
      contentReviewDate:
        typeof practiceCard.content_review_date === 'string'
          ? practiceCard.content_review_date
          : medication.contentReviewDate,
    };
  }

  return {
    code: medication.code,
    title: medication.title,
    description: medication.description,
    badge: medication.badge,
    category: medication.category,
    keyInfoMode: medication.keyInfoMode || 'do',
    keyInfo: medication.keyInfo,
    doKeyInfo: medication.doKeyInfo,
    dontKeyInfo: medication.dontKeyInfo,
    generalKeyInfo: medication.generalKeyInfo,
    nhsLink: medication.nhsLink,
    trendLinks: medication.trendLinks,
    sickDaysNeeded: medication.sickDaysNeeded,
    reviewMonths: medication.reviewMonths,
    contentReviewDate: medication.contentReviewDate,
  };
};

const PracticeDashboard: React.FC = () => {
  const [memberships, setMemberships] = useState<PracticeMembership[]>([]);
  const [selectedPracticeId, setSelectedPracticeId] = useState('');
  const [practiceCards, setPracticeCards] = useState<Record<string, PracticeMedicationCardRow>>({});
  const [loadingPortal, setLoadingPortal] = useState(true);
  const [loadingCards, setLoadingCards] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [librarySearch, setLibrarySearch] = useState('');
  const [activeDomain, setActiveDomain] = useState<DashboardDomain>('overview');
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<Set<string>>(new Set());
  const deferredSearch = useDeferredValue(librarySearch);
  const [previewMed, setPreviewMed] = useState<MedContent | null>(null);
  const [draft, setDraft] = useState<CustomCardDraft | null>(null);
  const [draftCode, setDraftCode] = useState('');
  const [practiceTemplateRows, setPracticeTemplateRows] = useState<PracticeCardTemplateRow[]>([]);
  const [globalTemplateRows, setGlobalTemplateRows] = useState<Record<PracticeTemplateBuilderType, CardTemplateRecord[]>>({
    healthcheck: [],
    screening: [],
    immunisation: [],
    ltc: [],
  });
  const [templateDraft, setTemplateDraft] = useState<PracticeTemplateDraft | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    isDangerous: boolean;
    onConfirm: () => void;
  } | null>(null);
  const [disclaimerRequest, setDisclaimerRequest] = useState<DisclaimerRequest | null>(null);
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig | null>(null);
  const { medications: allMedications, loading: loadingMedications } = useMedicationCatalog();
  const navigate = useNavigate();
  const isMountedRef = useRef(true);
  const hasLoadedMembershipsRef = useRef(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate(resolvePath('/practice'));
  };

  const requestServiceActivation = async (service: ServiceDomain, practiceName: string) => {
    if (!selectedPracticeId || pendingRequests.has(service)) return;
    if (!platformServiceEnabled(platformConfig, service)) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('service_activation_requests').insert({
        practice_id: selectedPracticeId,
        practice_name: practiceName,
        requested_by_uid: user.id,
        requested_by_email: user.email ?? currentUserEmail,
        service,
        status: 'pending',
      });
      if (!error) {
        setPendingRequests((prev) => new Set([...prev, service]));
        setSuccessMessage(`Activation request sent for ${service}. Your administrator will review it shortly.`);
        setTimeout(() => setSuccessMessage(''), 5000);
      }
    } catch {
      // silently ignore — non-critical
    }
  };

  const loadMemberships = useCallback(async () => {
    if (!isMountedRef.current) return;
    // Only show the full-page loading screen on the very first load. Subsequent
    // refreshes (e.g. after an auth event fired by a same-origin iframe) must
    // not unmount the dashboard, otherwise any open modal — including the
    // medication patient preview — will remount in a loop.
    if (!hasLoadedMembershipsRef.current) {
      setLoadingPortal(true);
    }
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!isMountedRef.current) return;
        navigate(resolvePath('/practice'));
        return;
      }

      const withFeaturesQuery = await supabase
        .from('practice_memberships')
        .select(PRACTICE_MEMBERSHIP_SELECT_WITH_FEATURES)
        .eq('user_uid', user.id)
        .order('is_default', { ascending: false });

      let data = withFeaturesQuery.data as unknown as PracticeMembershipRow[] | null;
      let membershipError = withFeaturesQuery.error;
      if (membershipError && isMissingColumnError(membershipError)) {
        console.warn('Practice feature columns missing in this environment, falling back to legacy membership query.');
        const fallbackQuery = await supabase
          .from('practice_memberships')
          .select(PRACTICE_MEMBERSHIP_SELECT_BASE)
          .eq('user_uid', user.id)
          .order('is_default', { ascending: false });
        data = fallbackQuery.data as unknown as PracticeMembershipRow[] | null;
        membershipError = fallbackQuery.error;
      }

      if (membershipError) {
        throw membershipError;
      }

      const mappedMemberships: PracticeMembership[] = (((data || []) as unknown) as PracticeMembershipRow[])
        .flatMap((row) => {
          const practice = normalisePracticeSummary(row.practice);
          if (!practice) {
            return [];
          }

          return [{
            id: row.id,
            practice_id: row.practice_id,
            user_uid: row.user_uid,
            role: row.role,
            is_default: row.is_default,
            practice,
          }];
        });

      if (mappedMemberships.length === 0) {
        if (isMountedRef.current) {
          setMemberships([]);
          setSelectedPracticeId('');
          setError('No practice is linked to this account. Contact your administrator.');
        }
        return;
      }

      if (isMountedRef.current) {
        setMemberships(mappedMemberships);
      }

      const savedPracticeId = safeSessionStorageGet(PRACTICE_SELECTION_STORAGE_KEY) || '';
      const defaultPracticeId =
        mappedMemberships.find((membership) => membership.practice_id === savedPracticeId)?.practice_id ||
        mappedMemberships.find((membership) => membership.is_default)?.practice_id ||
        mappedMemberships[0].practice_id;

      if (isMountedRef.current) {
        setSelectedPracticeId(defaultPracticeId);
      }
    } catch (err) {
      console.error('Error loading practice memberships:', err);
      if (isMountedRef.current) {
        setError('Unable to load your practice access. Please try again.');
      }
    } finally {
      if (isMountedRef.current) {
        hasLoadedMembershipsRef.current = true;
        setLoadingPortal(false);
      }
    }
  }, [navigate]);

  const loadPendingRequests = useCallback(async (practiceId: string) => {
    try {
      const { data } = await supabase
        .from('service_activation_requests')
        .select('service')
        .eq('practice_id', practiceId)
        .eq('status', 'pending');
      if (data && isMountedRef.current) {
        setPendingRequests(new Set(data.map((row: { service: string }) => row.service)));
      }
    } catch {
      // Non-blocking — service requests table may not be deployed yet
    }
  }, []);

  const loadPracticeCards = useCallback(async (practiceId: string) => {
    if (!isMountedRef.current) return;
    setLoadingCards(true);
    setError('');

    try {
      const { data, error: cardsError } = await supabase
        .from('practice_medication_cards')
        .select('*')
        .eq('practice_id', practiceId);

      if (cardsError) {
        throw cardsError;
      }

      const nextCards = Object.fromEntries(
        (data || []).map((row: { code: string } & PracticeMedicationCardRow) => [row.code, row as PracticeMedicationCardRow]),
      );

      if (isMountedRef.current) {
        setPracticeCards(nextCards);
      }
    } catch (err) {
      console.error('Error loading practice cards:', err);
      if (isMountedRef.current) {
        setError('Unable to load medication cards for this practice.');
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingCards(false);
      }
    }
  }, []);

  const loadPracticeTemplates = useCallback(async (practiceId: string) => {
    try {
      setPracticeTemplateRows(await fetchPracticeCardTemplates(practiceId));
    } catch (err) {
      // Non-blocking: keep medication workflow usable even if this optional table
      // has not been migrated in the environment yet.
      console.warn('Practice template store unavailable, continuing without non-medication practice templates:', err);
      setPracticeTemplateRows([]);
    }
  }, []);

  useEffect(() => {
    const loadGlobalTemplates = async () => {
      try {
        const [healthcheck, screening, immunisation, ltc, configResult] = await Promise.all([
          fetchCardTemplates<HealthCheckTemplatePayload>('healthcheck'),
          fetchCardTemplates<ScreeningTemplate>('screening'),
          fetchCardTemplates<ImmunisationTemplate>('immunisation'),
          fetchCardTemplates<LongTermConditionTemplate>('ltc'),
          supabase.from('platform_config').select('*').eq('id', 1).maybeSingle(),
        ]);

        setGlobalTemplateRows({ healthcheck, screening, immunisation, ltc });
        if (configResult.data) setPlatformConfig(configResult.data as PlatformConfig);
      } catch (err) {
        console.error('Error loading global templates:', err);
      }
    };

    void loadGlobalTemplates();
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    const refreshAdminAccess = async (uid: string) => {
      setIsAdmin(false);
      const role = await getCurrentUserAdminRole(uid);
      if (isMountedRef.current) {
        setIsAdmin(Boolean(role));
      }
    };

    const hydrate = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUserEmail(session.user.email ?? '');
        await refreshAdminAccess(session.user.id);
        await loadMemberships();
      } else {
        setIsAdmin(false);
        navigate(resolvePath('/practice'));
      }
    };

    void hydrate();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      // Token refreshes happen periodically (and can be triggered by same-origin
      // iframes opening, e.g. the medication patient preview). Reloading
      // memberships on every refresh flips loadingPortal and unmounts any open
      // modal, which causes the preview iframe to remount in a loop.
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
        return;
      }

      if (session?.user) {
        setCurrentUserEmail(session.user.email ?? '');
        await refreshAdminAccess(session.user.id);
        await loadMemberships();
      } else {
        setIsAdmin(false);
        navigate(resolvePath('/practice'));
      }
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [loadMemberships, navigate]);

  useEffect(() => {
    if (!selectedPracticeId) {
      setPracticeCards({});
      return;
    }

    safeSessionStorageSet(PRACTICE_SELECTION_STORAGE_KEY, selectedPracticeId);
    void loadPracticeCards(selectedPracticeId);
    void loadPracticeTemplates(selectedPracticeId);
    void loadPendingRequests(selectedPracticeId);
  }, [loadPracticeCards, loadPendingRequests, loadPracticeTemplates, selectedPracticeId]);

  const selectedMembership = useMemo(
    () => memberships.find((membership) => membership.practice_id === selectedPracticeId) || null,
    [memberships, selectedPracticeId],
  );

  const selectedPractice = selectedMembership?.practice || null;

  const globalCount = useMemo(
    () => Object.values(practiceCards).filter((card) => card.source_type === 'global').length,
    [practiceCards],
  );

  const globalLibraryMedications = useMemo(
    () => allMedications.filter((medication) => medication.source !== 'built-in'),
    [allMedications],
  );

  const fallbackOnlyMedicationCount = allMedications.length - globalLibraryMedications.length;

  const customCount = useMemo(
    () => Object.values(practiceCards).filter((card) => card.source_type === 'custom').length,
    [practiceCards],
  );

  const unconfiguredCount = Math.max(allMedications.length - Object.keys(practiceCards).length, 0);

  const legacyReviewCodes = useMemo(() => {
    if (!selectedPractice?.selected_medications) return [];

    return selectedPractice.selected_medications.filter((code) => !practiceCards[code]);
  }, [practiceCards, selectedPractice]);

  const filteredMedications = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return allMedications.filter((medication) => {
      if (!query) return true;

      return [
        medication.code,
        medication.title,
        medication.description,
        medication.category,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [allMedications, deferredSearch]);

  const practiceTemplateMap = useMemo(
    () => Object.fromEntries(practiceTemplateRows.map((row) => [`${row.builder_type}:${row.template_id}`, row])),
    [practiceTemplateRows],
  );

  const nonMedicationTemplates = useMemo(() => {
    const globalRowsByDomain = {
      healthcheck: globalTemplateRows.healthcheck.map((row) => ({
        builderType: 'healthcheck' as const,
        templateId: row.template_id,
        label: row.label,
        payload: row.payload,
        isJsonMode: true,
      })),
      screening: globalTemplateRows.screening.map((row) => ({
          builderType: 'screening' as const,
          templateId: row.template_id,
          label: row.label,
          payload: withScreeningTemplateDefaults(row.payload as ScreeningTemplate),
          isJsonMode: false,
      })),
      immunisation: globalTemplateRows.immunisation.map((row) => ({
          builderType: 'immunisation' as const,
          templateId: row.template_id,
          label: row.label,
          payload: withImmunisationTemplateDefaults(row.payload as ImmunisationTemplate),
          isJsonMode: false,
      })),
      ltc: globalTemplateRows.ltc.map((row) => ({
          builderType: 'ltc' as const,
          templateId: row.template_id,
          label: row.label,
          payload: withLongTermConditionTemplateDefaults(row.payload as LongTermConditionTemplate),
          isJsonMode: false,
      })),
    };

    return globalRowsByDomain;
  }, [globalTemplateRows]);

  const activeTemplateDomain = (activeDomain === 'overview' || activeDomain === 'medication') ? null : activeDomain;
  const selectedDomainTemplates = activeTemplateDomain ? nonMedicationTemplates[activeTemplateDomain] : [];

  const serviceSummaries = useMemo(() => {
    if (!selectedPractice) return [];

    return DASHBOARD_DOMAINS.map((domain) => {
      const isGloballyEnabled = platformServiceEnabled(platformConfig, domain.id);
      const isActive = isGloballyEnabled && domainFeatureEnabled(selectedPractice, domain.id);
      const practiceVersionCount = domain.id === 'medication'
        ? customCount
        : practiceTemplateRows.filter((row) => row.builder_type === domain.id).length;
      const totalTemplateCount = domain.id === 'medication'
        ? allMedications.length
        : nonMedicationTemplates[domain.id].length;

      return {
        ...domain,
        isActive,
        isGloballyEnabled,
        practiceVersionCount,
        totalTemplateCount,
      };
    });
  }, [allMedications.length, customCount, nonMedicationTemplates, platformConfig, practiceTemplateRows, selectedPractice]);

  const activeServiceSummaries = serviceSummaries.filter((service) => service.isActive);

  useEffect(() => {
    if (!selectedPractice || serviceSummaries.length === 0) return;
    if (activeDomain === 'overview') return;
    if (serviceSummaries.some((service) => service.id === activeDomain && service.isActive)) return;

    const firstActiveService = serviceSummaries.find((service) => service.isActive);
    if (firstActiveService) {
      setActiveDomain(firstActiveService.id);
      setDraft(null);
      setTemplateDraft(null);
    }
  }, [activeDomain, selectedPractice, serviceSummaries]);

  const lastAccessedLabel = selectedPractice?.last_accessed
    ? new Date(selectedPractice.last_accessed).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'No patient visits yet';

  const satisfactionLabel = useMemo(() => {
    if (!selectedPractice) return 'No ratings';

    const count = selectedPractice.patient_rating_count ?? 0;
    const total = selectedPractice.patient_rating_total ?? 0;
    if (count <= 0) return 'No ratings';

    return `${(total / count).toFixed(1)}/5`;
  }, [selectedPractice]);


  const openCustomEditor = (medication: MedicationRecord) => {
    const practiceCard = practiceCards[medication.code];
    const preview = buildMedicationPreview(medication, practiceCard);

    setDraftCode(medication.code);
    setDraft({
      code: medication.code,
      title: preview.title,
      description: preview.description,
      badge: preview.badge,
      category: preview.category,
      keyInfoMode: preview.keyInfoMode || 'do',
      keyInfo: preview.keyInfo.length > 0 ? preview.keyInfo : [''],
      nhsLink: preview.nhsLink || '',
      trendLinks: preview.trendLinks.length > 0 ? preview.trendLinks : [{ ...EMPTY_TREND_LINK }],
      sickDaysNeeded: Boolean(preview.sickDaysNeeded),
      reviewMonths: preview.reviewMonths || 12,
      contentReviewDate: preview.contentReviewDate || '',
    });
    setSuccessMessage('');
  };

  const resetEditor = () => {
    setDraft(null);
    setDraftCode('');
  };

  const openTemplateEditor = (
    builderType: PracticeTemplateBuilderType,
    templateId: string,
    label: string,
    payload: unknown,
    isJsonMode: boolean,
  ) => {
    const customRow = practiceTemplateMap[`${builderType}:${templateId}`];
    const effectivePayload = customRow?.payload || payload;
    const editablePayload = isEditablePatientTemplate(effectivePayload) ? effectivePayload : null;

    setTemplateDraft({
      builderType,
      templateId,
      label: customRow?.label || label,
      headline: editablePayload?.headline || '',
      explanation: editablePayload?.explanation || '',
      importantMessage: editablePayload && 'importantMessage' in editablePayload ? String(editablePayload.importantMessage || '') : '',
      guidanceText: editablePayload?.guidance.join('\n') || '',
      linksText: editablePayload ? resourceLinksToText(editablePayload.nhsLinks) : '',
      payloadJson: JSON.stringify(effectivePayload, null, 2),
      isJsonMode,
    });
  };

  const buildTemplateDraftPayload = (draftValue: PracticeTemplateDraft) => {
    const globalTemplate = selectedDomainTemplates.find((template) => template.templateId === draftValue.templateId);

    if (draftValue.isJsonMode) {
      const submittedPayload = JSON.parse(draftValue.payloadJson) as unknown;
      if (draftValue.builderType !== 'healthcheck') return submittedPayload;

      const globalPayload = isObjectRecord(globalTemplate?.payload) ? globalTemplate.payload as HealthCheckTemplatePayload : null;
      const submitted = isObjectRecord(submittedPayload) ? submittedPayload : {};
      const submittedVariants = isObjectRecord(submitted.variants) ? submitted.variants : {};
      const lockedVariants = Object.fromEntries(
        Object.entries(globalPayload?.variants || {}).map(([resultCode, globalVariant]) => {
          const submittedVariant = isObjectRecord(submittedVariants[resultCode]) ? submittedVariants[resultCode] : {};
          return [
            resultCode,
            {
              ...globalVariant,
              ...submittedVariant,
              resultCode: globalVariant.resultCode || resultCode,
            },
          ];
        }),
      );
      const { id: _id, code: _code, templateId: _templateId, variants: _variants, ...rest } = submitted;

      return {
        ...rest,
        variants: lockedVariants,
      };
    }

    const basePayload = globalTemplate?.payload;
    const existing = isEditablePatientTemplate(basePayload) ? basePayload : null;
    if (!existing) {
      throw new Error('Unable to build template payload.');
    }

    return {
      ...existing,
      label: draftValue.label.trim(),
      headline: draftValue.headline.trim(),
      explanation: draftValue.explanation.trim(),
      importantMessage: draftValue.importantMessage.trim(),
      guidance: draftValue.guidanceText.split('\n').map((item) => item.trim()).filter(Boolean),
      nhsLinks: textToResourceLinks(draftValue.linksText),
    };
  };

  const updateDraft = <K extends keyof CustomCardDraft>(key: K, value: CustomCardDraft[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const updateKeyInfo = (index: number, value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const next = [...current.keyInfo];
      next[index] = value;
      return { ...current, keyInfo: next };
    });
  };

  const addKeyInfo = () => {
    setDraft((current) => current ? { ...current, keyInfo: [...current.keyInfo, ''] } : current);
  };

  const removeKeyInfo = (index: number) => {
    setDraft((current) => {
      if (!current) return current;
      const next = current.keyInfo.filter((_, currentIndex) => currentIndex !== index);
      return { ...current, keyInfo: next.length > 0 ? next : [''] };
    });
  };

  const updateTrendLink = (index: number, field: 'title' | 'url', value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const next = [...current.trendLinks];
      next[index] = { ...next[index], [field]: value };
      return { ...current, trendLinks: next };
    });
  };

  const addTrendLink = () => {
    setDraft((current) => current ? { ...current, trendLinks: [...current.trendLinks, { ...EMPTY_TREND_LINK }] } : current);
  };

  const removeTrendLink = (index: number) => {
    setDraft((current) => {
      if (!current) return current;
      const next = current.trendLinks.filter((_, currentIndex) => currentIndex !== index);
      return { ...current, trendLinks: next.length > 0 ? next : [{ ...EMPTY_TREND_LINK }] };
    });
  };

  const invokeAndReload = async (fn: () => Promise<void>, success: string) => {
    setSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      await fn();
      await loadPracticeCards(selectedPracticeId);
      await loadMemberships();
      setSuccessMessage(success);
    } catch (err) {
      console.error(err);
      setError(await getFunctionErrorMessage(err, 'Something went wrong.'));
    } finally {
      setSaving(false);
      setDisclaimerRequest(null);
      setConfirmDialog(null);
    }
  };

  const applyGlobalTemplate = async (code: string) => {
    const { error: invokeError } = await supabase.functions.invoke('accept-global-medication-card', {
      body: {
        practiceId: selectedPracticeId,
        code,
        disclaimerAccepted: true,
      },
    });

    if (invokeError) {
      throw invokeError;
    }
  };

  const acceptGlobalCard = (medication: MedicationRecord, confirmLabel = 'Accept Global Template') => {
    if (!selectedPracticeId) return;

    if (medication.source === 'built-in') {
      setError(`Medication ${medication.code} is only available as a local fallback. Seed it into the Supabase medications table before accepting it as a global template.`);
      return;
    }

    setDisclaimerRequest({
      title: 'Accept Global Template',
      message: GLOBAL_TEMPLATE_DISCLAIMER_TEXT,
      checkboxLabel: 'I have reviewed this template and accept responsibility for deciding whether it is suitable for my practice.',
      confirmLabel,
      onConfirm: async () => {
        await invokeAndReload(
          async () => {
            await applyGlobalTemplate(medication.code);
          },
          `${medication.code} is now using the global template.`,
        );
      },
    });
  };

  const acceptAllGlobalCards = () => {
    if (!selectedPracticeId || allMedications.length === 0) return;

    if (globalLibraryMedications.length === 0) {
      setError('No Supabase-backed global medication templates are available yet. Seed the medications table, then try again.');
      return;
    }

    setDisclaimerRequest({
      title: 'Accept All Global Templates',
      message:
        'This will apply the shared global template to every medication code in this practice, replacing any practice-specific versions. You can recreate practice versions later if needed.',
      checkboxLabel: 'I have reviewed this action and understand it will switch every medication code to the shared global template.',
      confirmLabel: 'Accept All Global',
      onConfirm: async () => {
        await invokeAndReload(
          async () => {
            for (const medication of globalLibraryMedications) {
              await applyGlobalTemplate(medication.code);
            }
          },
          fallbackOnlyMedicationCount > 0
            ? `${globalLibraryMedications.length} Supabase-backed medication codes are now using the global template. ${fallbackOnlyMedicationCount} fallback-only codes need seeding before they can be accepted.`
            : `All ${globalLibraryMedications.length} medication codes are now using the global template.`,
        );
      },
    });
  };

  const saveTemplateDraft = () => {
    if (!selectedPracticeId || !templateDraft) return;

    const isPublishedGlobalTemplate = globalTemplateRows[templateDraft.builderType].some(
      (row) => row.template_id === templateDraft.templateId,
    );
    if (!isPublishedGlobalTemplate) {
      setError('This template is no longer available in the admin library. Practice versions can only be created from admin templates.');
      setTemplateDraft(null);
      return;
    }

    setDisclaimerRequest({
      title: 'Save Practice Template',
      message: CUSTOM_CARD_DISCLAIMER_TEXT,
      checkboxLabel: 'I understand that my practice is responsible for this custom patient information.',
      confirmLabel: 'Save Practice Template',
      onConfirm: async () => {
        await invokeAndReload(async () => {
          const payload = buildTemplateDraftPayload(templateDraft);
          await savePracticeCardTemplate({
            practiceId: selectedPracticeId,
            builderType: templateDraft.builderType,
            templateId: templateDraft.templateId,
            label: templateDraft.label.trim(),
            payload,
          });
          await loadPracticeTemplates(selectedPracticeId);
          setTemplateDraft(null);
        }, `${templateDraft.label} now has a practice-specific version.`);
      },
    });
  };

  const clearTemplateCustomisation = (builderType: PracticeTemplateBuilderType, templateId: string, label: string) => {
    if (!selectedPracticeId) return;

    setConfirmDialog({
      title: 'Clear Practice Template',
      message: `Remove the practice-specific version for ${label}? Patients will see the shared global template instead.`,
      confirmLabel: 'Clear Practice Version',
      isDangerous: true,
      onConfirm: () => {
        void invokeAndReload(async () => {
          await clearPracticeCardTemplate(selectedPracticeId, builderType, templateId);
          await loadPracticeTemplates(selectedPracticeId);
        }, `${label} is now using the shared global template.`);
      },
    });
  };

  const clearConfiguredCard = (medication: MedicationRecord) => {
    if (!selectedPracticeId) return;

    setConfirmDialog({
      title: 'Clear Practice Configuration',
      message: `Remove the configuration for ${medication.code}? Patients will see a placeholder for this medication until your practice accepts the global template or creates a custom version.`,
      confirmLabel: 'Clear Configuration',
      isDangerous: true,
      onConfirm: () => {
        void invokeAndReload(async () => {
          const { error: invokeError } = await supabase.functions.invoke('clear-practice-medication-card', {
            body: { practiceId: selectedPracticeId, code: medication.code },
          });

          if (invokeError) {
            throw invokeError;
          }
        }, `${medication.code} is now unconfigured for this practice.`);
      },
    });
  };

  const saveCustomDraft = () => {
    if (!selectedPracticeId || !draft) return;

    if (!draft.title.trim() || !draft.description.trim() || !draft.category.trim()) {
      setError('Title, description, and category are required for a practice version.');
      return;
    }

    setDisclaimerRequest({
      title: 'Save Practice Version',
      message: CUSTOM_CARD_DISCLAIMER_TEXT,
      checkboxLabel: 'I understand that my practice is responsible for this custom medication content.',
      confirmLabel: 'Save Practice Version',
      onConfirm: async () => {
        await invokeAndReload(async () => {
              const { error: invokeError } = await supabase.functions.invoke('save-practice-medication-card', {
                body: {
                  practiceId: selectedPracticeId,
                  code: draft.code,
                  title: draft.title,
                  description: draft.description,
                  badge: draft.badge,
                  category: draft.category,
                  keyInfoMode: draft.keyInfoMode,
                  keyInfo: draft.keyInfo,
                  nhsLink: draft.nhsLink,
              trendLinks: draft.trendLinks,
              sickDaysNeeded: draft.sickDaysNeeded,
              reviewMonths: draft.reviewMonths,
              contentReviewDate: draft.contentReviewDate,
              disclaimerAccepted: true,
            },
          });

          if (invokeError) {
            throw invokeError;
          }
        }, `${draft.code} is now using a practice-specific version.`);

        resetEditor();
      },
    });
  };

  // Render the preview modal at the top level so it remains mounted across
  // any transient loading-state flips. The medication preview iframe is
  // same-origin and its Supabase client can fire auth events that trigger
  // background refreshes; if those flip an early-return guard, the modal
  // would unmount and the iframe would flash repeatedly.
  const previewModal = previewMed
    ? <MedicationPreviewModal med={previewMed} onClose={() => setPreviewMed(null)} />
    : null;

  let bodyContent: React.ReactNode;
  if (loadingPortal || loadingMedications) {
    bodyContent = (
      <div style={{ maxWidth: '820px', margin: '2rem auto' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <FlaskConical size={48} color="#005eb8" style={{ marginBottom: '1rem' }} />
          <h1 style={{ fontSize: '1.25rem' }}>Loading your practice workspace...</h1>
        </div>
      </div>
    );
  } else if (!selectedPractice) {
    bodyContent = (
      <div style={{ maxWidth: '820px', margin: '2rem auto' }}>
        <div className="card" style={{ textAlign: 'center', borderLeft: '4px solid #d5281b' }}>
          <h1 style={{ fontSize: '1.25rem', color: '#d5281b' }}>Practice Access Error</h1>
          <p>{error || 'No practice is linked to this account. Contact your administrator.'}</p>
        </div>
      </div>
    );
  } else {
    bodyContent = (
      <>
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          isDangerous={confirmDialog.isDangerous}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {disclaimerRequest && (
        <DisclaimerDialog
          title={disclaimerRequest.title}
          message={disclaimerRequest.message}
          checkboxLabel={disclaimerRequest.checkboxLabel}
          confirmLabel={disclaimerRequest.confirmLabel}
          onCancel={() => setDisclaimerRequest(null)}
          onConfirm={() => void disclaimerRequest.onConfirm()}
        />
      )}

      <div className="practice-portal-shell">
        {/* Sidebar */}
        <div className="practice-portal-sidebar">
          <div className="practice-portal-sidebar__brand">
            <div>
              <div className="practice-portal-sidebar__brand-name">MyMed<span>Info</span></div>
              <span className="practice-portal-sidebar__brand-badge">Practice Portal</span>
            </div>
          </div>

          <div className="practice-portal-sidebar__body">
            <div className="practice-portal-sidebar__practice-box">
              <div className="practice-portal-sidebar__practice-label">Current Practice</div>
              <div className="practice-portal-sidebar__practice-name">{selectedPractice.name}</div>
              {memberships.length > 1 && (
                <div className="practice-portal-sidebar__practice-switch">
                  <label className="practice-portal-sidebar__practice-switch-label" htmlFor="practice-switcher">
                    Switch practice
                  </label>
                  <select
                    id="practice-switcher"
                    className="practice-portal-sidebar__practice-select"
                    value={selectedPracticeId}
                    onChange={(e) => setSelectedPracticeId(e.target.value)}
                  >
                    {memberships.map((m) => (
                      <option key={m.practice_id} value={m.practice_id}>
                        {m.practice.name}{m.practice.is_active ? '' : ' (Inactive)'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button
              type="button"
              className={['practice-portal-nav-item', activeDomain === 'overview' ? 'practice-portal-nav-item--active' : ''].filter(Boolean).join(' ')}
              onClick={() => { setActiveDomain('overview'); setDraft(null); setTemplateDraft(null); }}
            >
              <LayoutDashboard size={15} aria-hidden="true" />
              <span>Overview</span>
            </button>

            <span className="practice-portal-sidebar__section-label">Services</span>
            {serviceSummaries.map((service) => {
              const requestSent = pendingRequests.has(service.id);
              const serviceClassName = [
                'practice-portal-nav-item',
                activeDomain === service.id && service.isActive ? 'practice-portal-nav-item--active' : '',
                !service.isActive ? 'practice-portal-nav-item--disabled' : '',
              ].filter(Boolean).join(' ');
              const title = !service.isActive
                ? service.isGloballyEnabled
                  ? `${service.label} not enabled for this practice`
                  : `${service.label} is not currently available on this platform`
                : undefined;

              if (!service.isActive && service.isGloballyEnabled) {
                return (
                  <div key={service.id} className={serviceClassName} title={title}>
                    {DOMAIN_ICONS[service.id]}
                    <span className="practice-portal-nav-item__label">{service.label}</span>
                    <button
                      type="button"
                      className="practice-portal-service-request"
                      onClick={() => void requestServiceActivation(service.id, selectedPractice.name)}
                      title={requestSent ? 'Request already sent' : 'Request activation from admin'}
                      disabled={requestSent}
                    >
                      {requestSent ? 'Requested' : 'Request'}
                    </button>
                  </div>
                );
              }

              return (
                <button
                  key={service.id}
                  type="button"
                  className={serviceClassName}
                  onClick={() => {
                    if (service.isActive) {
                      setActiveDomain(service.id);
                      setDraft(null);
                      setTemplateDraft(null);
                    }
                  }}
                  disabled={!service.isGloballyEnabled}
                  title={title}
                >
                  {DOMAIN_ICONS[service.id]}
                  <span className="practice-portal-nav-item__label">{service.label}</span>
                  {!service.isGloballyEnabled && (
                    <span className="practice-portal-service-unavailable">
                      Unavailable
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="practice-portal-sidebar__bottom">
            {isAdmin && (
              <button
                type="button"
                className="practice-portal-nav-item"
                onClick={() => navigate(resolvePath('/admin/dashboard'))}
                style={{ width: '100%', color: '#fbbf24' }}
              >
                <LayoutDashboard size={15} aria-hidden="true" />
                <span>Admin portal</span>
              </button>
            )}
            <button type="button" className="practice-portal-nav-item" onClick={() => void handleSignOut()} style={{ width: '100%' }}>
              <LogOut size={15} aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </div>

        {/* Right: topbar + content */}
        <div className="practice-portal-right">
          <div className="practice-portal-topbar">
            <div className="practice-portal-topbar__left">
              <span className="practice-portal-topbar__crumb">{selectedPractice.name}</span>
              <span className="practice-portal-topbar__sep">/</span>
              <span className="practice-portal-topbar__title">
                {activeDomain === 'overview' ? 'Overview' : (DASHBOARD_DOMAINS.find((d) => d.id === activeDomain)?.label ?? 'Dashboard')}
              </span>
            </div>
            <div className="practice-portal-topbar__right">
              <div className="practice-portal-topbar__avatar" aria-hidden="true">
                {currentUserEmail ? currentUserEmail.slice(0, 2).toUpperCase() : 'P'}
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{currentUserEmail}</span>
            </div>
          </div>

          <div className="practice-portal-content">
          {!selectedPractice.is_active && (
            <div className="dashboard-banner dashboard-banner--info" style={{ marginBottom: '1rem' }}>
              This practice is currently inactive. You can still review and prepare medication cards, but patient links will not validate until the practice is activated by an administrator.
            </div>
          )}

          {error && (
            <div className="dashboard-banner dashboard-banner--error" style={{ marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          {successMessage && (
            <div className="dashboard-banner dashboard-banner--success" style={{ marginBottom: '1rem' }}>
              <CheckCircle size={18} /> {successMessage}
            </div>
          )}

      {activeServiceSummaries.length === 0 && (
        <div className="dashboard-banner dashboard-banner--info" style={{ marginBottom: '1rem' }}>
          No services are active for this practice yet. Ask a global administrator to activate the required services before accepting or personalising cards.
        </div>
      )}

      {activeTemplateDomain && domainFeatureEnabled(selectedPractice, activeTemplateDomain) && (
        <div className="dashboard-panel dashboard-section">
          <div className="dashboard-panel-header">
            <div>
              <h2 className="dashboard-panel-title">{NON_MEDICATION_DOMAIN_LABELS[activeTemplateDomain]} Templates</h2>
              <p className="dashboard-panel-subtitle">
                Create practice-specific versions of shared templates. Patients will see your practice version when one exists.
              </p>
            </div>
            {selectedPractice[DOMAIN_FEATURE_KEY[activeTemplateDomain]] !== true && (
              <span className="admin-ods-badge" style={{ background: '#fff7ed', color: '#b45309', flexShrink: 0 }}>Not enabled for patients yet</span>
            )}
          </div>

          {selectedDomainTemplates.length === 0 ? (
            <p style={{ color: '#4c6272', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              No shared templates were found for this domain yet. Add a global template in the admin card builder first.
            </p>
          ) : (
            <div className="admin-data-table-wrap">
              <table className="admin-data-table" style={{ minWidth: 580 }}>
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Code</th>
                    <th>Version</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDomainTemplates.map((template) => {
                    const customRow = practiceTemplateMap[`${template.builderType}:${template.templateId}`];
                    const state = customRow ? 'custom' : 'global';

                    return (
                      <tr key={`${template.builderType}-${template.templateId}`}>
                        <td style={{ fontWeight: 600, color: '#0f172a' }}>{customRow?.label || template.label}</td>
                        <td>
                          <span className="admin-ods-badge">
                            {getTemplateDisplayCode(template.builderType, template.templateId, customRow?.payload || template.payload)}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span className="admin-status-dot" aria-hidden="true">
                              <span
                                className="admin-status-dot__circle"
                                style={{ background: state === 'custom' ? '#007f3b' : '#005eb8' }}
                              />
                            </span>
                            <span className="admin-table-muted">
                              {state === 'custom' ? 'Practice version' : 'Global template'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="admin-table-actions">
                            <button
                              type="button"
                              className="admin-action-btn admin-action-btn--edit"
                              onClick={() => openTemplateEditor(template.builderType, template.templateId, template.label, template.payload, template.isJsonMode)}
                            >
                              <Edit2 size={13} /> {state === 'custom' ? 'Edit version' : 'Create version'}
                            </button>
                            {customRow && (
                              <button
                                type="button"
                                className="admin-action-btn admin-action-btn--icon"
                                title="Clear practice version"
                                onClick={() => clearTemplateCustomisation(template.builderType, template.templateId, customRow.label || template.label)}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {templateDraft && activeTemplateDomain && domainFeatureEnabled(selectedPractice, activeTemplateDomain) && (
        <Modal
          isOpen={Boolean(templateDraft)}
          onClose={() => setTemplateDraft(null)}
          title={`Practice Template: ${templateDraft.label}`}
          subtitle={`Personalise this template for ${selectedPractice.name}.`}
          size="lg"
          footer={
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setTemplateDraft(null)} className="dashboard-pill-button dashboard-pill-button--muted">
                Cancel
              </button>
              <button onClick={saveTemplateDraft} disabled={saving} className="action-button" style={{ backgroundColor: '#007f3b', opacity: saving ? 0.7 : 1 }}>
                <Save size={16} /> {saving ? 'Saving...' : 'Save Practice Template'}
              </button>
            </div>
          }
        >
          {templateDraft.isJsonMode ? (
            <div className="dashboard-field">
              <label>Template JSON</label>
              <textarea
                value={templateDraft.payloadJson}
                rows={18}
                onChange={(event) => setTemplateDraft((current) => current ? { ...current, payloadJson: event.target.value } : current)}
                style={{ width: '100%', padding: '0.75rem', border: '2px solid #d8dde0', borderRadius: '8px', resize: 'vertical', fontFamily: 'monospace' }}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="dashboard-field">
                <label>Label</label>
                <input value={templateDraft.label} onChange={(event) => setTemplateDraft((current) => current ? { ...current, label: event.target.value } : current)} />
              </div>
              <div className="dashboard-field">
                <label>Headline</label>
                <input value={templateDraft.headline} onChange={(event) => setTemplateDraft((current) => current ? { ...current, headline: event.target.value } : current)} />
              </div>
              <div className="dashboard-field">
                <label>Explanation</label>
                <textarea value={templateDraft.explanation} rows={4} onChange={(event) => setTemplateDraft((current) => current ? { ...current, explanation: event.target.value } : current)} style={{ width: '100%', padding: '0.75rem', border: '2px solid #d8dde0', borderRadius: '8px', resize: 'vertical' }} />
              </div>
              <div className="dashboard-field">
                <label>Important message</label>
                <textarea value={templateDraft.importantMessage} rows={3} onChange={(event) => setTemplateDraft((current) => current ? { ...current, importantMessage: event.target.value } : current)} style={{ width: '100%', padding: '0.75rem', border: '2px solid #d8dde0', borderRadius: '8px', resize: 'vertical' }} />
              </div>
              <div className="dashboard-field">
                <label>Guidance points (one per line)</label>
                <textarea value={templateDraft.guidanceText} rows={6} onChange={(event) => setTemplateDraft((current) => current ? { ...current, guidanceText: event.target.value } : current)} style={{ width: '100%', padding: '0.75rem', border: '2px solid #d8dde0', borderRadius: '8px', resize: 'vertical' }} />
              </div>
              <div className="dashboard-field">
                <label>Resource links (title | url | description)</label>
                <textarea value={templateDraft.linksText} rows={6} onChange={(event) => setTemplateDraft((current) => current ? { ...current, linksText: event.target.value } : current)} style={{ width: '100%', padding: '0.75rem', border: '2px solid #d8dde0', borderRadius: '8px', resize: 'vertical' }} />
              </div>
            </div>
          )}
        </Modal>
      )}

      {activeDomain === 'overview' && (
        <>
          <div className="admin-stat-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="admin-stat-card">
              <div className="admin-stat-card__value">{globalCount}</div>
              <div className="admin-stat-card__label">Using Global Templates</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-card__value">{customCount}</div>
              <div className="admin-stat-card__label">Practice Versions</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-card__value">{unconfiguredCount}</div>
              <div className="admin-stat-card__label">Unconfigured Codes</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-card__value">{selectedPractice.link_visit_count ?? 0}</div>
              <div className="admin-stat-card__label">Patient Link Uses</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-card__value" style={{ fontSize: '1.2rem' }}>{lastAccessedLabel}</div>
              <div className="admin-stat-card__label">Last Patient Access</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-card__value" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {satisfactionLabel}
                {satisfactionLabel !== 'No ratings' && <Star size={20} fill="#fbc02d" color="#fbc02d" />}
              </div>
              <div className="admin-stat-card__label">Patient Rating</div>
            </div>
          </div>

          <div className="dashboard-panel dashboard-section">
            <div className="dashboard-panel-header">
              <div>
                <h2 className="dashboard-panel-title">Services</h2>
                <p className="dashboard-panel-subtitle">Active services enabled for this practice.</p>
              </div>
            </div>
            <div className="admin-data-table-wrap">
              <table className="admin-data-table" style={{ minWidth: 500 }}>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Templates</th>
                    <th>Practice Versions</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceSummaries.map((service) => (
                    <tr key={service.id}>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {DOMAIN_ICONS[service.id]}
                          {service.label}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className={`admin-status-dot admin-status-dot--${service.isActive ? 'active' : 'inactive'}`} aria-hidden="true">
                            <span className="admin-status-dot__circle" />
                          </span>
                          <span className="admin-table-muted">{service.isActive ? 'Active' : 'Not enabled'}</span>
                          {!service.isActive && service.isGloballyEnabled && (
                            <button
                              type="button"
                              className="admin-action-btn admin-action-btn--edit"
                              disabled={pendingRequests.has(service.id)}
                              onClick={() => void requestServiceActivation(service.id, selectedPractice.name)}
                              style={{ marginLeft: '0.25rem', opacity: pendingRequests.has(service.id) ? 0.6 : 1 }}
                            >
                              {pendingRequests.has(service.id) ? 'Requested' : 'Request activation'}
                            </button>
                          )}
                          {!service.isActive && !service.isGloballyEnabled && (
                            <span className="admin-table-muted">Unavailable</span>
                          )}
                        </div>
                      </td>
                      <td className="admin-table-muted">{service.totalTemplateCount}</td>
                      <td className="admin-table-muted">{service.practiceVersionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {legacyReviewCodes.length > 0 && (
            <div className="dashboard-panel dashboard-section" style={{ borderLeft: '4px solid #fa8c16' }}>
              <div className="dashboard-panel-header">
                <div>
                  <h2 className="dashboard-panel-title">Previously Live Cards To Review</h2>
                  <p className="dashboard-panel-subtitle">
                    These codes were previously selected in the legacy workflow. They are not active until your practice explicitly accepts the global template or saves a custom version.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                {legacyReviewCodes.map((code) => (
                  <span key={code} className="admin-ods-badge">{code}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeDomain === 'medication' && domainFeatureEnabled(selectedPractice, 'medication') && (
        <>

      {draft && (
        <Modal
          isOpen={Boolean(draft)}
          onClose={resetEditor}
          title={`Practice Version: ${draft.code}`}
          subtitle="Save a practice-specific medication card for this code."
          size="xl"
          footer={
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={resetEditor} className="dashboard-pill-button dashboard-pill-button--muted">
                Cancel
              </button>
              <button
                onClick={() => {
                  const baseMedication = allMedications.find((medication) => medication.code === draftCode);
                  if (!baseMedication) return;

                  setPreviewMed(buildMedicationPreview(baseMedication, {
                    practice_id: selectedPracticeId,
                    code: draft.code,
                    source_type: 'custom',
                    title: draft.title,
                    description: draft.description,
                    badge: draft.badge,
                    category: draft.category,
                    key_info_mode: draft.keyInfoMode,
                    key_info: draft.keyInfo,
                    do_key_info: draft.keyInfoMode === 'do' ? draft.keyInfo.filter((item) => item.trim()) : [],
                    dont_key_info: draft.keyInfoMode === 'dont' ? draft.keyInfo.filter((item) => item.trim()) : [],
                    general_key_info: [],
                    nhs_link: draft.nhsLink,
                    trend_links: draft.trendLinks,
                    sick_days_needed: draft.sickDaysNeeded,
                    review_months: draft.reviewMonths,
                    content_review_date: draft.contentReviewDate,
                    disclaimer_version: '',
                  }));
                }}
                className="action-button"
                style={{ backgroundColor: '#005eb8' }}
              >
                <Eye size={16} /> Preview
              </button>
              <button onClick={saveCustomDraft} disabled={saving} className="action-button" style={{ backgroundColor: '#007f3b', opacity: saving ? 0.7 : 1 }}>
                <Save size={16} /> {saving ? 'Saving...' : 'Save Practice Version'}
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="dashboard-field">
                <label>Title *</label>
                <input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} />
              </div>

              <div className="dashboard-field">
                <label>Description *</label>
                <textarea
                  value={draft.description}
                  rows={4}
                  onChange={(event) => updateDraft('description', event.target.value)}
                  style={{ width: '100%', padding: '0.75rem', border: '2px solid #d8dde0', borderRadius: '8px', resize: 'vertical' }}
                />
              </div>

              <div className="dashboard-form-grid">
                <div className="dashboard-field">
                  <label>Badge</label>
                  <select value={draft.badge} onChange={(event) => updateDraft('badge', event.target.value as CustomCardDraft['badge'])}>
                    <option value="NEW">New Medication</option>
                    <option value="REAUTH">Annual Review</option>
                    <option value="GENERAL">General Information</option>
                  </select>
                </div>
                <div className="dashboard-field">
                  <label>Category *</label>
                  <input value={draft.category} onChange={(event) => updateDraft('category', event.target.value)} />
                </div>
                <div className="dashboard-field">
                  <label>Review Period (months)</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={draft.reviewMonths}
                    onChange={(event) => updateDraft('reviewMonths', Math.max(1, parseInt(event.target.value, 10) || 12))}
                  />
                </div>
                <div className="dashboard-field">
                  <label>Content Review Date</label>
                  <input
                    type="date"
                    value={draft.contentReviewDate}
                    onChange={(event) => updateDraft('contentReviewDate', event.target.value)}
                  />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={draft.sickDaysNeeded}
                  onChange={(event) => updateDraft('sickDaysNeeded', event.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                Sick day rules apply
              </label>

              <div>
                <div className="dashboard-panel-header" style={{ marginBottom: '0.5rem' }}>
                  <h3 className="dashboard-panel-title" style={{ fontSize: '1rem' }}>Key Information</h3>
                  <div className="dashboard-segmented-control" aria-label="Key information mode">
                    <button type="button" onClick={() => setDraft((current) => current ? { ...current, keyInfoMode: 'do' } : current)} className={`dashboard-segmented-control__item ${draft.keyInfoMode === 'do' ? 'dashboard-segmented-control__item--active' : ''}`}>Do</button>
                    <button type="button" onClick={() => setDraft((current) => current ? { ...current, keyInfoMode: 'dont' } : current)} className={`dashboard-segmented-control__item ${draft.keyInfoMode === 'dont' ? 'dashboard-segmented-control__item--active' : ''}`}>Don't</button>
                  </div>
                  <button onClick={addKeyInfo} className="dashboard-pill-button dashboard-pill-button--primary">
                    <Plus size={14} /> Add Point
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {draft.keyInfo.map((info, index) => (
                    <div key={`${draft.code}-key-${index}`} style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        value={info}
                        onChange={(event) => updateKeyInfo(index, event.target.value)}
                        placeholder={`Key point ${index + 1}`}
                        style={{ flex: 1, padding: '0.75rem', border: '2px solid #d8dde0', borderRadius: '8px' }}
                      />
                      <button onClick={() => removeKeyInfo(index)} className="dashboard-pill-button dashboard-pill-button--danger">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="dashboard-field">
                <label>NHS Link</label>
                <input value={draft.nhsLink} onChange={(event) => updateDraft('nhsLink', event.target.value)} />
              </div>

              <div>
                <div className="dashboard-panel-header" style={{ marginBottom: '0.5rem' }}>
                  <h3 className="dashboard-panel-title" style={{ fontSize: '1rem' }}>Linked Resources</h3>
                  <button onClick={addTrendLink} className="dashboard-pill-button dashboard-pill-button--primary">
                    <Plus size={14} /> Add Link
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {draft.trendLinks.map((link, index) => (
                    <div key={`${draft.code}-link-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr auto', gap: '0.5rem' }}>
                      <input
                        value={link.title}
                        onChange={(event) => updateTrendLink(index, 'title', event.target.value)}
                        placeholder="Link title"
                        style={{ padding: '0.75rem', border: '2px solid #d8dde0', borderRadius: '8px' }}
                      />
                      <input
                        value={link.url}
                        onChange={(event) => updateTrendLink(index, 'url', event.target.value)}
                        placeholder="https://..."
                        style={{ padding: '0.75rem', border: '2px solid #d8dde0', borderRadius: '8px' }}
                      />
                      <button onClick={() => removeTrendLink(index)} className="dashboard-pill-button dashboard-pill-button--danger">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
        </Modal>
      )}

      <div className="dashboard-panel dashboard-section">
        <div className="dashboard-panel-header">
          <div>
            <h2 className="dashboard-panel-title">Medication Library</h2>
            <p className="dashboard-panel-subtitle">
              Each code can be left unconfigured, linked to the shared global template, or maintained as a practice-owned version.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
            <input
              type="text"
              value={librarySearch}
              onChange={(event) => setLibrarySearch(event.target.value)}
              placeholder="Search medications…"
              style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #d1d5db', borderRadius: '6px', fontSize: '0.84rem', width: '220px' }}
            />
            <button
              type="button"
              onClick={acceptAllGlobalCards}
              className="admin-action-btn admin-action-btn--edit"
              disabled={globalLibraryMedications.length === 0}
            >
              <CheckCircle size={13} /> Accept All Global
            </button>
          </div>
        </div>
        {fallbackOnlyMedicationCount > 0 && (
          <p style={{ margin: '0 0 0.75rem', color: '#8a5f00', fontSize: '0.83rem' }}>
            {fallbackOnlyMedicationCount} medication code{fallbackOnlyMedicationCount === 1 ? '' : 's'} need seeding into Supabase before they can be accepted as global templates.
          </p>
        )}
        {loadingCards ? (
          <p style={{ color: '#4c6272', fontSize: '0.9rem' }}>Loading medication configuration…</p>
        ) : (
          <div className="admin-data-table-wrap">
            <table className="admin-data-table admin-data-table--medications">
              <thead>
                <tr>
                  <th>Medication</th>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Version</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMedications.map((medication) => {
                  const practiceCard = practiceCards[medication.code];
                  const state: 'global' | 'custom' | 'unconfigured' = practiceCard?.source_type ?? 'unconfigured';
                  const canAcceptGlobalTemplate = medication.source !== 'built-in';

                  return (
                    <tr key={medication.code}>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{medication.title}</td>
                      <td><span className="admin-ods-badge">{medication.code}</span></td>
                      <td>
                        <span className="admin-ods-badge" style={{
                          background: medication.badge === 'NEW' ? '#e8f1ff' : medication.badge === 'REAUTH' ? '#e6f4ea' : '#f1f5f9',
                          color: medication.badge === 'NEW' ? '#005eb8' : medication.badge === 'REAUTH' ? '#007f3b' : '#475569',
                        }}>
                          {medication.badge}
                        </span>
                      </td>
                      <td><span className="admin-ods-badge" style={{ background: '#fff7ed', color: '#b45309' }}>{medication.category}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span className="admin-status-dot" aria-hidden="true">
                            <span
                              className="admin-status-dot__circle"
                              style={{ background: state === 'custom' ? '#007f3b' : state === 'global' ? '#005eb8' : '#94a3b8' }}
                            />
                          </span>
                          <span className="admin-table-muted">
                            {state === 'custom' ? 'Practice version' : state === 'global' ? 'Global template' : 'Not configured'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="admin-table-actions">
                          <button
                            type="button"
                            className="admin-action-btn admin-action-btn--icon"
                            title={state === 'custom' ? 'Preview practice version' : 'Preview global template'}
                            onClick={() => setPreviewMed(buildMedicationPreview(medication, practiceCard))}
                          >
                            <Eye size={14} />
                          </button>
                          {state !== 'custom' && (
                            <button
                              type="button"
                              className="admin-action-btn admin-action-btn--edit"
                              disabled={state === 'global' || !canAcceptGlobalTemplate}
                              title={!canAcceptGlobalTemplate ? 'Seed this medication into Supabase first' : undefined}
                              onClick={() => state !== 'global' && canAcceptGlobalTemplate && acceptGlobalCard(medication, 'Accept Global Template')}
                            >
                              <CheckCircle size={13} /> Accept global
                            </button>
                          )}
                          <button
                            type="button"
                            className="admin-action-btn admin-action-btn--edit"
                            onClick={() => openCustomEditor(medication)}
                          >
                            <Edit2 size={13} /> {state === 'custom' ? 'Edit version' : 'Create version'}
                          </button>
                          {practiceCard && (
                            <button
                              type="button"
                              className="admin-action-btn admin-action-btn--icon"
                              title="Clear configuration"
                              onClick={() => clearConfiguredCard(medication)}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}
          </div>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      {previewModal}
      {bodyContent}
    </>
  );
};

export default PracticeDashboard;
