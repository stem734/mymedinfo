import React, { useMemo, useReducer, useState, useEffect } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, Plus, Trash2, Save, Copy, ExternalLink, Link, Eye, Edit2, CopyPlus } from 'lucide-react';
import MedicationPreviewModal from '../components/MedicationPreviewModal';
import { resolvePath } from '../subdomainUtils';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import { useToast } from '../components/toastContext';
import { type MedicationRecord, useMedicationCatalog } from '../medicationCatalog';
import { getFunctionErrorMessage } from '../supabaseFunctionError';
import { fetchLocalResourceLinks, type LocalResourceLink } from '../localResourceLibrary';
import { HEALTH_CHECK_CARD_LABELS, type HealthCheckCodeFamily } from '../healthCheckCodes';
import { METRIC_DEFINITIONS } from '../healthCheckData';
import { CLINICAL_DOMAIN_IDS, PREVIEW_DOMAIN_CONFIGS, type ClinicalDomainId } from '../healthCheckVariantConfig';
import {
  SCREENING_TEMPLATES,
  IMMUNISATION_TEMPLATES,
  LONG_TERM_CONDITION_TEMPLATES,
  findImmunisationTemplateByIdentifier,
  findLongTermConditionTemplateByIdentifier,
  getDefaultImmunisationCode,
  getDefaultLongTermConditionCode,
  getDefaultScreeningCode,
  hydrateScreeningTemplate,
  type ScreeningTemplate,
  type ImmunisationTemplate,
  type LongTermConditionTemplate,
  type PatientResourceLink,
  withScreeningTemplateDefaults,
  withImmunisationTemplateDefaults,
  withLongTermConditionTemplateDefaults,
} from '../patientTemplateCatalog';
import {
  fetchCardTemplateRevisions,
  fetchCardTemplates,
} from '../cardTemplateStore';
import type {
  CardTemplateBuilderType,
  CardTemplateRevisionRecord,
  HealthCheckBuilderLink,
  HealthCheckBuilderVariant,
  HealthCheckTemplatePayload,
} from '../cardTemplateTypes';

interface TrendLink {
  title: string;
  url: string;
}

type OutputBuilderType = 'medication' | 'healthcheck' | 'screening' | 'immunisation' | 'ltc';

type BuilderHistoryState = {
  builderType: CardTemplateBuilderType;
  templateId: string;
  label: string;
  revisions: CardTemplateRevisionRecord[];
  loading: boolean;
} | null;

type BuilderConfirmDialog = {
  title: string;
  message: string;
  confirmLabel: string;
  isDangerous: boolean;
  onConfirm: () => void;
} | null;

type BuilderNotice = { type: OutputBuilderType; message: string } | null;
type StateValue<T> = T | ((current: T) => T);

type BuilderUiState = {
  selectedOutputType: OutputBuilderType;
  previewMed: MedicationRecord | null;
  selectedHealthCheckDomain: ClinicalDomainId;
  selectedHealthCheckVariantCode: string;
  healthCheckEditorOpen: boolean;
  screeningEditorOpen: boolean;
  immunisationEditorOpen: boolean;
  ltcEditorOpen: boolean;
  historyState: BuilderHistoryState;
  confirmDialog: BuilderConfirmDialog;
  builderNotice: BuilderNotice;
};

type BuilderUiAction =
  | { type: 'selectOutputType'; outputType: OutputBuilderType }
  | { type: 'setPreviewMed'; value: MedicationRecord | null }
  | { type: 'setSelectedHealthCheckDomain'; value: ClinicalDomainId }
  | { type: 'setSelectedHealthCheckVariantCode'; value: string }
  | { type: 'setHealthCheckEditorOpen'; value: boolean }
  | { type: 'setScreeningEditorOpen'; value: boolean }
  | { type: 'setImmunisationEditorOpen'; value: boolean }
  | { type: 'setLtcEditorOpen'; value: boolean }
  | { type: 'setHistoryState'; value: StateValue<BuilderHistoryState> }
  | { type: 'setConfirmDialog'; value: StateValue<BuilderConfirmDialog> }
  | { type: 'setBuilderNotice'; value: StateValue<BuilderNotice> };

const initialBuilderUiState: BuilderUiState = {
  selectedOutputType: 'medication',
  previewMed: null,
  selectedHealthCheckDomain: 'bp',
  selectedHealthCheckVariantCode: 'BPNORMAL',
  healthCheckEditorOpen: false,
  screeningEditorOpen: false,
  immunisationEditorOpen: false,
  ltcEditorOpen: false,
  historyState: null,
  confirmDialog: null,
  builderNotice: null,
};

const resolveStateValue = <T,>(current: T, value: StateValue<T>): T =>
  typeof value === 'function' ? (value as (current: T) => T)(current) : value;

const builderUiReducer = (state: BuilderUiState, action: BuilderUiAction): BuilderUiState => {
  switch (action.type) {
    case 'selectOutputType':
      return {
        ...state,
        selectedOutputType: action.outputType,
        previewMed: null,
        healthCheckEditorOpen: false,
        screeningEditorOpen: false,
        immunisationEditorOpen: false,
        ltcEditorOpen: false,
        historyState: null,
        confirmDialog: null,
        builderNotice: null,
      };
    case 'setPreviewMed':
      return { ...state, previewMed: action.value };
    case 'setSelectedHealthCheckDomain':
      return { ...state, selectedHealthCheckDomain: action.value };
    case 'setSelectedHealthCheckVariantCode':
      return { ...state, selectedHealthCheckVariantCode: action.value };
    case 'setHealthCheckEditorOpen':
      return { ...state, healthCheckEditorOpen: action.value };
    case 'setScreeningEditorOpen':
      return { ...state, screeningEditorOpen: action.value };
    case 'setImmunisationEditorOpen':
      return { ...state, immunisationEditorOpen: action.value };
    case 'setLtcEditorOpen':
      return { ...state, ltcEditorOpen: action.value };
    case 'setHistoryState':
      return { ...state, historyState: resolveStateValue(state.historyState, action.value) };
    case 'setConfirmDialog':
      return { ...state, confirmDialog: resolveStateValue(state.confirmDialog, action.value) };
    case 'setBuilderNotice':
      return { ...state, builderNotice: resolveStateValue(state.builderNotice, action.value) };
    default:
      return state;
  }
};

const MEDICATION_DESCRIPTION_DUPLICATION_PATTERNS = [
  /^you are starting\b/i,
  /^your\s+.+\s+has been reviewed(?:\s+and\s+renewed)?\b/i,
  /^this guide will help you start treatment safely\b/i,
];

const AUDIT_BUTTON_STYLE = {
  backgroundColor: '#fff8e6',
  color: '#8a5f00',
  border: '1px solid #b27a00',
} as const;

const createDefaultHealthCheckBuilderState = (): Record<ClinicalDomainId, Record<string, HealthCheckBuilderVariant>> =>
  CLINICAL_DOMAIN_IDS.reduce((domainAcc, domainId) => {
    const domainConfig = PREVIEW_DOMAIN_CONFIGS[domainId];
    domainAcc[domainId] = Object.keys(domainConfig.metricByCode).reduce((variantAcc, resultCode) => {
      const metric = domainConfig.metricByCode[resultCode];
      variantAcc[resultCode] = {
        resultCode,
        resultsMessage: metric.pathway,
        importantText: domainConfig.defaultImportantText || '',
        whatIsTitle: domainConfig.whatIsTitle,
        whatIsText: domainConfig.whatIsText,
        nextStepsTitle: domainConfig.defaultNextStepsTitle,
        nextStepsText: domainConfig.defaultNextStepsText,
        links: [],
      };
      return variantAcc;
    }, {} as Record<string, HealthCheckBuilderVariant>);
    return domainAcc;
  }, {} as Record<ClinicalDomainId, Record<string, HealthCheckBuilderVariant>>);

const resolveHealthCheckDomainWhatFields = (
  domainId: ClinicalDomainId,
  variants: Record<string, HealthCheckBuilderVariant> | undefined,
) => {
  const domainConfig = PREVIEW_DOMAIN_CONFIGS[domainId];
  const domainVariants = Object.keys(domainConfig.metricByCode)
    .map((resultCode) => variants?.[resultCode])
    .filter((variant): variant is HealthCheckBuilderVariant => Boolean(variant));
  const titleVariant =
    domainVariants.find((variant) => variant.whatIsTitle.trim() && variant.whatIsTitle !== domainConfig.whatIsTitle) ||
    domainVariants.find((variant) => variant.whatIsTitle.trim());
  const textVariant =
    domainVariants.find((variant) => variant.whatIsText.trim() && variant.whatIsText !== domainConfig.whatIsText) ||
    domainVariants.find((variant) => variant.whatIsText.trim());

  return {
    whatIsTitle: titleVariant?.whatIsTitle || domainConfig.whatIsTitle,
    whatIsText: textVariant?.whatIsText || domainConfig.whatIsText,
  };
};

const withHealthCheckDomainWhatFields = (
  domainId: ClinicalDomainId,
  variants: Record<string, HealthCheckBuilderVariant>,
) => {
  const domainWhatFields = resolveHealthCheckDomainWhatFields(domainId, variants);
  return Object.keys(PREVIEW_DOMAIN_CONFIGS[domainId].metricByCode).reduce((acc, resultCode) => {
    const fallbackVariant = createDefaultHealthCheckBuilderState()[domainId][resultCode];
    acc[resultCode] = {
      ...(variants[resultCode] || fallbackVariant),
      ...domainWhatFields,
    };
    return acc;
  }, {} as Record<string, HealthCheckBuilderVariant>);
};

const cloneResourceLinks = (links: PatientResourceLink[]) => links.map((link) => ({ ...link }));
const cloneScreeningTemplate = (template: ScreeningTemplate): ScreeningTemplate => ({
  ...withScreeningTemplateDefaults(template),
  guidance: [...template.guidance],
  dontGuidance: [...(template.dontGuidance || [])],
  nhsLinks: cloneResourceLinks(template.nhsLinks),
});
const cloneImmunisationTemplate = (template: ImmunisationTemplate): ImmunisationTemplate => ({
  ...withImmunisationTemplateDefaults(template),
  guidance: [...template.guidance],
  nhsLinks: cloneResourceLinks(template.nhsLinks),
});
const cloneLongTermConditionTemplate = (template: LongTermConditionTemplate): LongTermConditionTemplate => ({
  ...withLongTermConditionTemplateDefaults(template),
  guidance: [...template.guidance],
  nhsLinks: cloneResourceLinks(template.nhsLinks),
  zones: template.zones?.map((zone) => ({ ...zone, when: [...zone.when], actions: [...zone.actions] })),
  additionalSections: template.additionalSections?.map((section) => ({ ...section, points: [...section.points] })),
});

const formatRevisionPreview = (builderType: CardTemplateBuilderType, payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return 'No preview available for this revision.';
  }

  if (builderType === 'medication') {
    const medication = payload as Record<string, unknown>;
    const sections = [
      `Title: ${String(medication.title || '')}`,
      `Description: ${String(medication.description || '')}`,
      `Badge: ${String(medication.badge || '')}`,
      `Category: ${String(medication.category || '')}`,
      `Do: ${Array.isArray(medication.do_key_info) ? medication.do_key_info.join(' | ') : ''}`,
      `Don't: ${Array.isArray(medication.dont_key_info) ? medication.dont_key_info.join(' | ') : ''}`,
      `General: ${Array.isArray(medication.general_key_info) ? medication.general_key_info.join(' | ') : ''}`,
      `NHS link: ${String(medication.nhs_link || '')}`,
    ];
    return sections.join('\n');
  }

  if (builderType === 'screening' || builderType === 'immunisation' || builderType === 'ltc') {
    const template = payload as Record<string, unknown>;
    const sections = [
      `Label: ${String(template.label || '')}`,
      `Headline: ${String(template.headline || '')}`,
      `Explanation: ${String(template.explanation || '')}`,
      `Guidance: ${Array.isArray(template.guidance) ? template.guidance.join(' | ') : ''}`,
      `Video: ${String(template.videoUrl || '')}`,
    ];

    if (builderType === 'screening') {
      sections.push(`Don't: ${Array.isArray(template.dontGuidance) ? template.dontGuidance.join(' | ') : ''}`);
    }

    return sections.join('\n');
  }

  const healthCheck = payload as Record<string, unknown>;
  const variants = healthCheck.variants && typeof healthCheck.variants === 'object'
    ? Object.entries(healthCheck.variants as Record<string, Record<string, unknown>>)
      .map(([code, variant]) => `${code}: ${String(variant.resultsMessage || '')}`)
      .join('\n')
    : '';

  return variants || JSON.stringify(payload, null, 2);
};

const createDefaultScreeningState = (): Record<string, ScreeningTemplate> =>
  Object.fromEntries(Object.entries(SCREENING_TEMPLATES).map(([key, template]) => [key, cloneScreeningTemplate(template)]));

const createDefaultImmunisationState = (): Record<string, ImmunisationTemplate> =>
  Object.fromEntries(Object.entries(IMMUNISATION_TEMPLATES).map(([key, template]) => [key, cloneImmunisationTemplate(template)]));

const createDefaultLongTermConditionState = (): Record<string, LongTermConditionTemplate> =>
  Object.fromEntries(Object.entries(LONG_TERM_CONDITION_TEMPLATES).map(([key, template]) => [key, cloneLongTermConditionTemplate(template)]));

const getDuplicateTemplateId = (baseId: string, existingIds: string[]) => {
  const normalizedBase = `${baseId}_copy`.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  const existing = new Set(existingIds.map((id) => id.toLowerCase()));
  if (!existing.has(normalizedBase)) return normalizedBase;

  let index = 2;
  while (existing.has(`${normalizedBase}_${index}`)) {
    index += 1;
  }
  return `${normalizedBase}_${index}`;
};

const parseOptionalPositiveInteger = (value: string) => {
  if (value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
};

const isOutputBuilderType = (value: string | null): value is OutputBuilderType =>
  value === 'medication' || value === 'healthcheck' || value === 'screening' || value === 'immunisation' || value === 'ltc';

const localResourceKey = (resource: LocalResourceLink) => resource.id;

const localResourceHref = (resource: LocalResourceLink) => {
  if (resource.website.trim()) return resource.website.trim();
  if (resource.email.trim()) return `mailto:${resource.email.trim()}`;
  if (resource.phone.trim()) return `tel:${resource.phone.trim().replace(/\s+/g, '')}`;
  return '';
};

const formatLinkExpiryLabel = (value?: number, unit?: 'weeks' | 'months') => {
  if (!value || !unit) return 'No expiry';
  const singular = unit === 'weeks' ? 'week' : 'month';
  return `Link expiry: ${value} ${value === 1 ? singular : unit}`;
};

const contentReviewBadgeTone = (date?: string) => {
  if (!date) return 'dashboard-badge--muted';
  const value = new Date(`${date}T00:00:00`).getTime();
  if (Number.isNaN(value)) return 'dashboard-badge--muted';
  if (value < Date.now()) return 'dashboard-badge--red';
  if (value < Date.now() + 30 * 24 * 60 * 60 * 1000) return 'dashboard-badge--amber';
  return 'dashboard-badge--green';
};

const formatContentReviewLabel = (date?: string) => (
  date ? `Content review: ${date}` : 'No review set'
);

const editorFieldLabelStyle = {
  display: 'block',
  fontWeight: 600,
  fontSize: '0.85rem',
  marginBottom: '0.25rem',
} satisfies React.CSSProperties;

const editorInputStyle = {
  width: '100%',
  padding: '0.7rem',
  border: '2px solid #d8dde0',
  borderRadius: '8px',
  boxSizing: 'border-box',
} satisfies React.CSSProperties;

const metadataGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '0.85rem',
} satisfies React.CSSProperties;

const formatReviewMonthsLabel = (reviewMonths?: number) => `Review: ${reviewMonths || 12}mo`;

const linkExpiryFieldStyles = {
  wrapper: {
    display: 'grid',
    gridTemplateColumns: 'minmax(96px, 120px) minmax(120px, 1fr) auto',
    gap: '0.5rem',
    alignItems: 'stretch',
  } satisfies React.CSSProperties,
  number: {
    width: '100%',
    minWidth: 0,
    padding: '0.7rem 0.6rem',
    border: '2px solid #d8dde0',
    borderRadius: '8px',
    boxSizing: 'border-box',
    textAlign: 'center',
  } satisfies React.CSSProperties,
  select: {
    width: '100%',
    minWidth: 0,
    padding: '0.7rem 0.75rem',
    border: '2px solid #d8dde0',
    borderRadius: '8px',
    background: '#ffffff',
  } satisfies React.CSSProperties,
  button: {
    padding: '0.7rem 0.85rem',
    border: '1px solid #b1c4d4',
    borderRadius: '8px',
    background: '#f5f8fa',
    color: '#35556c',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  } satisfies React.CSSProperties,
  hint: {
    margin: '0.35rem 0 0',
    color: '#4c6272',
    fontSize: '0.82rem',
  } satisfies React.CSSProperties,
};

type ResourcePickerTarget = OutputBuilderType | null;

type CardBuilderProps = {
  embedded?: boolean;
  onBack?: () => void;
};

const CardBuilder: React.FC<CardBuilderProps> = ({ embedded = false, onBack }) => {
  const toast = useToast();
  const [authenticated, setAuthenticated] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [uiState, dispatchUi] = useReducer(builderUiReducer, initialBuilderUiState);
  const {
    medications: existingMeds,
    loading: loadingMeds,
    reload: reloadMeds,
  } = useMedicationCatalog();
  const {
    selectedOutputType,
    previewMed,
    selectedHealthCheckDomain,
    selectedHealthCheckVariantCode,
    healthCheckEditorOpen,
    screeningEditorOpen,
    immunisationEditorOpen,
    ltcEditorOpen,
    historyState,
    confirmDialog,
    builderNotice,
  } = uiState;

  const setSelectedOutputType = (value: OutputBuilderType) => dispatchUi({ type: 'selectOutputType', outputType: value });
  const setPreviewMed = (value: MedicationRecord | null) => dispatchUi({ type: 'setPreviewMed', value });
  const setSelectedHealthCheckDomain = (value: ClinicalDomainId) => dispatchUi({ type: 'setSelectedHealthCheckDomain', value });
  const setSelectedHealthCheckVariantCode = (value: string) => dispatchUi({ type: 'setSelectedHealthCheckVariantCode', value });
  const setHealthCheckEditorOpen = (value: boolean) => dispatchUi({ type: 'setHealthCheckEditorOpen', value });
  const setScreeningEditorOpen = (value: boolean) => dispatchUi({ type: 'setScreeningEditorOpen', value });
  const setImmunisationEditorOpen = (value: boolean) => dispatchUi({ type: 'setImmunisationEditorOpen', value });
  const setLtcEditorOpen = (value: boolean) => dispatchUi({ type: 'setLtcEditorOpen', value });
  const setHistoryState = (value: StateValue<BuilderHistoryState>) => dispatchUi({ type: 'setHistoryState', value });
  const setConfirmDialog = (value: StateValue<BuilderConfirmDialog>) => dispatchUi({ type: 'setConfirmDialog', value });
  const setBuilderNotice = (value: StateValue<BuilderNotice>) => dispatchUi({ type: 'setBuilderNotice', value });

  // Search / generate
  const [medName, setMedName] = useState('');
  const [medType, setMedType] = useState<'NEW' | 'REAUTH'>('NEW');

  // Editable fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [badge, setBadge] = useState<'NEW' | 'REAUTH'>('NEW');
  const [doKeyInfo, setDoKeyInfo] = useState<string[]>(['']);
  const [dontKeyInfo, setDontKeyInfo] = useState<string[]>(['']);
  const [generalKeyInfo, setGeneralKeyInfo] = useState<string[]>(['']);
  const [nhsLink, setNhsLink] = useState('');
  const [trendLinks, setTrendLinks] = useState<TrendLink[]>([]);
  const [sickDaysNeeded, setSickDaysNeeded] = useState(false);
  const [contentReviewDate, setContentReviewDate] = useState('');
  const [medLinkExpiryValue, setMedLinkExpiryValue] = useState<number | undefined>(undefined);
  const [medLinkExpiryUnit, setMedLinkExpiryUnit] = useState<'weeks' | 'months'>('months');
  const [hasContent, setHasContent] = useState(false);
  const [medicationEditorOpen, setMedicationEditorOpen] = useState(false);
  const [editingCode, setEditingCode] = useState('');
  const [requestedCode, setRequestedCode] = useState('');

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveCompleted, setSaveCompleted] = useState(false);

  const [deletingCode, setDeletingCode] = useState('');
  const [healthCheckBuilderConfigs, setHealthCheckBuilderConfigs] = useState<Record<ClinicalDomainId, Record<string, HealthCheckBuilderVariant>>>(() => createDefaultHealthCheckBuilderState());
  const [screeningTemplates, setScreeningTemplates] = useState<Record<string, ScreeningTemplate>>(() => createDefaultScreeningState());
  const [screeningType, setScreeningType] = useState('cervical');
  const [patientPreviewUrl, setPatientPreviewUrl] = useState<string | null>(null);
  const [patientPreviewFooter, setPatientPreviewFooter] = useState<string>('This is a preview of what patients will see.');
  const [immunisationTemplates, setImmunisationTemplates] = useState<Record<string, ImmunisationTemplate>>(() => createDefaultImmunisationState());
  const [immunisationSelections, setImmunisationSelections] = useState<string[]>(['flu']);
  const [longTermConditionTemplates, setLongTermConditionTemplates] = useState<Record<string, LongTermConditionTemplate>>(() => createDefaultLongTermConditionState());
  const [selectedLongTermCondition, setSelectedLongTermCondition] = useState('asthma');
  const [templateSaveCompleted, setTemplateSaveCompleted] = useState<Record<Exclude<OutputBuilderType, 'medication'>, boolean>>({
    healthcheck: false,
    screening: false,
    immunisation: false,
    ltc: false,
  });
  const [templateActionKey, setTemplateActionKey] = useState('');
  const [healthCheckLinkExpiry, setHealthCheckLinkExpiry] = useState<Record<string, { value: number; unit: 'weeks' | 'months' } | undefined>>({});
  const [healthCheckReviewMeta, setHealthCheckReviewMeta] = useState<Record<string, { reviewMonths?: number; contentReviewDate?: string }>>({});
  const [localResources, setLocalResources] = useState<LocalResourceLink[]>([]);
  const [healthCheckLibraryModalOpen, setHealthCheckLibraryModalOpen] = useState(false);
  const [resourcePickerTarget, setResourcePickerTarget] = useState<ResourcePickerTarget>(null);
  const [selectedLocalResourceIds, setSelectedLocalResourceIds] = useState<string[]>([]);

  useEffect(() => {
    const hydrate = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setAuthenticated(true);
        return;
      }

      navigate(resolvePath('/admin'));
    };

    void hydrate();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session?.user) {
        setAuthenticated(true);
      } else {
        navigate(resolvePath('/admin'));
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const domainCodes = Object.keys(PREVIEW_DOMAIN_CONFIGS[selectedHealthCheckDomain].metricByCode);
    if (!domainCodes.includes(selectedHealthCheckVariantCode)) {
      setSelectedHealthCheckVariantCode(domainCodes[0] || '');
    }
  }, [selectedHealthCheckDomain, selectedHealthCheckVariantCode]);

  useEffect(() => {
    const nextBuilder = new URLSearchParams(location.search).get('builder');
    if (!isOutputBuilderType(nextBuilder)) return;
    setSelectedOutputType(nextBuilder);
  }, [location.search]);

  useEffect(() => {
    if (!authenticated) return;

    const loadTemplates = async () => {
      try {
        const [healthcheckRows, screeningRows, immunisationRows, ltcRows] = await Promise.all([
          fetchCardTemplates<HealthCheckTemplatePayload>('healthcheck'),
          fetchCardTemplates<ScreeningTemplate>('screening'),
          fetchCardTemplates<ImmunisationTemplate>('immunisation'),
          fetchCardTemplates<LongTermConditionTemplate>('ltc'),
        ]);

        if (healthcheckRows.length > 0) {
          const next = createDefaultHealthCheckBuilderState();
          const expiryNext: Record<string, { value: number; unit: 'weeks' | 'months' } | undefined> = {};
          const reviewNext: Record<string, { reviewMonths?: number; contentReviewDate?: string }> = {};
          healthcheckRows.forEach((row) => {
            const domainId = row.template_id as ClinicalDomainId;
            if (next[domainId]) {
              next[domainId] = withHealthCheckDomainWhatFields(domainId, {
                ...next[domainId],
                ...((row.payload as HealthCheckTemplatePayload)?.variants || {}),
              });
              const p = row.payload as HealthCheckTemplatePayload;
              expiryNext[domainId] = p?.linkExpiryValue && p?.linkExpiryUnit
                ? { value: p.linkExpiryValue, unit: p.linkExpiryUnit }
                : undefined;
              reviewNext[domainId] = {
                reviewMonths: typeof p?.reviewMonths === 'number' ? p.reviewMonths : undefined,
                contentReviewDate: typeof p?.contentReviewDate === 'string' ? p.contentReviewDate : undefined,
              };
            }
          });
          setHealthCheckBuilderConfigs(next);
          setHealthCheckLinkExpiry(expiryNext);
          setHealthCheckReviewMeta(reviewNext);
        }

        if (screeningRows.length > 0) {
          setScreeningTemplates((current) => {
            const next = { ...current };
            screeningRows.forEach((row) => {
              next[row.template_id] = cloneScreeningTemplate(hydrateScreeningTemplate(row.payload as ScreeningTemplate));
            });
            return next;
          });
        }

        if (immunisationRows.length > 0) {
          setImmunisationTemplates((current) => {
            const next = { ...current };
            immunisationRows.forEach((row) => {
              next[row.template_id] = cloneImmunisationTemplate(row.payload as ImmunisationTemplate);
            });
            return next;
          });
        }

        if (ltcRows.length > 0) {
          setLongTermConditionTemplates((current) => {
            const next = { ...current };
            ltcRows.forEach((row) => {
              next[row.template_id] = cloneLongTermConditionTemplate(row.payload as LongTermConditionTemplate);
            });
            return next;
          });
        }
      } catch (error) {
        console.error('Failed to load card templates', error);
      }
    };

    loadTemplates();
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;

    const loadResources = async () => {
      try {
        setLocalResources(await fetchLocalResourceLinks(true));
      } catch (error) {
        console.warn('Local resource library unavailable:', error);
        setLocalResources([]);
      }
    };

    void loadResources();
  }, [authenticated]);

  const reloadLocalResources = async () => {
    try {
      setLocalResources(await fetchLocalResourceLinks(true));
    } catch (error) {
      console.warn('Local resource library unavailable:', error);
      setLocalResources([]);
    }
  };

  useEffect(() => {
    if (!authenticated || !healthCheckLibraryModalOpen) return;

    void reloadLocalResources();

    const handleFocus = () => {
      void reloadLocalResources();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [authenticated, healthCheckLibraryModalOpen]);

  const previewDraft = useMemo<MedicationRecord | null>(() => {
    if (!hasContent) {
      return null;
    }

    return {
      code: editingCode || '000',
      title: title.trim() || medName.trim() || 'Medication Preview',
      description: description.trim(),
      badge,
      category: 'Medication Information',
      keyInfoMode: doKeyInfo.filter((item) => item.trim()).length > 0 ? 'do' : 'dont',
      doKeyInfo: doKeyInfo.filter((item) => item.trim()),
      dontKeyInfo: dontKeyInfo.filter((item) => item.trim()),
      generalKeyInfo: generalKeyInfo.filter((item) => item.trim()),
      keyInfo: [...doKeyInfo, ...dontKeyInfo].filter((item) => item.trim()),
      nhsLink: nhsLink.trim(),
      trendLinks: trendLinks.filter((item) => item.title.trim() && item.url.trim()),
      sickDaysNeeded,
      contentReviewDate,
      source: editingCode ? 'override' : 'custom',
      isBuiltIn: false,
    };
  }, [badge, description, editingCode, hasContent, doKeyInfo, dontKeyInfo, generalKeyInfo, medName, nhsLink, contentReviewDate, sickDaysNeeded, title, trendLinks]);

  const descriptionNeedsDeduping = useMemo(
    () => MEDICATION_DESCRIPTION_DUPLICATION_PATTERNS.some((pattern) => pattern.test(description.trim())),
    [description],
  );

  const getFriendlyMedicationName = (medication: MedicationRecord) => {
    const [baseTitle] = medication.title.split(' - ');
    return baseTitle.trim();
  };

  const populateMedicationEditor = (
    medication: MedicationRecord,
    overrides?: {
      medName?: string;
      title?: string;
      editingCode?: string;
      requestedCode?: string;
    },
  ) => {
    setMedName(getFriendlyMedicationName(medication));
    setMedType(medication.badge === 'REAUTH' ? 'REAUTH' : 'NEW');
    setTitle(medication.title);
    setDescription(medication.description);
    setBadge(medication.badge === 'REAUTH' ? 'REAUTH' : 'NEW');
    setDoKeyInfo(medication.doKeyInfo?.length ? [...medication.doKeyInfo] : medication.keyInfo.length > 0 ? [...medication.keyInfo] : ['']);
    setDontKeyInfo(medication.dontKeyInfo?.length ? [...medication.dontKeyInfo] : ['']);
    setGeneralKeyInfo(medication.generalKeyInfo?.length ? [...medication.generalKeyInfo] : ['']);
    setNhsLink(medication.nhsLink || '');
    setTrendLinks(medication.trendLinks.map((link) => ({ ...link })));
    setSickDaysNeeded(Boolean(medication.sickDaysNeeded));
    setContentReviewDate(medication.contentReviewDate || '');
    setMedLinkExpiryValue(medication.linkExpiryValue ?? undefined);
    setMedLinkExpiryUnit(medication.linkExpiryUnit ?? 'months');
    setEditingCode(overrides?.editingCode ?? medication.code);
    setRequestedCode(overrides?.requestedCode ?? medication.code);
    setMedName(overrides?.medName ?? getFriendlyMedicationName(medication));
    setTitle(overrides?.title ?? medication.title);
    setHasContent(true);
    setMedicationEditorOpen(true);
    setSaveError('');
    setSaveCompleted(false);
  };

  const startEditingMedication = (medication: MedicationRecord) => {
    populateMedicationEditor(medication);
  };

  const duplicateMedication = (medication: MedicationRecord) => {
    const friendlyName = getFriendlyMedicationName(medication);
    const duplicateTitle = medication.title.includes(' - ')
      ? medication.title.replace(friendlyName, `${friendlyName} Copy`)
      : `${medication.title} Copy`;

    populateMedicationEditor(medication, {
      medName: `${friendlyName} Copy`,
      title: duplicateTitle,
      editingCode: '',
      requestedCode: '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const duplicateScreeningTemplate = (template: ScreeningTemplate) => {
    const nextId = getDuplicateTemplateId(template.id, Object.keys(screeningTemplates));
    const duplicate = cloneScreeningTemplate({
      ...template,
      id: nextId,
      code: getDefaultScreeningCode(nextId),
      label: `${template.label} Copy`,
    });
    setScreeningTemplates((current) => ({ ...current, [nextId]: duplicate }));
    setScreeningType(nextId);
    setTemplateSaveCompleted((current) => ({ ...current, screening: false }));
    setScreeningEditorOpen(true);
    toast.info('Screening card duplicated. Save it to keep the copy.');
  };

  const duplicateImmunisationTemplate = (template: ImmunisationTemplate) => {
    const nextId = getDuplicateTemplateId(template.id, Object.keys(immunisationTemplates));
    const duplicate = cloneImmunisationTemplate({
      ...template,
      id: nextId,
      code: getDefaultImmunisationCode(nextId),
      label: `${template.label} Copy`,
    });
    setImmunisationTemplates((current) => ({ ...current, [nextId]: duplicate }));
    setImmunisationSelections([nextId]);
    setTemplateSaveCompleted((current) => ({ ...current, immunisation: false }));
    setImmunisationEditorOpen(true);
    toast.info('Immunisation card duplicated. Save it to keep the copy.');
  };

  const duplicateLongTermConditionTemplate = (template: LongTermConditionTemplate) => {
    const nextId = getDuplicateTemplateId(template.id, Object.keys(longTermConditionTemplates));
    const duplicate = cloneLongTermConditionTemplate({
      ...template,
      id: nextId,
      code: getDefaultLongTermConditionCode(nextId),
      label: `${template.label} Copy`,
    });
    setLongTermConditionTemplates((current) => ({ ...current, [nextId]: duplicate }));
    setSelectedLongTermCondition(nextId);
    setTemplateSaveCompleted((current) => ({ ...current, ltc: false }));
    setLtcEditorOpen(true);
    toast.info('Long term condition card duplicated. Save it to keep the copy.');
  };

  const sourceLabel = (medication: MedicationRecord) => {
    if (medication.source === 'built-in') return 'Built in';
    if (medication.source === 'override') return 'Edited global card';
    return 'Custom';
  };

  const buildPatientUrl = (params: URLSearchParams) =>
    `${window.location.origin}${resolvePath('/patient')}?${params.toString()}`;

  const copyText = async (value: string) => {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) {
          throw new Error('Copy command failed');
        }
      }
      toast.success('Link copied');
    } catch (error) {
      console.error('Failed to copy link', error);
      toast.error('Could not copy link');
    }
  };

  const openPathwayLibraryManager = () => {
    const target = `${window.location.origin}${resolvePath('/admin/dashboard?tab=library')}`;
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  const buildHealthCheckFamilyPreviewUrl = (domainId: ClinicalDomainId) => {
    const params = new URLSearchParams({ type: 'healthcheck', previewOnly: '1', previewDomain: domainId });
    const previewPayload = {
      variants: withHealthCheckDomainWhatFields(
        domainId,
        healthCheckBuilderConfigs[domainId] || createDefaultHealthCheckBuilderState()[domainId],
      ),
    };
    try {
      const previewToken = `healthcheck-preview:${domainId}:${Date.now()}`;
      window.sessionStorage.setItem(previewToken, JSON.stringify(previewPayload));
      params.set('previewToken', previewToken);
    } catch {
      // sessionStorage may be unavailable; fall back to saved templates only.
    }
    return buildPatientUrl(params);
  };

  const buildScreeningPreviewUrl = (template: ScreeningTemplate) => {
    const params = new URLSearchParams({
      type: 'screening',
      previewOnly: '1',
      screen: template.code || template.id,
    });

    try {
      const previewToken = `screening-preview:${template.id}:${Date.now()}`;
      window.sessionStorage.setItem(previewToken, JSON.stringify(template));
      params.set('previewToken', previewToken);
    } catch {
      // sessionStorage may be unavailable; fall back to saved templates only.
    }

    return buildPatientUrl(params);
  };

  const buildImmunisationPreviewUrl = (template: ImmunisationTemplate) => {
    const params = new URLSearchParams({
      type: 'imms',
      previewOnly: '1',
      vaccine: template.code || template.id,
    });

    try {
      const previewToken = `immunisation-preview:${template.id}:${Date.now()}`;
      window.sessionStorage.setItem(previewToken, JSON.stringify(template));
      params.set('previewToken', previewToken);
    } catch {
      // sessionStorage may be unavailable; fall back to saved templates only.
    }

    return buildPatientUrl(params);
  };

  const selectedScreeningTemplate = screeningTemplates[screeningType] || SCREENING_TEMPLATES.cervical;
  const selectedImmunisationTemplate = findImmunisationTemplateByIdentifier(
    immunisationSelections[0] || 'flu',
    Object.values(immunisationTemplates),
  ) || withImmunisationTemplateDefaults(IMMUNISATION_TEMPLATES.flu);
  const selectedLongTermConditionTemplate =
    findLongTermConditionTemplateByIdentifier(
      selectedLongTermCondition,
      Object.values(longTermConditionTemplates),
    ) || withLongTermConditionTemplateDefaults(LONG_TERM_CONDITION_TEMPLATES.asthma);

  const healthCheckCatalogueRows = CLINICAL_DOMAIN_IDS.map((domainId) => {
    const metricByCode = PREVIEW_DOMAIN_CONFIGS[domainId].metricByCode;
    const resultCodes = Object.keys(metricByCode);
    const familyCode = (domainId === 'ldl' ? 'chol' : domainId).toUpperCase();

    return {
      id: domainId,
      domainId,
      familyCode,
      label: HEALTH_CHECK_CARD_LABELS[(domainId === 'ldl' ? 'chol' : domainId) as HealthCheckCodeFamily] || PREVIEW_DOMAIN_CONFIGS[domainId].heading,
      summary: `${resultCodes.length} result type${resultCodes.length === 1 ? '' : 's'}`,
      resultCodes,
      previewUrl: buildHealthCheckFamilyPreviewUrl(domainId),
    };
  });

  const selectedHealthCheckDomainConfig = PREVIEW_DOMAIN_CONFIGS[selectedHealthCheckDomain];
  const selectedHealthCheckDomainCodes = Object.keys(selectedHealthCheckDomainConfig.metricByCode);
  const resolvedSelectedHealthCheckVariantCode = selectedHealthCheckDomainCodes.includes(selectedHealthCheckVariantCode)
    ? selectedHealthCheckVariantCode
    : (selectedHealthCheckDomainCodes[0] || '');
  const defaultHealthCheckConfigs = createDefaultHealthCheckBuilderState();
  const selectedHealthCheckVariant =
    healthCheckBuilderConfigs[selectedHealthCheckDomain]?.[resolvedSelectedHealthCheckVariantCode] ||
    defaultHealthCheckConfigs[selectedHealthCheckDomain][resolvedSelectedHealthCheckVariantCode];
  const selectedHealthCheckDomainWhatFields = resolveHealthCheckDomainWhatFields(
    selectedHealthCheckDomain,
    healthCheckBuilderConfigs[selectedHealthCheckDomain] || defaultHealthCheckConfigs[selectedHealthCheckDomain],
  );
  const selectedHealthCheckMetric =
    selectedHealthCheckDomainConfig.metricByCode[resolvedSelectedHealthCheckVariantCode] || selectedHealthCheckDomainConfig.defaultMetric;
  const selectedHealthCheckVariantSafe: HealthCheckBuilderVariant =
    {
      ...(selectedHealthCheckVariant || {
        resultCode: resolvedSelectedHealthCheckVariantCode,
        resultsMessage: selectedHealthCheckMetric.pathway || '',
        importantText: '',
        whatIsTitle: selectedHealthCheckDomainConfig.whatIsTitle,
        whatIsText: selectedHealthCheckDomainConfig.whatIsText,
        nextStepsTitle: selectedHealthCheckDomainConfig.defaultNextStepsTitle,
        nextStepsText: selectedHealthCheckDomainConfig.defaultNextStepsText,
        links: [],
      }),
      ...selectedHealthCheckDomainWhatFields,
    };
  const selectedHealthCheckPreviewUrl = buildHealthCheckFamilyPreviewUrl(selectedHealthCheckDomain);
  const resolveHealthCheckLibraryStatus = (resultCode: string): 'ok' | 'amber' | 'red' => {
    const code = resultCode.toUpperCase().trim();
    if (code === 'BPNORMAL' || code === 'BMINORMAL' || code === 'QRISKLOW' || code === 'HBA1CNORMAL' || code === 'GPPAQACTIVE' || code === 'ALCRISKOK' || code === 'ALCRISKTEETOTAL' || code === 'SMOKNONSMOK' || code === 'SMOKSTOPPED' || code === 'CHOLNORMAL') {
      return 'ok';
    }
    if (code === 'BMI1' || code === 'HBA1CNDH1' || code === 'GPPAQMODACTIVE' || code === 'GPPAQFAIRINACTIVE' || code === 'GPPAQUNABLE' || code === 'ALCRISKTOOMUCH' || code === 'ALCRISKTOOMUCH1' || code === 'CHOLREVIEW') {
      return 'amber';
    }
    return 'red';
  };
  const healthCheckLibraryMetric = METRIC_DEFINITIONS[selectedHealthCheckDomain];
  const selectedHealthCheckLibraryStatus = resolveHealthCheckLibraryStatus(resolvedSelectedHealthCheckVariantCode);
  const selectedHealthCheckLibraryEntry = healthCheckLibraryMetric?.statuses[selectedHealthCheckLibraryStatus];

  const updateHealthCheckVariant = (domainId: ClinicalDomainId, resultCode: string, patch: Partial<HealthCheckBuilderVariant>) => {
    const fallbackVariant = defaultHealthCheckConfigs[domainId][resultCode];
    setHealthCheckBuilderConfigs((current) => {
      const currentDomain = current[domainId] || {};
      let nextDomain = {
        ...currentDomain,
        [resultCode]: {
          ...(currentDomain[resultCode] || fallbackVariant),
          ...patch,
        },
      };

      if (patch.whatIsTitle !== undefined || patch.whatIsText !== undefined) {
        nextDomain = Object.keys(defaultHealthCheckConfigs[domainId]).reduce((acc, domainResultCode) => {
          const domainFallbackVariant = defaultHealthCheckConfigs[domainId][domainResultCode];
          acc[domainResultCode] = {
            ...(nextDomain[domainResultCode] || domainFallbackVariant),
            ...(patch.whatIsTitle !== undefined ? { whatIsTitle: patch.whatIsTitle } : {}),
            ...(patch.whatIsText !== undefined ? { whatIsText: patch.whatIsText } : {}),
          };
          return acc;
        }, {} as Record<string, HealthCheckBuilderVariant>);
      }

      return {
        ...current,
        [domainId]: nextDomain,
      };
    });
  };

  const applyHealthCheckPathwayFromLibrary = () => {
    if (!selectedHealthCheckLibraryEntry) return;
    updateHealthCheckVariant(selectedHealthCheckDomain, resolvedSelectedHealthCheckVariantCode, {
      resultsMessage: selectedHealthCheckLibraryEntry.pathway,
    });
  };

  const openHealthCheckLibraryModal = () => {
    setSelectedLocalResourceIds([]);
    void reloadLocalResources();
    setHealthCheckLibraryModalOpen(true);
  };

  const closeHealthCheckLibraryModal = () => {
    setHealthCheckLibraryModalOpen(false);
    setSelectedLocalResourceIds([]);
  };

  const applySelectedHealthCheckLibraryResources = () => {
    const selectedResources = localResources.filter((resource) => selectedLocalResourceIds.includes(resource.id));
    if (selectedResources.length === 0) {
      closeHealthCheckLibraryModal();
      return;
    }

    const existingKeys = new Set(
      selectedHealthCheckVariantSafe.links.map((link) => `${(link.title || '').trim().toLowerCase()}|${(link.website || '').trim().toLowerCase()}|${(link.phone || '').trim().toLowerCase()}|${(link.email || '').trim().toLowerCase()}`),
    );
    const importedLinks: HealthCheckBuilderLink[] = selectedResources
      .map((resource) => ({
        title: resource.title,
        website: resource.website,
        phone: resource.phone,
        phoneLabel: resource.phone_label || (resource.phone ? 'Call' : ''),
        email: resource.email,
        emailLabel: resource.email_label || (resource.email ? 'Email' : ''),
        city: resource.city,
        county_area: resource.county_area,
      }))
      .filter((link) => link.title && (link.website || link.phone || link.email))
      .filter((link) => {
        const key = `${link.title.trim().toLowerCase()}|${(link.website || '').trim().toLowerCase()}|${(link.phone || '').trim().toLowerCase()}|${(link.email || '').trim().toLowerCase()}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });

    updateHealthCheckVariant(selectedHealthCheckDomain, resolvedSelectedHealthCheckVariantCode, {
      links: [...selectedHealthCheckVariantSafe.links, ...importedLinks],
    });
    closeHealthCheckLibraryModal();
  };

  const openResourcePicker = (target: OutputBuilderType) => {
    if (localResources.length === 0) {
      toast.info('No local resources are available yet.');
      return;
    }
    setResourcePickerTarget(target);
    setSelectedLocalResourceIds(localResources.map((resource) => resource.id));
  };

  const closeResourcePicker = () => {
    setResourcePickerTarget(null);
    setSelectedLocalResourceIds([]);
  };

  const applySelectedLocalResources = () => {
    if (!resourcePickerTarget) return;

    const selectedResources = localResources.filter((resource) => selectedLocalResourceIds.includes(resource.id));
    if (selectedResources.length === 0) {
      closeResourcePicker();
      return;
    }

    if (resourcePickerTarget === 'medication') {
      const existingKeys = new Set(trendLinks.map((link) => `${link.title.trim().toLowerCase()}|${link.url.trim().toLowerCase()}`));
      const nextLinks = selectedResources
        .map((resource) => ({ title: resource.title, url: localResourceHref(resource) }))
        .filter((link) => link.title && link.url)
        .filter((link) => {
          const key = `${link.title.trim().toLowerCase()}|${link.url.trim().toLowerCase()}`;
          if (existingKeys.has(key)) return false;
          existingKeys.add(key);
          return true;
        });
      setTrendLinks((current) => [...current, ...nextLinks]);
      closeResourcePicker();
      return;
    }

    if (resourcePickerTarget === 'healthcheck') {
      applySelectedHealthCheckLibraryResources();
      closeResourcePicker();
      return;
    }

    const resourceLinks: PatientResourceLink[] = selectedResources
      .map((resource) => ({
        title: resource.title,
        url: localResourceHref(resource),
        description: resource.description || [resource.phone, resource.email].filter(Boolean).join(' | '),
      }))
      .filter((link) => link.title && link.url);

    if (resourcePickerTarget === 'screening') {
      const template = selectedScreeningTemplate;
      const existingKeys = new Set(template.nhsLinks.map((link) => `${link.title.trim().toLowerCase()}|${link.url.trim().toLowerCase()}`));
      updateScreeningTemplate(screeningType, {
        nhsLinks: [
          ...template.nhsLinks,
          ...resourceLinks.filter((link) => {
            const key = `${link.title.trim().toLowerCase()}|${link.url.trim().toLowerCase()}`;
            if (existingKeys.has(key)) return false;
            existingKeys.add(key);
            return true;
          }),
        ],
      });
    }

    if (resourcePickerTarget === 'immunisation') {
      const template = selectedImmunisationTemplate;
      const existingKeys = new Set(template.nhsLinks.map((link) => `${link.title.trim().toLowerCase()}|${link.url.trim().toLowerCase()}`));
      updateImmunisationTemplate(selectedImmunisationTemplate.id, {
        nhsLinks: [
          ...template.nhsLinks,
          ...resourceLinks.filter((link) => {
            const key = `${link.title.trim().toLowerCase()}|${link.url.trim().toLowerCase()}`;
            if (existingKeys.has(key)) return false;
            existingKeys.add(key);
            return true;
          }),
        ],
      });
    }

    if (resourcePickerTarget === 'ltc') {
      const template = selectedLongTermConditionTemplate;
      const existingKeys = new Set(template.nhsLinks.map((link) => `${link.title.trim().toLowerCase()}|${link.url.trim().toLowerCase()}`));
      updateLongTermConditionTemplate(selectedLongTermCondition, {
        nhsLinks: [
          ...template.nhsLinks,
          ...resourceLinks.filter((link) => {
            const key = `${link.title.trim().toLowerCase()}|${link.url.trim().toLowerCase()}`;
            if (existingKeys.has(key)) return false;
            existingKeys.add(key);
            return true;
          }),
        ],
      });
    }

    closeResourcePicker();
  };

  const updateScreeningTemplate = (templateId: string, patch: Partial<ScreeningTemplate>) => {
    setScreeningTemplates((current) => ({
      ...current,
      [templateId]: {
        ...(current[templateId] || cloneScreeningTemplate(SCREENING_TEMPLATES.cervical)),
        ...patch,
      },
    }));
  };

  const updateScreeningGuidance = (templateId: string, index: number, value: string) => {
    const template = screeningTemplates[templateId] || SCREENING_TEMPLATES.cervical;
    const guidance = [...template.guidance];
    guidance[index] = value;
    updateScreeningTemplate(templateId, { guidance });
  };

  const updateScreeningDontGuidance = (templateId: string, index: number, value: string) => {
    const template = screeningTemplates[templateId] || SCREENING_TEMPLATES.cervical;
    const dontGuidance = [...(template.dontGuidance || [])];
    dontGuidance[index] = value;
    updateScreeningTemplate(templateId, { dontGuidance });
  };

  const addScreeningGuidance = (templateId: string) => {
    const template = screeningTemplates[templateId] || SCREENING_TEMPLATES.cervical;
    updateScreeningTemplate(templateId, { guidance: [...template.guidance, ''] });
  };

  const addScreeningDontGuidance = (templateId: string) => {
    const template = screeningTemplates[templateId] || SCREENING_TEMPLATES.cervical;
    updateScreeningTemplate(templateId, { dontGuidance: [...(template.dontGuidance || []), ''] });
  };

  const removeScreeningGuidance = (templateId: string, index: number) => {
    const template = screeningTemplates[templateId] || SCREENING_TEMPLATES.cervical;
    const guidance = template.guidance.filter((_, itemIndex) => itemIndex !== index);
    updateScreeningTemplate(templateId, { guidance: guidance.length > 0 ? guidance : [''] });
  };

  const removeScreeningDontGuidance = (templateId: string, index: number) => {
    const template = screeningTemplates[templateId] || SCREENING_TEMPLATES.cervical;
    const dontGuidance = (template.dontGuidance || []).filter((_, itemIndex) => itemIndex !== index);
    updateScreeningTemplate(templateId, { dontGuidance: dontGuidance.length > 0 ? dontGuidance : [''] });
  };

  const updateScreeningLink = (templateId: string, index: number, field: keyof PatientResourceLink, value: string) => {
    const template = screeningTemplates[templateId] || SCREENING_TEMPLATES.cervical;
    const nhsLinks = template.nhsLinks.map((link, linkIndex) => linkIndex === index ? { ...link, [field]: value } : link);
    updateScreeningTemplate(templateId, { nhsLinks });
  };

  const removeScreeningLink = (templateId: string, index: number) => {
    const template = screeningTemplates[templateId] || SCREENING_TEMPLATES.cervical;
    updateScreeningTemplate(templateId, { nhsLinks: template.nhsLinks.filter((_, linkIndex) => linkIndex !== index) });
  };

  const updateImmunisationTemplate = (templateId: string, patch: Partial<ImmunisationTemplate>) => {
    setImmunisationTemplates((current) => ({
      ...current,
      [templateId]: {
        ...(current[templateId] || cloneImmunisationTemplate(IMMUNISATION_TEMPLATES.flu)),
        ...patch,
      },
    }));
  };

  const updateImmunisationGuidance = (templateId: string, index: number, value: string) => {
    const template = immunisationTemplates[templateId] || IMMUNISATION_TEMPLATES.flu;
    const guidance = [...template.guidance];
    guidance[index] = value;
    updateImmunisationTemplate(templateId, { guidance });
  };

  const addImmunisationGuidance = (templateId: string) => {
    const template = immunisationTemplates[templateId] || IMMUNISATION_TEMPLATES.flu;
    updateImmunisationTemplate(templateId, { guidance: [...template.guidance, ''] });
  };

  const removeImmunisationGuidance = (templateId: string, index: number) => {
    const template = immunisationTemplates[templateId] || IMMUNISATION_TEMPLATES.flu;
    const guidance = template.guidance.filter((_, itemIndex) => itemIndex !== index);
    updateImmunisationTemplate(templateId, { guidance: guidance.length > 0 ? guidance : [''] });
  };

  const updateImmunisationLink = (templateId: string, index: number, field: keyof PatientResourceLink, value: string) => {
    const template = immunisationTemplates[templateId] || IMMUNISATION_TEMPLATES.flu;
    const nhsLinks = template.nhsLinks.map((link, linkIndex) => linkIndex === index ? { ...link, [field]: value } : link);
    updateImmunisationTemplate(templateId, { nhsLinks });
  };

  const removeImmunisationLink = (templateId: string, index: number) => {
    const template = immunisationTemplates[templateId] || IMMUNISATION_TEMPLATES.flu;
    updateImmunisationTemplate(templateId, { nhsLinks: template.nhsLinks.filter((_, linkIndex) => linkIndex !== index) });
  };

  const updateLongTermConditionTemplate = (templateId: string, patch: Partial<LongTermConditionTemplate>) => {
    setLongTermConditionTemplates((current) => ({
      ...current,
      [templateId]: {
        ...(current[templateId] || cloneLongTermConditionTemplate(LONG_TERM_CONDITION_TEMPLATES.asthma)),
        ...patch,
      },
    }));
  };

  const updateLongTermGuidance = (templateId: string, index: number, value: string) => {
    const template = longTermConditionTemplates[templateId] || LONG_TERM_CONDITION_TEMPLATES.asthma;
    const guidance = [...template.guidance];
    guidance[index] = value;
    updateLongTermConditionTemplate(templateId, { guidance });
  };

  const updateLongTermLink = (templateId: string, index: number, field: keyof PatientResourceLink, value: string) => {
    const template = longTermConditionTemplates[templateId] || LONG_TERM_CONDITION_TEMPLATES.asthma;
    const nhsLinks = template.nhsLinks.map((link, linkIndex) => linkIndex === index ? { ...link, [field]: value } : link);
    updateLongTermConditionTemplate(templateId, { nhsLinks });
  };

  const removeLongTermLink = (templateId: string, index: number) => {
    const template = longTermConditionTemplates[templateId] || LONG_TERM_CONDITION_TEMPLATES.asthma;
    updateLongTermConditionTemplate(templateId, { nhsLinks: template.nhsLinks.filter((_, linkIndex) => linkIndex !== index) });
  };

  const updateLongTermZone = (
    templateId: string,
    zoneIndex: number,
    field: 'title' | 'when' | 'actions',
    value: string | string[],
  ) => {
    const template = longTermConditionTemplates[templateId] || LONG_TERM_CONDITION_TEMPLATES.asthma;
    const zones = (template.zones || []).map((zone, index) => index === zoneIndex ? { ...zone, [field]: value } : zone);
    updateLongTermConditionTemplate(templateId, { zones });
  };

  const updateLongTermAdditionalSection = (
    templateId: string,
    sectionIndex: number,
    field: 'title' | 'points',
    value: string | string[],
  ) => {
    const template = longTermConditionTemplates[templateId] || LONG_TERM_CONDITION_TEMPLATES.asthma;
    const additionalSections = (template.additionalSections || []).map((section, index) => index === sectionIndex ? { ...section, [field]: value } : section);
    updateLongTermConditionTemplate(templateId, { additionalSections });
  };

  const startBlankMedicationCard = () => {
    const trimmedName = medName.trim();
    setTitle(trimmedName);
    setDescription('');
    setBadge(medType);
    setDoKeyInfo(['']);
    setDontKeyInfo(['']);
    setGeneralKeyInfo(['']);
    setNhsLink('');
    setTrendLinks([]);
    setSickDaysNeeded(false);
    setContentReviewDate('');
    setMedLinkExpiryValue(undefined);
    setMedLinkExpiryUnit('months');
    setHasContent(true);
    setMedicationEditorOpen(true);
    setRequestedCode('');
    setSaveError('');
    setSaveCompleted(false);
  };

  const handleSave = async () => {
    if (!title.trim() || !description.trim() || !badge || !(requestedCode.trim() || editingCode) || !contentReviewDate || !medLinkExpiryValue) {
      setSaveError('Title, description, type, code, review date, and expiry value are required.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const saveAction = editingCode ? 'updated' : 'created';
      const { data, error: invokeError } = await supabase.functions.invoke('save-medication', {
        body: {
          code: editingCode || undefined,
          requestedCode: requestedCode.trim() || undefined,
          medicationName: medName.trim() || title.trim(),
          title: title.trim(),
          description: description.trim(),
          badge,
          category: 'Medication Information',
          keyInfo: [...doKeyInfo, ...dontKeyInfo].filter(k => k.trim()),
          doKeyInfo: doKeyInfo.filter(k => k.trim()),
          dontKeyInfo: dontKeyInfo.filter(k => k.trim()),
          generalKeyInfo: generalKeyInfo.filter(k => k.trim()),
          nhsLink: nhsLink.trim(),
          trendLinks: trendLinks.filter(l => l.title.trim() && l.url.trim()),
          sickDaysNeeded,
          contentReviewDate,
          linkExpiryValue: medLinkExpiryValue,
          linkExpiryUnit: medLinkExpiryUnit,
        },
      });
      if (invokeError) throw invokeError;
      if (data.success) {
        await reloadMeds();
        setSaveCompleted(true);
        showBuilderNotice('medication', `Card ${saveAction} successfully.`);
      }
    } catch (err) {
      console.error('Save error:', err);
      const message = await getFunctionErrorMessage(err, 'Failed to save medication. Please try again.');
      setSaveError(message);
    }
    setSaving(false);
  };

  const handleDelete = (medication: MedicationRecord) => {
    setConfirmDialog({
      title: 'Delete Medication?',
      message: `Delete medication ${medication.code}? This will remove it from the database, but the audit history will still be available for restore.`,
      confirmLabel: 'Delete',
      isDangerous: true,
      onConfirm: async () => {
        setDeletingCode(medication.code);
        try {
          const { error: delError } = await supabase.functions.invoke('delete-medication', {
            body: { code: medication.code },
          });
          if (delError) throw delError;
          await reloadMeds();
          if (editingCode === medication.code) {
            resetForm();
          }
        } catch {
          console.error('Delete error');
        }
        setDeletingCode('');
        setConfirmDialog(null);
      },
    });
  };

  const updateDoKeyInfo = (index: number, value: string) => {
    const updated = [...doKeyInfo];
    updated[index] = value;
    setDoKeyInfo(updated);
  };

  const updateDontKeyInfo = (index: number, value: string) => {
    const updated = [...dontKeyInfo];
    updated[index] = value;
    setDontKeyInfo(updated);
  };

  const updateGeneralKeyInfo = (index: number, value: string) => {
    const updated = [...generalKeyInfo];
    updated[index] = value;
    setGeneralKeyInfo(updated);
  };

  const addDoKeyInfo = () => setDoKeyInfo([...doKeyInfo, '']);
  const addDontKeyInfo = () => setDontKeyInfo([...dontKeyInfo, '']);
  const addGeneralKeyInfo = () => setGeneralKeyInfo([...generalKeyInfo, '']);
  const removeDoKeyInfo = (index: number) => setDoKeyInfo(doKeyInfo.filter((_, i) => i !== index).length ? doKeyInfo.filter((_, i) => i !== index) : ['']);
  const removeDontKeyInfo = (index: number) => setDontKeyInfo(dontKeyInfo.filter((_, i) => i !== index).length ? dontKeyInfo.filter((_, i) => i !== index) : ['']);
  const removeGeneralKeyInfo = (index: number) => setGeneralKeyInfo(generalKeyInfo.filter((_, i) => i !== index).length ? generalKeyInfo.filter((_, i) => i !== index) : ['']);

  const updateTrendLink = (index: number, field: 'title' | 'url', value: string) => {
    const updated = [...trendLinks];
    updated[index] = { ...updated[index], [field]: value };
    setTrendLinks(updated);
  };

  const addTrendLink = () => setTrendLinks([...trendLinks, { title: '', url: '' }]);
  const removeTrendLink = (index: number) => setTrendLinks(trendLinks.filter((_, i) => i !== index));

  const resetForm = () => {
    setMedName('');
    setMedType('NEW');
    setTitle('');
    setDescription('');
    setBadge('NEW');
    setDoKeyInfo(['']);
    setDontKeyInfo(['']);
    setGeneralKeyInfo(['']);
    setNhsLink('');
    setTrendLinks([]);
    setSickDaysNeeded(false);
    setContentReviewDate('');
    setMedLinkExpiryValue(undefined);
    setMedLinkExpiryUnit('months');
    setHasContent(false);
    setMedicationEditorOpen(false);
    setEditingCode('');
    setRequestedCode('');
    setSaveError('');
    setSaveCompleted(false);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  const showBuilderNotice = (type: OutputBuilderType, message: string) => {
    setBuilderNotice({ type, message });
    window.setTimeout(() => {
      setBuilderNotice((current) => (current?.type === type ? null : current));
    }, 2200);
  };

  const openPreview = (url: string, footerCopy = 'This is a preview of what patients will see.') => {
    setPatientPreviewUrl(url);
    setPatientPreviewFooter(footerCopy);
  };

  const renderLinkExpiryField = (
    value: number | undefined,
    unit: 'weeks' | 'months',
    onValueChange: (value: number | undefined) => void,
    onUnitChange: (unit: 'weeks' | 'months') => void,
  ) => (
    <div>
      <div style={linkExpiryFieldStyles.wrapper}>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={value ?? ''}
          placeholder="e.g. 6"
          aria-label="Link expiry value"
          onChange={(e) => onValueChange(e.target.value === '' ? undefined : Math.max(1, Number(e.target.value)))}
          style={linkExpiryFieldStyles.number}
        />
        <select
          value={unit}
          aria-label="Link expiry unit"
          onChange={(e) => onUnitChange(e.target.value as 'weeks' | 'months')}
          disabled={!value}
          style={{
            ...linkExpiryFieldStyles.select,
            opacity: value ? 1 : 0.65,
          }}
        >
          <option value="weeks">weeks</option>
          <option value="months">months</option>
        </select>
        <button
          type="button"
          onClick={() => onValueChange(undefined)}
          disabled={!value}
          style={{
            ...linkExpiryFieldStyles.button,
            opacity: value ? 1 : 0.55,
            cursor: value ? 'pointer' : 'default',
          }}
        >
          No expiry
        </button>
      </div>
      <p style={linkExpiryFieldStyles.hint}>Set how long patient links for this card remain valid.</p>
    </div>
  );

  const renderMetadataBadges = (meta: {
    reviewMonths?: number;
    contentReviewDate?: string;
    linkExpiryValue?: number;
    linkExpiryUnit?: 'weeks' | 'months';
  }) => (
    <>
      <span className={`dashboard-badge ${meta.linkExpiryValue && meta.linkExpiryUnit ? 'dashboard-badge--blue' : 'dashboard-badge--muted'}`}>
        {formatLinkExpiryLabel(meta.linkExpiryValue, meta.linkExpiryUnit)}
      </span>
      {typeof meta.reviewMonths === 'number' && (
        <span className="dashboard-badge dashboard-badge--blue">
          {formatReviewMonthsLabel(meta.reviewMonths)}
        </span>
      )}
      <span className={`dashboard-badge ${contentReviewBadgeTone(meta.contentReviewDate)}`}>
        {formatContentReviewLabel(meta.contentReviewDate)}
      </span>
    </>
  );

  const persistCardTemplate = async (
    builderType: CardTemplateBuilderType,
    templateId: string,
    label: string,
    payload: unknown,
    successMessage: string,
  ): Promise<boolean> => {
    const actionKey = `${builderType}:${templateId}`;
    setTemplateActionKey(actionKey);
    try {
      const { data, error } = await supabase.functions.invoke('save-card-template', {
        body: { builderType, templateId, label, payload },
      });
      if (error) throw error;
      if (!data?.success) throw new Error('Template save did not complete');
      showBuilderNotice(builderType as OutputBuilderType, successMessage);
      toast.success('Saved');
      return true;
    } catch (err) {
      const message = await getFunctionErrorMessage(err, 'Failed to save card template.');
      showBuilderNotice(builderType as OutputBuilderType, message);
      toast.error(message);
      return false;
    } finally {
      setTemplateActionKey('');
    }
  };

  const loadTemplateHistory = async (builderType: CardTemplateBuilderType, templateId: string, label: string) => {
    setHistoryState({ builderType, templateId, label, revisions: [], loading: true });
    try {
      const revisions = await fetchCardTemplateRevisions(builderType, templateId);
      setHistoryState({ builderType, templateId, label, revisions, loading: false });
    } catch (error) {
      console.error('Failed to load template history', error);
      setHistoryState({ builderType, templateId, label, revisions: [], loading: false });
    }
  };

  const applyTemplatePayloadToState = (
    builderType: CardTemplateBuilderType,
    templateId: string,
    payload: unknown,
  ) => {
    if (builderType === 'healthcheck') {
      const templatePayload = payload as HealthCheckTemplatePayload;
      const next = createDefaultHealthCheckBuilderState();
      const domainId = templateId as ClinicalDomainId;
      next[domainId] = withHealthCheckDomainWhatFields(domainId, {
        ...next[domainId],
        ...(templatePayload?.variants || {}),
      });
      setHealthCheckBuilderConfigs((current) => ({ ...current, [domainId]: next[domainId] }));
      setHealthCheckLinkExpiry((current) => ({
        ...current,
        [domainId]: templatePayload?.linkExpiryValue && templatePayload?.linkExpiryUnit
          ? { value: templatePayload.linkExpiryValue, unit: templatePayload.linkExpiryUnit }
          : undefined,
      }));
      setHealthCheckReviewMeta((current) => ({
        ...current,
        [domainId]: {
          reviewMonths: typeof templatePayload?.reviewMonths === 'number' ? templatePayload.reviewMonths : undefined,
          contentReviewDate: typeof templatePayload?.contentReviewDate === 'string' ? templatePayload.contentReviewDate : undefined,
        },
      }));
      return;
    }
    if (builderType === 'screening') {
      setScreeningTemplates((current) => ({
        ...current,
        [templateId]: cloneScreeningTemplate(payload as ScreeningTemplate),
      }));
      return;
    }
    if (builderType === 'immunisation') {
      setImmunisationTemplates((current) => ({
        ...current,
        [templateId]: cloneImmunisationTemplate(payload as ImmunisationTemplate),
      }));
      return;
    }
    setLongTermConditionTemplates((current) => ({
      ...current,
      [templateId]: cloneLongTermConditionTemplate(payload as LongTermConditionTemplate),
    }));
  };

  const restoreTemplateRevision = async (revision: CardTemplateRevisionRecord) => {
    if (!historyState) return;
    setTemplateActionKey(`${historyState.builderType}:${historyState.templateId}:restore:${revision.id}`);
    try {
      const { data, error } = await supabase.functions.invoke('restore-card-template', {
        body: {
          builderType: historyState.builderType,
          templateId: historyState.templateId,
          revisionId: revision.id,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error('Template restore did not complete');
      applyTemplatePayloadToState(historyState.builderType, historyState.templateId, revision.payload);

      const revisions = await fetchCardTemplateRevisions(historyState.builderType, historyState.templateId);
      setHistoryState((current) => current ? { ...current, revisions, loading: false } : current);
      showBuilderNotice(historyState.builderType as OutputBuilderType, `${historyState.label} restored.`);
    } catch (err) {
      const message = await getFunctionErrorMessage(err, 'Failed to restore template.');
      showBuilderNotice(historyState.builderType as OutputBuilderType, message);
    } finally {
      setTemplateActionKey('');
    }
  };

  const saveHealthCheckTemplate = async (domainId = selectedHealthCheckDomain) => {
    const familyLabel = HEALTH_CHECK_CARD_LABELS[(domainId === 'ldl' ? 'chol' : domainId) as HealthCheckCodeFamily]
      || PREVIEW_DOMAIN_CONFIGS[domainId].heading;
    const payload: HealthCheckTemplatePayload = {
      variants: withHealthCheckDomainWhatFields(
        domainId,
        healthCheckBuilderConfigs[domainId] || createDefaultHealthCheckBuilderState()[domainId],
      ),
      reviewMonths: healthCheckReviewMeta[domainId]?.reviewMonths,
      contentReviewDate: healthCheckReviewMeta[domainId]?.contentReviewDate,
    };
    const hcExpiry = healthCheckLinkExpiry[domainId];
    if (hcExpiry) {
      payload.linkExpiryValue = hcExpiry.value;
      payload.linkExpiryUnit = hcExpiry.unit;
    }
    const saved = await persistCardTemplate('healthcheck', domainId, familyLabel, payload, `${familyLabel} template saved.`);
    if (saved) {
      setTemplateSaveCompleted((current) => ({ ...current, healthcheck: true }));
    }
  };

  const saveScreeningTemplate = async (templateId = screeningType) => {
    const template = screeningTemplates[templateId] || SCREENING_TEMPLATES.cervical;
    const saved = await persistCardTemplate('screening', templateId, template.label, template, `${template.label} saved.`);
    if (saved) {
      setTemplateSaveCompleted((current) => ({ ...current, screening: true }));
    }
  };

  const saveImmunisationTemplate = async (templateId = immunisationSelections[0] || 'flu') => {
    const template = immunisationTemplates[templateId] || IMMUNISATION_TEMPLATES.flu;
    const saved = await persistCardTemplate('immunisation', templateId, template.label, template, `${template.label} saved.`);
    if (saved) {
      setTemplateSaveCompleted((current) => ({ ...current, immunisation: true }));
    }
  };

  const saveLtcTemplate = async (templateId = selectedLongTermCondition) => {
    const template = longTermConditionTemplates[templateId] || LONG_TERM_CONDITION_TEMPLATES.asthma;
    const saved = await persistCardTemplate('ltc', templateId, template.label, template, `${template.label} saved.`);
    if (saved) {
      setTemplateSaveCompleted((current) => ({ ...current, ltc: true }));
    }
  };

  if (!authenticated) return null;

  return (
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
      <div className={embedded ? 'dashboard-shell dashboard-shell--embedded-builder' : 'dashboard-shell'}>
      {patientPreviewUrl && (
        <Modal
          isOpen
          onClose={() => setPatientPreviewUrl(null)}
          size="lg"
          title="Patient Preview"
          bodyClassName="medication-preview__body"
          footer={<div className="medication-preview__footer-copy">{patientPreviewFooter}</div>}
        >
          <div className="medication-preview">
            <iframe
              key={patientPreviewUrl}
              title="Patient preview"
              src={patientPreviewUrl}
              style={{ width: '100%', minHeight: '1040px', border: 'none', display: 'block', background: '#ffffff' }}
            />
          </div>
        </Modal>
      )}

      <div className="dashboard-header">
        <div className="dashboard-header-copy" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        {!embedded && (
          <button
            onClick={() => (onBack ? onBack() : navigate(resolvePath('/admin/dashboard')))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#005eb8', display: 'flex' }}
          >
            <ArrowLeft size={24} />
          </button>
        )}
        <div>
          <h1 style={{ fontSize: '1.75rem', margin: 0 }}>Card Builder</h1>
          <p style={{ margin: '0.25rem 0 0' }}>
            Manage the patient-facing outputs delivered through MyMedInfo, including medication information and health-check journeys.
          </p>
        </div>
      </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Builder Mode</h2>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {([
            ['medication', 'Medication'],
            ['healthcheck', 'Health Checks'],
            ['screening', 'Screening'],
            ['immunisation', 'Immunisation'],
            ['ltc', 'Long Term Conditions'],
          ] as Array<[OutputBuilderType, string]>).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setSelectedOutputType(value)}
              className="action-button"
              style={{
                backgroundColor: selectedOutputType === value ? '#005eb8' : '#eef7ff',
                color: selectedOutputType === value ? '#ffffff' : '#005eb8',
                border: selectedOutputType === value ? 'none' : '1px solid #005eb8',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Step 1: Search and Start */}
      {selectedOutputType === 'medication' && (
      <>
      {builderNotice?.type === 'medication' && (
        <div style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', background: '#eef7ff', color: '#005eb8', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 600 }}>
          {builderNotice.message}
        </div>
      )}
      <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #005eb8' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
          1. {editingCode ? `Editing Medication Card ${editingCode}` : 'Medication Card'}
        </h2>
        <p style={{ margin: '0 0 1rem', color: '#4c6272', fontSize: '0.95rem' }}>
          Create or update medication outputs here. Health checks and other patient pathways use the same platform, but their content is currently configured through dedicated route parameters and views.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={medName}
            onChange={e => setMedName(e.target.value)}
                placeholder="Enter medication name (e.g. Metformin, Atorvastatin)"
            style={{
              flex: '1 1 200px', padding: '0.75rem', border: '2px solid #d8dde0',
              borderRadius: '8px', fontSize: '1rem', boxSizing: 'border-box',
            }}
            onKeyDown={e => e.key === 'Enter' && startBlankMedicationCard()}
          />
          <select
            value={medType}
            onChange={e => setMedType(e.target.value as 'NEW' | 'REAUTH')}
            style={{
              flex: '1 1 120px', padding: '0.75rem', border: '2px solid #d8dde0', borderRadius: '8px',
              fontSize: '0.95rem', background: 'white',
            }}
          >
            <option value="NEW">New Prescription</option>
            <option value="REAUTH">Reauthorisation</option>
          </select>
          <button
            onClick={startBlankMedicationCard}
            className="action-button"
            style={{ flex: '1 1 auto', backgroundColor: '#005eb8', justifyContent: 'center' }}
          >
            <Plus size={16} /> Start blank card
          </button>
        </div>
      </div>

      {/* Step 2: Editor */}
      {hasContent && (
        <Modal isOpen={medicationEditorOpen} onClose={() => setMedicationEditorOpen(false)} size="xl" closeOnOverlayClick={false}>
          <div style={{ width: 'min(960px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', borderRadius: '16px', boxShadow: '0 24px 60px rgba(15, 32, 45, 0.24)', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', margin: 0 }}>
                2. {editingCode ? `Edit Medication Card ${editingCode}` : 'Edit Medication Card Content'}
              </h2>
              <p style={{ margin: '0.35rem 0 0', color: '#4c6272', fontSize: '0.9rem' }}>
                {title.trim() || medName.trim() || 'Medication card'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {editingCode && (
                <button
                  onClick={() => loadTemplateHistory('medication', editingCode, title.trim() || medName.trim() || editingCode)}
                  className="action-button"
                  style={AUDIT_BUTTON_STYLE}
                >
                  Audit
                </button>
              )}
              <button
                onClick={() => previewDraft && setPreviewMed(previewDraft)}
                disabled={!previewDraft || !previewDraft.description || previewDraft.keyInfo.length === 0}
                className="action-button"
                style={{ backgroundColor: '#005eb8', opacity: !previewDraft || !previewDraft.description || previewDraft.keyInfo.length === 0 ? 0.6 : 1 }}
              >
                <Eye size={16} /> Preview
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="action-button"
                style={{ backgroundColor: '#007f3b', opacity: saving ? 0.6 : 1 }}
              >
                <Save size={16} /> {saving ? 'Saving...' : editingCode ? 'Save Changes' : 'Save'}
              </button>
              <button onClick={resetForm} className="action-button" style={{ backgroundColor: '#4c6272' }}>
                {saveCompleted ? 'Close' : editingCode ? 'Cancel Edit' : 'Reset'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Title *</label>
              <input
                type="text" value={title} onChange={e => setTitle(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', border: '2px solid #d8dde0', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Description *</label>
              <textarea
                value={description} onChange={e => setDescription(e.target.value)} rows={3}
                style={{ width: '100%', padding: '0.6rem', border: '2px solid #d8dde0', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box', resize: 'vertical' }}
              />
              {descriptionNeedsDeduping && (
                <p style={{ fontSize: '0.82rem', color: '#7c5a00', background: '#fff4cc', borderRadius: '6px', padding: '0.5rem 0.65rem', margin: '0.5rem 0 0' }}>
                  Tip: the badge and title already show whether this is a new medicine or review. Start the description with what the medicine is and what it does.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Type</label>
                <select
                  value={badge} onChange={e => setBadge(e.target.value as 'NEW' | 'REAUTH')}
                  style={{ width: '100%', padding: '0.6rem', border: '2px solid #d8dde0', borderRadius: '6px', fontSize: '0.95rem', background: 'white' }}
                >
                  <option value="NEW">New Medication</option>
                  <option value="REAUTH">Reauthorisation</option>
                </select>
              </div>
              <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Code</label>
                <input
                  type="text"
                  value={requestedCode}
                  onChange={e => setRequestedCode(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                  placeholder={badge === 'REAUTH' ? 'e.g. 602' : 'e.g. 601'}
                  style={{ width: '100%', padding: '0.6rem', border: '2px solid #d8dde0', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Review date *</label>
                <input
                  type="date"
                  value={contentReviewDate}
                  onChange={e => setContentReviewDate(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', border: '2px solid #d8dde0', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: '1 1 180px', minWidth: '180px' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Link expiry *</label>
                {renderLinkExpiryField(
                  medLinkExpiryValue,
                  medLinkExpiryUnit,
                  setMedLinkExpiryValue,
                  setMedLinkExpiryUnit,
                )}
              </div>
              <div style={{ flex: '1 1 auto', display: 'flex', alignItems: 'end', paddingBottom: '0.2rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}>
                  <input
                    type="checkbox" checked={sickDaysNeeded} onChange={e => setSickDaysNeeded(e.target.checked)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  Sick Day Rules
                </label>
              </div>
            </div>

            {/* Key Information */}
            <div style={{ display: 'grid', gap: '1rem' }}>
              {[
                { label: 'General advice', values: generalKeyInfo, add: addGeneralKeyInfo, update: updateGeneralKeyInfo, remove: removeGeneralKeyInfo },
                { label: 'Do', values: doKeyInfo, add: addDoKeyInfo, update: updateDoKeyInfo, remove: removeDoKeyInfo },
                { label: "Don't", values: dontKeyInfo, add: addDontKeyInfo, update: updateDontKeyInfo, remove: removeDontKeyInfo },
              ].map((section) => (
                <div key={section.label} style={{ border: '1px solid #d8dde0', borderRadius: '8px', padding: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>{section.label}</label>
                    <button
                      type="button"
                      onClick={section.add}
                      style={{ background: 'none', border: '1px solid #005eb8', color: '#005eb8', borderRadius: '6px', padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      <Plus size={14} /> Add Point
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {section.values.map((info, i) => (
                      <div key={`${section.label}-${i}`} style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="text"
                          value={info}
                          onChange={(e) => section.update(i, e.target.value)}
                          placeholder={`${section.label} point ${i + 1}`}
                          style={{ flex: 1, padding: '0.5rem', border: '2px solid #d8dde0', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' }}
                        />
                        {section.values.length > 1 && (
                          <button
                            type="button"
                            onClick={() => section.remove(i)}
                            style={{ background: '#fde8e8', border: 'none', color: '#d5281b', borderRadius: '6px', padding: '0.5rem', cursor: 'pointer' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* NHS Link */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><ExternalLink size={14} /> NHS Link</span>
              </label>
              <input
                type="url" value={nhsLink} onChange={e => setNhsLink(e.target.value)}
                placeholder="https://www.nhs.uk/medicines/..."
                style={{ width: '100%', padding: '0.6rem', border: '2px solid #d8dde0', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box' }}
              />
            </div>

            {/* Resource Links */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Link size={14} /> Resource Links (leaflets, PDFs)
                </label>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => openResourcePicker('medication')} style={{ background: 'none', border: '1px solid #005eb8', color: '#005eb8', borderRadius: '6px', padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Plus size={14} /> Add From Library
                  </button>
                  <button onClick={addTrendLink} style={{ background: 'none', border: '1px solid #007f3b', color: '#007f3b', borderRadius: '6px', padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Plus size={14} /> Add Link
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {trendLinks.map((link, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text" value={link.title} onChange={e => updateTrendLink(i, 'title', e.target.value)}
                      placeholder="Link title"
                      style={{ flex: 1, padding: '0.5rem', border: '2px solid #d8dde0', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' }}
                    />
                    <input
                      type="url" value={link.url} onChange={e => updateTrendLink(i, 'url', e.target.value)}
                      placeholder="https://... (direct PDF link)"
                      style={{ flex: 2, padding: '0.5rem', border: '2px solid #d8dde0', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' }}
                    />
                    <button onClick={() => removeTrendLink(i)} style={{ background: '#fde8e8', border: 'none', color: '#d5281b', borderRadius: '6px', padding: '0.5rem', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {trendLinks.length === 0 && (
                  <p style={{ fontSize: '0.8rem', color: '#4c6272', margin: 0 }}>No resource links added yet. Click "Add Link" to add PDF leaflets or external resources.</p>
                )}
              </div>
            </div>
          </div>

          {saveError && (
            <div style={{ padding: '0.5rem 0.75rem', background: '#fde8e8', color: '#d5281b', borderRadius: '6px', marginTop: '1rem', fontSize: '0.85rem' }}>
              {saveError}
            </div>
          )}
          </div>
        </Modal>
      )}

      {previewMed && <MedicationPreviewModal med={previewMed} onClose={() => setPreviewMed(null)} />}

      {/* Existing medications */}
      <div className="dashboard-panel dashboard-section">
        <div className="dashboard-panel-header">
          <div>
            <h2 className="dashboard-panel-title">Medication Catalogue</h2>
            <p className="dashboard-panel-subtitle">{existingMeds.length} card{existingMeds.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {loadingMeds ? (
          <p style={{ color: '#4c6272' }}>Loading...</p>
        ) : existingMeds.length === 0 ? (
          <p style={{ color: '#4c6272' }}>No medications yet. Use the search above to create your first one.</p>
        ) : (
          <div className="admin-data-table-wrap">
            <table className="admin-data-table admin-data-table--medications">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Name</th>
                  <th scope="col">Status</th>
                  <th scope="col">Review</th>
                  <th scope="col">Link Expiry</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {existingMeds.map(med => (
                  <tr key={med.code}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#005eb8' }}>{med.code}</span>
                    </td>
                    <td>
                      <strong style={{ fontSize: 14 }}>{med.title}</strong>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          padding: '0 0.4rem', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700,
                          background: med.badge === 'NEW' ? '#005eb8' : med.badge === 'REAUTH' ? '#007f3b' : '#4c6272',
                          color: 'white',
                        }}>
                          {med.badge}
                        </span>
                        <span className={`dashboard-badge ${med.source === 'custom' ? 'dashboard-badge--amber' : med.source === 'override' ? 'dashboard-badge--purple' : 'dashboard-badge--muted'}`}>
                          {sourceLabel(med)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`dashboard-badge ${
                        !med.contentReviewDate ? 'dashboard-badge--muted' :
                        new Date(`${med.contentReviewDate}T00:00:00`).getTime() < Date.now() ? 'dashboard-badge--red' :
                        new Date(`${med.contentReviewDate}T00:00:00`).getTime() < Date.now() + 30 * 24 * 60 * 60 * 1000 ? 'dashboard-badge--amber' :
                        'dashboard-badge--green'
                      }`}>
                        {med.contentReviewDate ? med.contentReviewDate : 'No review set'}
                      </span>
                    </td>
                    <td>
                      <span className={`dashboard-badge ${med.linkExpiryValue && med.linkExpiryUnit ? 'dashboard-badge--blue' : 'dashboard-badge--muted'}`}>
                        {formatLinkExpiryLabel(med.linkExpiryValue, med.linkExpiryUnit)}
                      </span>
                    </td>
                    <td>
                      <div className="admin-table-actions">
                        <button onClick={() => setPreviewMed(med)} className="admin-action-btn admin-action-btn--edit" title="Preview">
                          <Eye size={14} /> Preview
                        </button>
                        <button onClick={() => startEditingMedication(med)} className="admin-action-btn admin-action-btn--edit" title="Edit">
                          <Edit2 size={14} /> Edit
                        </button>
                        <button onClick={() => duplicateMedication(med)} className="admin-action-btn admin-action-btn--icon" title="Duplicate">
                          <CopyPlus size={14} />
                        </button>
                        <button onClick={() => copyCode(med.code)} className="admin-action-btn admin-action-btn--icon" title="Copy code">
                          <Copy size={14} />
                        </button>
                        <button onClick={() => loadTemplateHistory('medication', med.code, med.title)} className="admin-action-btn admin-action-btn--icon" title="Audit history">
                          <Activity size={14} />
                        </button>
                        <button onClick={() => handleDelete(med)} disabled={deletingCode === med.code} className="admin-action-btn admin-action-btn--icon" title="Delete" style={{ color: '#d5281b' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {selectedOutputType === 'healthcheck' && (
        <>
          <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #005eb8' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>1. NHS Health Check Card Builder</h2>
            <p style={{ margin: '0 0 1rem', color: '#4c6272', fontSize: '0.95rem' }}>
              Use the row list below to preview, edit, and copy each health check card variation.
            </p>
            {builderNotice?.type === 'healthcheck' && (
              <div style={{ padding: '0.5rem 0.75rem', background: '#eef7ff', color: '#005eb8', borderRadius: '6px', marginBottom: '0.9rem', fontSize: '0.88rem', fontWeight: 600 }}>
                {builderNotice.message}
              </div>
            )}

            <div className="admin-data-table-wrap" style={{ marginTop: '1rem' }}>
              <table className="admin-data-table" style={{ tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Domain</th>
                    <th scope="col">Review</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {healthCheckCatalogueRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#005eb8' }}>{row.familyCode}</span>
                      </td>
                      <td>
                        <div className="admin-table-identity">
                          <strong>{row.label}</strong>
                          <span className="admin-table-identity__email">{row.summary}</span>
                        </div>
                      </td>
                      <td>
                        {renderMetadataBadges({
                          reviewMonths: healthCheckReviewMeta[row.domainId]?.reviewMonths,
                          contentReviewDate: healthCheckReviewMeta[row.domainId]?.contentReviewDate,
                          linkExpiryValue: healthCheckLinkExpiry[row.domainId]?.value,
                          linkExpiryUnit: healthCheckLinkExpiry[row.domainId]?.unit,
                        })}
                      </td>
                      <td>
                        <div className="admin-table-actions">
                          <button onClick={() => openPreview(row.previewUrl)} className="admin-action-btn admin-action-btn--edit">
                            <Eye size={14} /> Preview
                          </button>
                          <button
                            onClick={() => {
                              setSelectedHealthCheckDomain(row.domainId);
                              setSelectedHealthCheckVariantCode(row.resultCodes[0] || '');
                              setTemplateSaveCompleted((current) => ({ ...current, healthcheck: false }));
                              setHealthCheckEditorOpen(true);
                            }}
                            className="admin-action-btn admin-action-btn--edit"
                          >
                            <Edit2 size={14} /> Edit
                          </button>
                          <button onClick={() => copyText(row.previewUrl)} className="admin-action-btn admin-action-btn--icon" title="Copy link">
                            <Copy size={14} />
                          </button>
                          <button onClick={() => loadTemplateHistory('healthcheck', row.domainId, row.label)} className="admin-action-btn admin-action-btn--icon" title="Audit history">
                            <Activity size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {healthCheckEditorOpen && (
            <Modal isOpen={healthCheckEditorOpen} onClose={() => setHealthCheckEditorOpen(false)} size="xl" closeOnOverlayClick={false}>
              <div style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', borderBottom: '1px solid #e0e0e0' }}>
                  <div>
                    <h3 style={{ margin: 0, color: '#003087', fontSize: '1.25rem', fontWeight: 600 }}>Edit Health Check Card</h3>
                    <p style={{ margin: '0.35rem 0 0', color: '#4c6272', fontSize: '0.9rem' }}>
                      {selectedHealthCheckMetric.label} - {resolvedSelectedHealthCheckVariantCode}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => loadTemplateHistory('healthcheck', selectedHealthCheckDomain, HEALTH_CHECK_CARD_LABELS[(selectedHealthCheckDomain === 'ldl' ? 'chol' : selectedHealthCheckDomain) as HealthCheckCodeFamily] || PREVIEW_DOMAIN_CONFIGS[selectedHealthCheckDomain].heading)}
                      className="action-button"
                      style={AUDIT_BUTTON_STYLE}
                    >
                      Audit
                    </button>
                    <button
                      type="button"
                      onClick={() => setHealthCheckEditorOpen(false)}
                      className="action-button"
                      style={{ backgroundColor: '#4c6272' }}
                    >
                      {templateSaveCompleted.healthcheck ? 'Close' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void saveHealthCheckTemplate(selectedHealthCheckDomain);
                      }}
                      className="action-button"
                      style={{ backgroundColor: '#007f3b' }}
                    >
                      <Save size={16} /> Save
                    </button>
                  </div>
                </div>

                <div style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                      <div>
                        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Section</label>
                        <select
                          value={selectedHealthCheckDomain}
                          onChange={(e) => {
                            const nextDomain = e.target.value as ClinicalDomainId;
                            const nextCodes = Object.keys(PREVIEW_DOMAIN_CONFIGS[nextDomain].metricByCode);
                            setSelectedHealthCheckDomain(nextDomain);
                            setSelectedHealthCheckVariantCode(nextCodes[0] || '');
                          }}
                          style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', fontSize: '0.95rem', background: '#ffffff', boxSizing: 'border-box' }}
                        >
                          {CLINICAL_DOMAIN_IDS.map((domainId) => (
                            <option key={domainId} value={domainId}>
                              {HEALTH_CHECK_CARD_LABELS[(domainId === 'ldl' ? 'chol' : domainId) as HealthCheckCodeFamily] || PREVIEW_DOMAIN_CONFIGS[domainId].heading}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Result type</label>
                        <select
                          value={resolvedSelectedHealthCheckVariantCode}
                          onChange={(e) => setSelectedHealthCheckVariantCode(e.target.value)}
                          style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', fontSize: '0.95rem', background: '#ffffff', boxSizing: 'border-box' }}
                        >
                          {Object.keys(selectedHealthCheckDomainConfig.metricByCode).map((resultCode) => (
                            <option key={resultCode} value={resultCode}>{resultCode}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Link expiry</label>
                        {renderLinkExpiryField(
                          healthCheckLinkExpiry[selectedHealthCheckDomain]?.value,
                          healthCheckLinkExpiry[selectedHealthCheckDomain]?.unit ?? 'months',
                          (nextValue) => {
                            setHealthCheckLinkExpiry((prev) => ({
                              ...prev,
                              [selectedHealthCheckDomain]: nextValue === undefined
                                ? undefined
                                : { value: nextValue, unit: prev[selectedHealthCheckDomain]?.unit ?? 'months' },
                            }));
                          },
                          (nextUnit) => {
                            setHealthCheckLinkExpiry((prev) => ({
                              ...prev,
                              [selectedHealthCheckDomain]: prev[selectedHealthCheckDomain]
                                ? { ...prev[selectedHealthCheckDomain]!, unit: nextUnit }
                                : undefined,
                            }));
                          },
                        )}
                      </div>
                      <div>
                        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Review period (months)</label>
                        <input
                          type="number"
                          min={1}
                          value={healthCheckReviewMeta[selectedHealthCheckDomain]?.reviewMonths ?? ''}
                          onChange={(e) => setHealthCheckReviewMeta((prev) => ({
                            ...prev,
                            [selectedHealthCheckDomain]: {
                              ...prev[selectedHealthCheckDomain],
                              reviewMonths: parseOptionalPositiveInteger(e.target.value),
                            },
                          }))}
                          style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Content review date</label>
                        <input
                          type="date"
                          value={healthCheckReviewMeta[selectedHealthCheckDomain]?.contentReviewDate || ''}
                          onChange={(e) => setHealthCheckReviewMeta((prev) => ({
                            ...prev,
                            [selectedHealthCheckDomain]: {
                              ...prev[selectedHealthCheckDomain],
                              contentReviewDate: e.target.value,
                            },
                          }))}
                          style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.25rem' }}>
                        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 0 }}>What does this result mean?</label>
                        <button
                          type="button"
                          onClick={openHealthCheckLibraryModal}
                          className="action-button-sm"
                          style={{ background: '#eef7ff', border: '1px solid #005eb8', color: '#005eb8', borderRadius: '6px', padding: '0.35rem 0.55rem' }}
                        >
                          <Link size={14} /> Pathway Library
                        </button>
                      </div>
                      <textarea
                        value={selectedHealthCheckVariantSafe.resultsMessage}
                        onChange={(e) => updateHealthCheckVariant(selectedHealthCheckDomain, resolvedSelectedHealthCheckVariantCode, { resultsMessage: e.target.value })}
                        rows={4}
                        style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box', resize: 'vertical' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Important message</label>
                      <textarea
                        value={selectedHealthCheckVariantSafe.importantText}
                        onChange={(e) => updateHealthCheckVariant(selectedHealthCheckDomain, resolvedSelectedHealthCheckVariantCode, { importantText: e.target.value })}
                        rows={3}
                        placeholder="Optional urgent or safeguarding guidance shown in the Important box."
                        style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box', resize: 'vertical' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                      <div>
                        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>What is this? title</label>
                        <input
                          type="text"
                          value={selectedHealthCheckVariantSafe.whatIsTitle}
                          onChange={(e) => updateHealthCheckVariant(selectedHealthCheckDomain, resolvedSelectedHealthCheckVariantCode, { whatIsTitle: e.target.value })}
                          style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Next steps title</label>
                        <input
                          type="text"
                          value={selectedHealthCheckVariantSafe.nextStepsTitle}
                          onChange={(e) => updateHealthCheckVariant(selectedHealthCheckDomain, resolvedSelectedHealthCheckVariantCode, { nextStepsTitle: e.target.value })}
                          style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>What is this? body</label>
                      <textarea
                        value={selectedHealthCheckVariantSafe.whatIsText}
                        onChange={(e) => updateHealthCheckVariant(selectedHealthCheckDomain, resolvedSelectedHealthCheckVariantCode, { whatIsText: e.target.value })}
                        rows={4}
                        style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box', resize: 'vertical' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Next steps guidance</label>
                      <textarea
                        value={selectedHealthCheckVariantSafe.nextStepsText}
                        onChange={(e) => updateHealthCheckVariant(selectedHealthCheckDomain, resolvedSelectedHealthCheckVariantCode, { nextStepsText: e.target.value })}
                        rows={4}
                        style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box', resize: 'vertical' }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: 0 }}>Resource and Support Links</h4>
                        <p style={{ margin: '0.35rem 0 0', color: '#4c6272' }}>Select resources from the Pathway Library to display as local and national services.</p>
                      </div>
                      <button
                        type="button"
                        onClick={openHealthCheckLibraryModal}
                        className="action-button"
                        style={{ backgroundColor: '#003a73', whiteSpace: 'nowrap' }}
                      >
                        <Link size={16} /> Open Pathway Library
                      </button>
                    </div>

                    {selectedHealthCheckVariantSafe.links.length > 0 && (
                      <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f8fbfd', border: '1px solid #d8dde0', borderRadius: '8px' }}>
                        <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem' }}>Current Links ({selectedHealthCheckVariantSafe.links.length})</h5>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {selectedHealthCheckVariantSafe.links.map((link, index) => (
                            <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem', backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '6px' }}>
                              <span style={{ fontSize: '0.9rem', color: '#212b32' }}>
                                <strong>{link.title || 'Untitled'}</strong>
                                {(link.city || link.county_area) && (
                                  <span style={{ display: 'block', fontSize: '0.8rem', color: '#4c6272' }}>
                                    {[link.city, link.county_area].filter(Boolean).join(', ')}
                                  </span>
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  updateHealthCheckVariant(selectedHealthCheckDomain, resolvedSelectedHealthCheckVariantCode, {
                                    links: selectedHealthCheckVariantSafe.links.filter((_, i) => i !== index),
                                  });
                                }}
                                style={{ background: '#fde8e8', border: 'none', color: '#d5281b', borderRadius: '4px', padding: '0.4rem 0.6rem', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                              >
                                <Trash2 size={14} style={{ display: 'inline', marginRight: '0.3rem' }} /> Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ position: 'sticky', top: 0, alignSelf: 'start' }}>
                    <div style={{ border: '1px solid #d8dde0', borderRadius: '12px', overflow: 'hidden', background: '#ffffff', boxShadow: '0 6px 18px rgba(33, 43, 50, 0.08)' }}>
                      <iframe
                        key={selectedHealthCheckPreviewUrl}
                        title="Health check patient preview"
                        src={selectedHealthCheckPreviewUrl}
                        style={{ width: '100%', minHeight: '960px', border: 'none', display: 'block', background: '#ffffff' }}
                      />
                    </div>
                  </div>
                  </div>
                </div>
              </div>
            </Modal>
          )}
        </>
      )}

      {selectedOutputType === 'screening' && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #005eb8' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>1. Screening Card Builder</h2>
          <p style={{ margin: '0 0 1rem', color: '#4c6272', fontSize: '0.95rem' }}>Use rows below to preview, edit, and copy each screening card template.</p>
          {builderNotice?.type === 'screening' && (
            <div style={{ padding: '0.5rem 0.75rem', background: '#eef7ff', color: '#005eb8', borderRadius: '6px', marginBottom: '0.9rem', fontSize: '0.88rem', fontWeight: 600 }}>
              {builderNotice.message}
            </div>
          )}

          <div className="admin-data-table-wrap" style={{ marginTop: '1rem' }}>
            <table className="admin-data-table" style={{ tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Template</th>
                  <th scope="col">Review</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(screeningTemplates).map((template) => {
                  const previewUrl = buildScreeningPreviewUrl(template);
                  return (
                    <tr key={template.id}>
                      <td><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#005eb8' }}>{(template.code || template.id).toUpperCase()}</span></td>
                      <td>
                        <div className="admin-table-identity">
                          <strong>{template.label}</strong>
                          {template.headline && <span className="admin-table-identity__email">{template.headline}</span>}
                        </div>
                      </td>
                      <td>{renderMetadataBadges({ reviewMonths: template.reviewMonths, contentReviewDate: template.contentReviewDate, linkExpiryValue: template.linkExpiryValue, linkExpiryUnit: template.linkExpiryUnit })}</td>
                      <td>
                        <div className="admin-table-actions">
                          <button onClick={() => openPreview(previewUrl, 'This is a preview of what patients will see when they access this screening card.')} className="admin-action-btn admin-action-btn--edit"><Eye size={14} /> Preview</button>
                          <button onClick={() => { setScreeningType(template.id); setTemplateSaveCompleted((current) => ({ ...current, screening: false })); setScreeningEditorOpen(true); }} className="admin-action-btn admin-action-btn--edit"><Edit2 size={14} /> Edit</button>
                          <button onClick={() => duplicateScreeningTemplate(template)} className="admin-action-btn admin-action-btn--icon" title="Duplicate"><CopyPlus size={14} /></button>
                          <button onClick={() => loadTemplateHistory('screening', template.id, template.label)} className="admin-action-btn admin-action-btn--icon" title="Audit history"><Activity size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedOutputType === 'immunisation' && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #005eb8' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>1. Immunisation Card Builder</h2>
          <p style={{ margin: '0 0 1rem', color: '#4c6272', fontSize: '0.95rem' }}>Use rows below to preview, edit, and copy each immunisation card template.</p>
          {builderNotice?.type === 'immunisation' && (
            <div style={{ padding: '0.5rem 0.75rem', background: '#eef7ff', color: '#005eb8', borderRadius: '6px', marginBottom: '0.9rem', fontSize: '0.88rem', fontWeight: 600 }}>
              {builderNotice.message}
            </div>
          )}

          <div className="admin-data-table-wrap" style={{ marginTop: '1rem' }}>
            <table className="admin-data-table" style={{ tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Template</th>
                  <th scope="col">Review</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(immunisationTemplates).map((template) => {
                  const previewUrl = buildImmunisationPreviewUrl(template);
                  return (
                    <tr key={template.id}>
                      <td><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#005eb8' }}>{(template.code || template.id).toUpperCase()}</span></td>
                      <td>
                        <div className="admin-table-identity">
                          <strong>{template.label}</strong>
                          {template.headline && <span className="admin-table-identity__email">{template.headline}</span>}
                        </div>
                      </td>
                      <td>{renderMetadataBadges({ reviewMonths: template.reviewMonths, contentReviewDate: template.contentReviewDate, linkExpiryValue: template.linkExpiryValue, linkExpiryUnit: template.linkExpiryUnit })}</td>
                      <td>
                        <div className="admin-table-actions">
                          <button onClick={() => openPreview(previewUrl)} className="admin-action-btn admin-action-btn--edit"><Eye size={14} /> Preview</button>
                          <button onClick={() => { setImmunisationSelections([template.id]); setTemplateSaveCompleted((current) => ({ ...current, immunisation: false })); setImmunisationEditorOpen(true); }} className="admin-action-btn admin-action-btn--edit"><Edit2 size={14} /> Edit</button>
                          <button onClick={() => duplicateImmunisationTemplate(template)} className="admin-action-btn admin-action-btn--icon" title="Duplicate"><CopyPlus size={14} /></button>
                          <button onClick={() => loadTemplateHistory('immunisation', template.id, template.label)} className="admin-action-btn admin-action-btn--icon" title="Audit history"><Activity size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedOutputType === 'ltc' && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #005eb8' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>1. Long Term Conditions Card Builder</h2>
          <p style={{ margin: '0 0 1rem', color: '#4c6272', fontSize: '0.95rem' }}>Use rows below to preview, edit, and copy each long term condition card template.</p>

          {builderNotice?.type === 'ltc' && (
            <div style={{ padding: '0.5rem 0.75rem', background: '#eef7ff', color: '#005eb8', borderRadius: '6px', marginBottom: '0.9rem', fontSize: '0.88rem', fontWeight: 600 }}>
              {builderNotice.message}
            </div>
          )}
          <div className="admin-data-table-wrap" style={{ marginTop: '1rem' }}>
            <table className="admin-data-table" style={{ tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Template</th>
                  <th scope="col">Review</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(longTermConditionTemplates).map((template) => {
                  const previewUrl = buildPatientUrl(new URLSearchParams({ type: 'ltc', ltc: template.code || template.id }));
                  return (
                    <tr key={template.id}>
                      <td><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#005eb8' }}>{(template.code || template.id).toUpperCase()}</span></td>
                      <td>
                        <div className="admin-table-identity">
                          <strong>{template.label}</strong>
                          {template.headline && <span className="admin-table-identity__email">{template.headline}</span>}
                        </div>
                      </td>
                      <td>{renderMetadataBadges({ reviewMonths: template.reviewMonths, contentReviewDate: template.contentReviewDate, linkExpiryValue: template.linkExpiryValue, linkExpiryUnit: template.linkExpiryUnit })}</td>
                      <td>
                        <div className="admin-table-actions">
                          <button onClick={() => openPreview(previewUrl)} className="admin-action-btn admin-action-btn--edit"><Eye size={14} /> Preview</button>
                          <button onClick={() => { setSelectedLongTermCondition(template.id); setTemplateSaveCompleted((current) => ({ ...current, ltc: false })); setLtcEditorOpen(true); }} className="admin-action-btn admin-action-btn--edit"><Edit2 size={14} /> Edit</button>
                          <button onClick={() => duplicateLongTermConditionTemplate(template)} className="admin-action-btn admin-action-btn--icon" title="Duplicate"><CopyPlus size={14} /></button>
                          <button onClick={() => loadTemplateHistory('ltc', template.id, template.label)} className="admin-action-btn admin-action-btn--icon" title="Audit history"><Activity size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {screeningEditorOpen && (
        <Modal isOpen={screeningEditorOpen} onClose={() => setScreeningEditorOpen(false)} size="xl" closeOnOverlayClick={false}>
          <div style={{ width: 'min(960px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', borderRadius: '16px', boxShadow: '0 24px 60px rgba(15, 32, 45, 0.24)', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#003087' }}>Edit Screening Card</h3>
                  <p style={{ margin: '0.35rem 0 0', color: '#4c6272' }}>{selectedScreeningTemplate.label}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => loadTemplateHistory('screening', screeningType, selectedScreeningTemplate.label)}
                    className="action-button"
                    style={AUDIT_BUTTON_STYLE}
                  >
                    Audit
                  </button>
                  <button onClick={() => saveScreeningTemplate(screeningType)} className="action-button" style={{ backgroundColor: '#007f3b' }}>
                    <Save size={16} /> Save
                  </button>
                  <button onClick={() => setScreeningEditorOpen(false)} className="action-button" style={{ backgroundColor: '#4c6272' }}>
                    {templateSaveCompleted.screening ? 'Close' : 'Cancel'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="dashboard-field">
                <label style={editorFieldLabelStyle}>Title *</label>
                <input type="text" value={selectedScreeningTemplate.label} onChange={(e) => updateScreeningTemplate(screeningType, { label: e.target.value })} style={editorInputStyle} />
              </div>
              <div className="dashboard-field">
                <label style={editorFieldLabelStyle}>Description *</label>
                <input type="text" value={selectedScreeningTemplate.headline} onChange={(e) => updateScreeningTemplate(screeningType, { headline: e.target.value })} style={editorInputStyle} />
              </div>
              <div style={metadataGridStyle}>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Code</label>
                  <input
                    type="text"
                    value={selectedScreeningTemplate.code ?? getDefaultScreeningCode(selectedScreeningTemplate.id)}
                    onChange={(e) => updateScreeningTemplate(screeningType, {
                      code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                    })}
                    style={{ ...editorInputStyle, fontFamily: 'monospace' }}
                  />
                </div>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Link expiry</label>
                  {renderLinkExpiryField(
                    selectedScreeningTemplate.linkExpiryValue,
                    selectedScreeningTemplate.linkExpiryUnit ?? 'months',
                    (nextValue) => updateScreeningTemplate(screeningType, {
                      linkExpiryValue: nextValue,
                      linkExpiryUnit: selectedScreeningTemplate.linkExpiryUnit ?? 'months',
                    }),
                    (nextUnit) => updateScreeningTemplate(screeningType, { linkExpiryUnit: nextUnit }),
                  )}
                </div>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Review period (months)</label>
                  <input
                    type="number"
                    min={1}
                    value={selectedScreeningTemplate.reviewMonths ?? ''}
                    onChange={(e) => updateScreeningTemplate(screeningType, { reviewMonths: parseOptionalPositiveInteger(e.target.value) })}
                    style={editorInputStyle}
                  />
                </div>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Content review date</label>
                  <input
                    type="date"
                    value={selectedScreeningTemplate.contentReviewDate || ''}
                    onChange={(e) => updateScreeningTemplate(screeningType, { contentReviewDate: e.target.value })}
                    style={editorInputStyle}
                  />
                </div>
              </div>
              <div className="dashboard-field">
                <label style={editorFieldLabelStyle}>Guidance *</label>
                <textarea value={selectedScreeningTemplate.explanation} onChange={(e) => updateScreeningTemplate(screeningType, { explanation: e.target.value })} rows={4} style={editorInputStyle} />
              </div>
              <div className="dashboard-field">
                <label style={editorFieldLabelStyle}>Important message</label>
                <textarea value={selectedScreeningTemplate.importantMessage || ''} onChange={(e) => updateScreeningTemplate(screeningType, { importantMessage: e.target.value })} rows={3} style={editorInputStyle} />
              </div>
              <div style={metadataGridStyle}>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Video URL</label>
                  <input type="url" value={selectedScreeningTemplate.videoUrl || ''} onChange={(e) => updateScreeningTemplate(screeningType, { videoUrl: e.target.value })} style={editorInputStyle} />
                </div>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Video title</label>
                  <input type="text" value={selectedScreeningTemplate.videoTitle || ''} onChange={(e) => updateScreeningTemplate(screeningType, { videoTitle: e.target.value })} style={editorInputStyle} />
                </div>
              </div>
              <div style={{ border: '1px solid #d8dde0', borderRadius: '10px', padding: '0.8rem 0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.6rem' }}>
                  <h4 style={{ margin: 0 }}>Do</h4>
                  <button type="button" onClick={() => addScreeningGuidance(screeningType)} className="action-button-sm" style={{ background: '#ffffff', border: '1px solid #005eb8', color: '#005eb8', borderRadius: '6px', padding: '0.35rem 0.6rem' }}>
                    <Plus size={14} /> Add Point
                  </button>
                </div>
                {selectedScreeningTemplate.guidance.map((item, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input type="text" value={item} onChange={(e) => updateScreeningGuidance(screeningType, index, e.target.value)} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box' }} />
                    <button type="button" onClick={() => removeScreeningGuidance(screeningType, index)} style={{ background: '#fde8e8', border: 'none', color: '#d5281b', borderRadius: '6px', padding: '0.5rem', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ border: '1px solid #d8dde0', borderRadius: '10px', padding: '0.8rem 0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.6rem' }}>
                  <h4 style={{ margin: 0 }}>Don&apos;t</h4>
                  <button type="button" onClick={() => addScreeningDontGuidance(screeningType)} className="action-button-sm" style={{ background: '#ffffff', border: '1px solid #005eb8', color: '#005eb8', borderRadius: '6px', padding: '0.35rem 0.6rem' }}>
                    <Plus size={14} /> Add Point
                  </button>
                </div>
                {(selectedScreeningTemplate.dontGuidance || []).map((item, index) => (
                  <div key={`dont-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => updateScreeningDontGuidance(screeningType, index, e.target.value)}
                      style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box' }}
                    />
                    <button type="button" onClick={() => removeScreeningDontGuidance(screeningType, index)} style={{ background: '#fde8e8', border: 'none', color: '#d5281b', borderRadius: '6px', padding: '0.5rem', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0 }}>Resource links</h4>
                  <button type="button" onClick={() => openResourcePicker('screening')} className="action-button-sm" style={{ background: '#eef7ff', border: '1px solid #005eb8', color: '#005eb8', borderRadius: '6px', padding: '0.45rem 0.65rem' }}>
                    <Plus size={14} /> Add From Library
                  </button>
                </div>
                {selectedScreeningTemplate.nhsLinks.map((link, index) => (
                  <div key={index} style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'minmax(0, 1fr) auto', marginBottom: '0.75rem', alignItems: 'start' }}>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <input type="text" value={link.title} onChange={(e) => updateScreeningLink(screeningType, index, 'title', e.target.value)} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box' }} />
                      <input type="text" value={link.url} onChange={(e) => updateScreeningLink(screeningType, index, 'url', e.target.value)} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box' }} />
                      <textarea value={link.description} onChange={(e) => updateScreeningLink(screeningType, index, 'description', e.target.value)} rows={2} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box' }} />
                    </div>
                    <button type="button" onClick={() => removeScreeningLink(screeningType, index)} style={{ background: '#fde8e8', border: 'none', color: '#d5281b', borderRadius: '6px', padding: '0.5rem', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {immunisationEditorOpen && (
        <Modal isOpen={immunisationEditorOpen} onClose={() => setImmunisationEditorOpen(false)} size="xl" closeOnOverlayClick={false}>
          <div style={{ width: 'min(960px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', borderRadius: '16px', boxShadow: '0 24px 60px rgba(15, 32, 45, 0.24)', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#003087' }}>Edit Immunisation Card</h3>
                  <p style={{ margin: '0.35rem 0 0', color: '#4c6272' }}>{selectedImmunisationTemplate.label}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => loadTemplateHistory('immunisation', selectedImmunisationTemplate.id, selectedImmunisationTemplate.label)}
                    className="action-button"
                    style={AUDIT_BUTTON_STYLE}
                  >
                    Audit
                  </button>
                  <button onClick={() => saveImmunisationTemplate(immunisationSelections[0] || 'flu')} className="action-button" style={{ backgroundColor: '#007f3b' }}>
                    <Save size={16} /> Save
                  </button>
                  <button onClick={() => setImmunisationEditorOpen(false)} className="action-button" style={{ backgroundColor: '#4c6272' }}>
                    {templateSaveCompleted.immunisation ? 'Close' : 'Cancel'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="dashboard-field">
                <label style={editorFieldLabelStyle}>Title *</label>
                <input type="text" value={selectedImmunisationTemplate.label} onChange={(e) => updateImmunisationTemplate(selectedImmunisationTemplate.id, { label: e.target.value })} style={editorInputStyle} />
              </div>
              <div className="dashboard-field">
                <label style={editorFieldLabelStyle}>Description *</label>
                <input type="text" value={selectedImmunisationTemplate.headline} onChange={(e) => updateImmunisationTemplate(selectedImmunisationTemplate.id, { headline: e.target.value })} style={editorInputStyle} />
              </div>
              <div className="dashboard-field">
                <label style={editorFieldLabelStyle}>Guidance *</label>
                <textarea value={selectedImmunisationTemplate.explanation} onChange={(e) => updateImmunisationTemplate(selectedImmunisationTemplate.id, { explanation: e.target.value })} rows={4} style={editorInputStyle} />
              </div>
              <div className="dashboard-field">
                <label style={editorFieldLabelStyle}>Important message</label>
                <textarea value={selectedImmunisationTemplate.importantMessage || ''} onChange={(e) => updateImmunisationTemplate(selectedImmunisationTemplate.id, { importantMessage: e.target.value })} rows={3} style={editorInputStyle} />
              </div>
              <div style={metadataGridStyle}>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Code</label>
                  <input
                    type="text"
                    value={selectedImmunisationTemplate.code ?? getDefaultImmunisationCode(selectedImmunisationTemplate.id)}
                    onChange={(e) => updateImmunisationTemplate(selectedImmunisationTemplate.id, {
                      code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                    })}
                    style={{ ...editorInputStyle, fontFamily: 'monospace' }}
                  />
                </div>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Review period (months)</label>
                  <input
                    type="number"
                    min={1}
                    value={selectedImmunisationTemplate.reviewMonths ?? ''}
                    onChange={(e) => updateImmunisationTemplate(selectedImmunisationTemplate.id, { reviewMonths: parseOptionalPositiveInteger(e.target.value) })}
                    style={editorInputStyle}
                  />
                </div>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Content review date</label>
                  <input
                    type="date"
                    value={selectedImmunisationTemplate.contentReviewDate || ''}
                    onChange={(e) => updateImmunisationTemplate(selectedImmunisationTemplate.id, { contentReviewDate: e.target.value })}
                    style={editorInputStyle}
                  />
                </div>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Link expiry</label>
                  {renderLinkExpiryField(
                    selectedImmunisationTemplate.linkExpiryValue,
                    selectedImmunisationTemplate.linkExpiryUnit ?? 'months',
                    (nextValue) => updateImmunisationTemplate(selectedImmunisationTemplate.id, {
                      linkExpiryValue: nextValue,
                      linkExpiryUnit: selectedImmunisationTemplate.linkExpiryUnit ?? 'months',
                    }),
                    (nextUnit) => updateImmunisationTemplate(selectedImmunisationTemplate.id, { linkExpiryUnit: nextUnit }),
                  )}
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0 }}>Guidance</h4>
                  <button type="button" onClick={() => addImmunisationGuidance(selectedImmunisationTemplate.id)} className="action-button-sm" style={{ background: '#ffffff', border: '1px solid #005eb8', color: '#005eb8', borderRadius: '6px', padding: '0.35rem 0.6rem' }}>
                    <Plus size={14} /> Add Point
                  </button>
                </div>
                {selectedImmunisationTemplate.guidance.map((item, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input type="text" value={item} onChange={(e) => updateImmunisationGuidance(selectedImmunisationTemplate.id, index, e.target.value)} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box' }} />
                    <button type="button" onClick={() => removeImmunisationGuidance(selectedImmunisationTemplate.id, index)} style={{ background: '#fde8e8', border: 'none', color: '#d5281b', borderRadius: '6px', padding: '0.5rem', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div style={metadataGridStyle}>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Video URL</label>
                  <input type="url" value={selectedImmunisationTemplate.videoUrl || ''} onChange={(e) => updateImmunisationTemplate(selectedImmunisationTemplate.id, { videoUrl: e.target.value })} style={editorInputStyle} />
                </div>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Video title</label>
                  <input type="text" value={selectedImmunisationTemplate.videoTitle || ''} onChange={(e) => updateImmunisationTemplate(selectedImmunisationTemplate.id, { videoTitle: e.target.value })} style={editorInputStyle} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0 }}>Resource links</h4>
                  <button type="button" onClick={() => openResourcePicker('immunisation')} className="action-button-sm" style={{ background: '#eef7ff', border: '1px solid #005eb8', color: '#005eb8', borderRadius: '6px', padding: '0.45rem 0.65rem' }}>
                    <Plus size={14} /> Add From Library
                  </button>
                </div>
                {selectedImmunisationTemplate.nhsLinks.map((link, index) => (
                  <div key={index} style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'minmax(0, 1fr) auto', marginBottom: '0.75rem', alignItems: 'start' }}>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <input type="text" value={link.title} onChange={(e) => updateImmunisationLink(selectedImmunisationTemplate.id, index, 'title', e.target.value)} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box' }} />
                      <input type="text" value={link.url} onChange={(e) => updateImmunisationLink(selectedImmunisationTemplate.id, index, 'url', e.target.value)} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box' }} />
                      <textarea value={link.description} onChange={(e) => updateImmunisationLink(selectedImmunisationTemplate.id, index, 'description', e.target.value)} rows={2} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box' }} />
                    </div>
                    <button type="button" onClick={() => removeImmunisationLink(selectedImmunisationTemplate.id, index)} style={{ background: '#fde8e8', border: 'none', color: '#d5281b', borderRadius: '6px', padding: '0.5rem', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {ltcEditorOpen && (
        <Modal isOpen={ltcEditorOpen} onClose={() => setLtcEditorOpen(false)} size="xl" closeOnOverlayClick={false}>
          <div style={{ width: 'min(1040px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', borderRadius: '16px', boxShadow: '0 24px 60px rgba(15, 32, 45, 0.24)', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#003087' }}>Edit Long Term Condition Card</h3>
                  <p style={{ margin: '0.35rem 0 0', color: '#4c6272' }}>{selectedLongTermConditionTemplate.label}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => loadTemplateHistory('ltc', selectedLongTermCondition, selectedLongTermConditionTemplate.label)}
                    className="action-button"
                    style={AUDIT_BUTTON_STYLE}
                  >
                    Audit
                  </button>
                  <button onClick={() => saveLtcTemplate(selectedLongTermCondition)} className="action-button" style={{ backgroundColor: '#007f3b' }}>
                    <Save size={16} /> Save
                  </button>
                  <button onClick={() => setLtcEditorOpen(false)} className="action-button" style={{ backgroundColor: '#4c6272' }}>
                    {templateSaveCompleted.ltc ? 'Close' : 'Cancel'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="dashboard-field">
                <label style={editorFieldLabelStyle}>Title *</label>
                <input type="text" value={selectedLongTermConditionTemplate.label} onChange={(e) => updateLongTermConditionTemplate(selectedLongTermCondition, { label: e.target.value })} style={editorInputStyle} />
              </div>
              <div className="dashboard-field">
                <label style={editorFieldLabelStyle}>Description *</label>
                <input type="text" value={selectedLongTermConditionTemplate.headline} onChange={(e) => updateLongTermConditionTemplate(selectedLongTermCondition, { headline: e.target.value })} style={editorInputStyle} />
              </div>
              <div className="dashboard-field">
                <label style={editorFieldLabelStyle}>Guidance *</label>
                <textarea value={selectedLongTermConditionTemplate.explanation} onChange={(e) => updateLongTermConditionTemplate(selectedLongTermCondition, { explanation: e.target.value })} rows={4} style={editorInputStyle} />
              </div>
              <div style={metadataGridStyle}>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Code</label>
                  <input
                    type="text"
                    value={selectedLongTermConditionTemplate.code ?? getDefaultLongTermConditionCode(selectedLongTermConditionTemplate.id)}
                    onChange={(e) => updateLongTermConditionTemplate(selectedLongTermCondition, {
                      code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                    })}
                    style={{ ...editorInputStyle, fontFamily: 'monospace' }}
                  />
                </div>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Review period (months)</label>
                  <input
                    type="number"
                    min={1}
                    value={selectedLongTermConditionTemplate.reviewMonths ?? ''}
                    onChange={(e) => updateLongTermConditionTemplate(selectedLongTermCondition, { reviewMonths: parseOptionalPositiveInteger(e.target.value) })}
                    style={editorInputStyle}
                  />
                </div>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Content review date</label>
                  <input
                    type="date"
                    value={selectedLongTermConditionTemplate.contentReviewDate || ''}
                    onChange={(e) => updateLongTermConditionTemplate(selectedLongTermCondition, { contentReviewDate: e.target.value })}
                    style={editorInputStyle}
                  />
                </div>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Link expiry</label>
                  {renderLinkExpiryField(
                    selectedLongTermConditionTemplate.linkExpiryValue,
                    selectedLongTermConditionTemplate.linkExpiryUnit ?? 'months',
                    (nextValue) => updateLongTermConditionTemplate(selectedLongTermCondition, {
                      linkExpiryValue: nextValue,
                      linkExpiryUnit: selectedLongTermConditionTemplate.linkExpiryUnit ?? 'months',
                    }),
                    (nextUnit) => updateLongTermConditionTemplate(selectedLongTermCondition, { linkExpiryUnit: nextUnit }),
                  )}
                </div>
              </div>
              <div className="dashboard-field">
                <label style={editorFieldLabelStyle}>Important message</label>
                <textarea value={selectedLongTermConditionTemplate.importantMessage || ''} onChange={(e) => updateLongTermConditionTemplate(selectedLongTermCondition, { importantMessage: e.target.value })} rows={3} style={editorInputStyle} />
              </div>
              <div style={metadataGridStyle}>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Video URL</label>
                  <input type="url" value={selectedLongTermConditionTemplate.videoUrl || ''} onChange={(e) => updateLongTermConditionTemplate(selectedLongTermCondition, { videoUrl: e.target.value })} style={editorInputStyle} />
                </div>
                <div className="dashboard-field">
                  <label style={editorFieldLabelStyle}>Video title</label>
                  <input type="text" value={selectedLongTermConditionTemplate.videoTitle || ''} onChange={(e) => updateLongTermConditionTemplate(selectedLongTermCondition, { videoTitle: e.target.value })} style={editorInputStyle} />
                </div>
              </div>
              <div>
                <h4 style={{ margin: '0 0 0.5rem' }}>Guidance</h4>
                {selectedLongTermConditionTemplate.guidance.map((item, index) => (
                  <input key={index} type="text" value={item} onChange={(e) => updateLongTermGuidance(selectedLongTermCondition, index, e.target.value)} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box', marginBottom: '0.5rem' }} />
                ))}
              </div>
              {(selectedLongTermConditionTemplate.zones || []).map((zone, zoneIndex) => (
                <div key={`${zone.color}-${zoneIndex}`} style={{ border: '1px solid #d8dde0', borderRadius: '10px', padding: '1rem', background: '#f8fbfd' }}>
                  <input type="text" value={zone.title} onChange={(e) => updateLongTermZone(selectedLongTermCondition, zoneIndex, 'title', e.target.value)} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box', marginBottom: '0.5rem' }} />
                  <textarea value={zone.when.join('\n')} onChange={(e) => updateLongTermZone(selectedLongTermCondition, zoneIndex, 'when', e.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} rows={4} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box', marginBottom: '0.5rem' }} />
                  <textarea value={zone.actions.join('\n')} onChange={(e) => updateLongTermZone(selectedLongTermCondition, zoneIndex, 'actions', e.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} rows={4} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box' }} />
                </div>
              ))}
              {(selectedLongTermConditionTemplate.additionalSections || []).map((section, sectionIndex) => (
                <div key={`${section.title}-${sectionIndex}`} style={{ border: '1px solid #d8dde0', borderRadius: '10px', padding: '1rem', background: '#f8fbfd' }}>
                  <input type="text" value={section.title} onChange={(e) => updateLongTermAdditionalSection(selectedLongTermCondition, sectionIndex, 'title', e.target.value)} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box', marginBottom: '0.5rem' }} />
                  <textarea value={section.points.join('\n')} onChange={(e) => updateLongTermAdditionalSection(selectedLongTermCondition, sectionIndex, 'points', e.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} rows={4} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0 }}>Resource links</h4>
                  <button type="button" onClick={() => openResourcePicker('ltc')} className="action-button-sm" style={{ background: '#eef7ff', border: '1px solid #005eb8', color: '#005eb8', borderRadius: '6px', padding: '0.45rem 0.65rem' }}>
                    <Plus size={14} /> Add From Library
                  </button>
                </div>
                {selectedLongTermConditionTemplate.nhsLinks.map((link, index) => (
                  <div key={index} style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'minmax(0, 1fr) auto', marginBottom: '0.75rem', alignItems: 'start' }}>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <input type="text" value={link.title} onChange={(e) => updateLongTermLink(selectedLongTermCondition, index, 'title', e.target.value)} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box' }} />
                      <input type="text" value={link.url} onChange={(e) => updateLongTermLink(selectedLongTermCondition, index, 'url', e.target.value)} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box' }} />
                      <textarea value={link.description} onChange={(e) => updateLongTermLink(selectedLongTermCondition, index, 'description', e.target.value)} rows={2} style={{ width: '100%', padding: '0.7rem', border: '2px solid #d8dde0', borderRadius: '8px', boxSizing: 'border-box' }} />
                    </div>
                    <button type="button" onClick={() => removeLongTermLink(selectedLongTermCondition, index)} style={{ background: '#fde8e8', border: 'none', color: '#d5281b', borderRadius: '6px', padding: '0.5rem', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {resourcePickerTarget && (
        <Modal isOpen={Boolean(resourcePickerTarget)} onClose={closeResourcePicker} size="md" title="Add Resources From Library">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p style={{ margin: 0, color: '#4c6272' }}>Choose which local resources to add to this card.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '48vh', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {localResources.map((resource) => {
                const key = localResourceKey(resource);
                const checked = selectedLocalResourceIds.includes(key);

                return (
                  <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.6rem 0.7rem', border: '1px solid #d8dde0', borderRadius: '8px', background: '#f8fbfd', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedLocalResourceIds((current) => {
                          if (e.target.checked) {
                            return current.includes(key) ? current : [...current, key];
                          }
                          return current.filter((item) => item !== key);
                        });
                      }}
                    />
                    <span>
                      <strong style={{ display: 'block' }}>{resource.title}</strong>
                      <span style={{ color: '#4c6272', fontSize: '0.86rem' }}>
                        {[resource.category, resource.city, resource.county_area, resource.website, resource.phone, resource.email].filter(Boolean).join(' | ')}
                      </span>
                      {resource.description && <span style={{ display: 'block', color: '#4c6272', fontSize: '0.86rem', marginTop: '0.2rem' }}>{resource.description}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button type="button" onClick={closeResourcePicker} className="action-button" style={{ backgroundColor: '#4c6272' }}>
                Cancel
              </button>
              <button type="button" onClick={applySelectedLocalResources} className="action-button" style={{ backgroundColor: '#007f3b' }}>
                Add Selected Resources
              </button>
            </div>
          </div>
        </Modal>
      )}

      {healthCheckLibraryModalOpen && (
        <Modal
          isOpen={healthCheckLibraryModalOpen}
          onClose={closeHealthCheckLibraryModal}
          size="lg"
          title="Pathway Library"
          subtitle={`${selectedHealthCheckMetric.label} - ${resolvedSelectedHealthCheckVariantCode}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ border: '1px solid #d8dde0', borderRadius: '10px', padding: '1rem', background: '#f8fbfd' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', marginBottom: '0.75rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: '#003087' }}>Recommended pathway text</h3>
                  <p style={{ margin: '0.25rem 0 0', color: '#4c6272', fontSize: '0.88rem' }}>
                    Suggested wording for the {selectedHealthCheckLibraryStatus.toUpperCase()} pathway.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={applyHealthCheckPathwayFromLibrary}
                  disabled={!selectedHealthCheckLibraryEntry}
                  className="action-button-sm"
                  style={{ background: '#eef7ff', border: '1px solid #005eb8', color: '#005eb8', borderRadius: '6px', padding: '0.45rem 0.65rem', whiteSpace: 'nowrap' }}
                >
                  Apply Pathway
                </button>
              </div>
              <div style={{ color: '#212b32', fontSize: '0.95rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {selectedHealthCheckLibraryEntry?.pathway || 'No library pathway is available for this result type yet.'}
              </div>
            </div>

            <div style={{ border: '1px solid #d8dde0', borderRadius: '10px', padding: '1rem', background: '#ffffff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', marginBottom: '0.75rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: '#003087' }}>Local pathway resources</h3>
                  <p style={{ margin: '0.25rem 0 0', color: '#4c6272', fontSize: '0.88rem' }}>
                    Pick local contacts and services to add to this health check card.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openPathwayLibraryManager}
                  className="action-button-sm"
                  style={{ background: '#4c6272', borderRadius: '6px', padding: '0.45rem 0.65rem', whiteSpace: 'nowrap' }}
                >
                  <ExternalLink size={14} /> Manage Library
                </button>
              </div>

              {localResources.length === 0 ? (
                <p style={{ margin: 0, color: '#4c6272' }}>No local resources are available yet. Use Manage Library to add pathway contacts and links.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '40vh', overflowY: 'auto', paddingRight: '0.25rem' }}>
                  {localResources.map((resource) => {
                    const key = localResourceKey(resource);
                    const checked = selectedLocalResourceIds.includes(key);

                    return (
                      <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.6rem 0.7rem', border: '1px solid #d8dde0', borderRadius: '8px', background: '#f8fbfd', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedLocalResourceIds((current) => {
                              if (e.target.checked) {
                                return current.includes(key) ? current : [...current, key];
                              }
                              return current.filter((item) => item !== key);
                            });
                          }}
                        />
                        <span>
                          <strong style={{ display: 'block' }}>{resource.title}</strong>
                          <span style={{ color: '#4c6272', fontSize: '0.86rem' }}>
                            {[resource.category, resource.city, resource.county_area, resource.website, resource.phone, resource.email].filter(Boolean).join(' | ')}
                          </span>
                          {resource.description && <span style={{ display: 'block', color: '#4c6272', fontSize: '0.86rem', marginTop: '0.2rem' }}>{resource.description}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button type="button" onClick={closeHealthCheckLibraryModal} className="action-button" style={{ backgroundColor: '#4c6272' }}>
                Close
              </button>
              <button
                type="button"
                onClick={applySelectedHealthCheckLibraryResources}
                disabled={selectedLocalResourceIds.length === 0}
                className="action-button"
                style={{ backgroundColor: '#007f3b' }}
              >
                Add Selected Resources
              </button>
            </div>
          </div>
        </Modal>
      )}

      {historyState && (
        <Modal isOpen={Boolean(historyState)} onClose={() => setHistoryState(null)} size="lg">
          <div style={{ width: 'min(760px, 100%)', maxHeight: '85vh', overflowY: 'auto', background: '#ffffff', borderRadius: '16px', boxShadow: '0 24px 60px rgba(15, 32, 45, 0.24)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, color: '#003087' }}>Template Audit History</h3>
                <p style={{ margin: '0.35rem 0 0', color: '#4c6272' }}>{historyState.label}</p>
                <p style={{ margin: '0.35rem 0 0', color: '#4c6272', fontSize: '0.9rem' }}>
                  {historyState.revisions.length} change event{historyState.revisions.length === 1 ? '' : 's'} recorded. Only the latest 3 previous versions can be restored.
                </p>
              </div>
              <button onClick={() => setHistoryState(null)} className="action-button" style={{ backgroundColor: '#4c6272' }}>
                Close
              </button>
            </div>
            {historyState.loading ? (
              <p style={{ color: '#4c6272' }}>Loading history...</p>
            ) : historyState.revisions.length === 0 ? (
              <p style={{ color: '#4c6272' }}>No saved revisions yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {historyState.revisions.map((revision, index) => {
                  const canRestore = index > 0 && index <= 3;
                  return (
                    <div key={revision.id} style={{ border: '1px solid #d8dde0', borderRadius: '10px', padding: '1rem', background: '#f8fbfd' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#1d2a33' }}>Version {revision.version} • {revision.action}</div>
                          <div style={{ color: '#4c6272', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                            {new Date(revision.created_at).toLocaleString('en-GB')}
                          </div>
                        </div>
                        <button
                          onClick={() => restoreTemplateRevision(revision)}
                          disabled={!canRestore || templateActionKey === `${historyState.builderType}:${historyState.templateId}:restore:${revision.id}`}
                          className="action-button-sm"
                          style={{ background: canRestore ? '#f3f8f1' : '#f0f4f5', border: `1px solid ${canRestore ? '#007f3b' : '#d8dde0'}`, color: canRestore ? '#007f3b' : '#6b7b88', borderRadius: '6px', padding: '0.55rem 0.75rem' }}
                          title={canRestore ? 'Restore this version' : index === 0 ? 'This is the current version' : 'Only the latest 3 previous versions can be restored'}
                        >
                          Restore
                        </button>
                      </div>
                      <details style={{ marginTop: '0.75rem' }}>
                        <summary style={{ cursor: 'pointer', color: '#005eb8', fontWeight: 600 }}>View content</summary>
                        <pre style={{ margin: '0.75rem 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#ffffff', border: '1px solid #d8dde0', borderRadius: '8px', padding: '0.85rem', fontSize: '0.85rem', color: '#1d2a33' }}>
                          {formatRevisionPreview(historyState.builderType, revision.payload)}
                        </pre>
                      </details>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
    </>
  );
};

export default CardBuilder;
