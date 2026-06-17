import React, { useMemo, useState, useEffect } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Bell,
  BookOpen,
  Building2,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Edit2,
  ExternalLink,
  Eye,
  FlaskConical,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  Star,
  Trash2,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import PracticeUserManagement from '../components/PracticeUserManagement';
import { useToast } from '../components/toastContext';
import { practiceUrl, resolvePath } from '../subdomainUtils';
import { getFunctionErrorMessage } from '../supabaseFunctionError';
import Modal from '../components/Modal';
import PracticeForm from '../components/PracticeForm';
import { validatePracticeContactEmail } from '../practiceValidation';
import { ENGLAND_CITIES, ENGLAND_COUNTY_AREAS } from '../englandLocations';
import {
  deleteLocalResourceLink,
  emptyLocalResourceDraft,
  fetchLocalResourceLinks,
  upsertLocalResourceLink,
  type LocalResourceDraft,
  type LocalResourceLink,
} from '../localResourceLibrary';
import { buildDemoPatientUrlForType } from '../demoHelpers';
import { fetchCardTemplates } from '../cardTemplateStore';
import type { CardTemplateBuilderType, HealthCheckTemplatePayload } from '../cardTemplateTypes';
import { loadMedicationCatalog } from '../medicationCatalog';
import type { MedicationRecord } from '../medicationCatalog';
import type { ImmunisationTemplate, LongTermConditionTemplate, ScreeningTemplate } from '../patientTemplateCatalog';
import CardBuilder from './CardBuilder';

interface ServiceActivationRequest {
  id: string;
  practice_id: string;
  practice_name: string;
  requested_by_email: string;
  service: string;
  status: 'pending' | 'approved' | 'dismissed';
  updated_at: string;
}

type ServiceWorkStatus = 'overdue' | 'missing' | 'dueSoon';

type ServiceWorkItem = {
  id: string;
  service: 'medication' | CardTemplateBuilderType;
  serviceLabel: string;
  label: string;
  status: ServiceWorkStatus;
  reviewDate?: string;
};

interface Practice {
  id: string;
  name: string;
  is_active: boolean;
  ods_code?: string;
  contact_email?: string;
  medication_enabled?: boolean;
  healthcheck_enabled?: boolean;
  screening_enabled?: boolean;
  immunisation_enabled?: boolean;
  ltc_enabled?: boolean;
  signed_up_at?: string;
  last_accessed?: string;
  link_visit_count?: number;
  patient_rating_count?: number;
  patient_rating_total?: number;
}

type AdminRow = {
  uid: string;
  email: string;
  name: string;
  is_active: boolean;
  global_role: 'owner' | 'admin' | null;
};

interface LoginAuditEntry {
  id: string;
  uid: string;
  email: string;
  actorType: 'admin' | 'practice';
  actorName: string;
  actorId?: string | null;
  adminRole?: 'owner' | 'admin' | null;
  portal: 'admin' | 'practice';
  userAgent: string;
  ipAddress: string;
  createdAtMs: number;
}

interface LoginAuditGroup {
  key: string;
  actorName: string;
  email: string;
  actorType: 'admin' | 'practice';
  portal: 'admin' | 'practice';
  adminRole?: 'owner' | 'admin' | null;
  actorId?: string | null;
  latestCreatedAtMs: number;
  latestIpAddress: string;
  latestUserAgent: string;
  entries: LoginAuditEntry[];
}

type AdminDashboardPayload = {
  practices?: Practice[];
  admins?: AdminRow[];
  loginAudit?: Array<{
    id: string;
    uid: string;
    email: string;
    actor_type: 'admin' | 'practice';
    actor_name: string;
    actor_id?: string | null;
    admin_role?: 'owner' | 'admin' | null;
    portal: 'admin' | 'practice';
    user_agent?: string | null;
    ip_address?: string | null;
    created_at: string;
  }>;
};

const PRACTICE_FUNCTIONS: Array<{
  key: keyof Pick<Practice, 'medication_enabled' | 'healthcheck_enabled' | 'screening_enabled' | 'immunisation_enabled' | 'ltc_enabled'>;
  label: string;
  isEnabled: (practice: Practice) => boolean;
}> = [
  { key: 'medication_enabled', label: 'Medication cards', isEnabled: (practice) => practice.medication_enabled !== false },
  { key: 'healthcheck_enabled', label: 'Health checks', isEnabled: (practice) => practice.healthcheck_enabled === true },
  { key: 'screening_enabled', label: 'Screening', isEnabled: (practice) => practice.screening_enabled === true },
  { key: 'immunisation_enabled', label: 'Immunisations', isEnabled: (practice) => practice.immunisation_enabled === true },
  { key: 'ltc_enabled', label: 'Long term conditions', isEnabled: (practice) => practice.ltc_enabled === true },
];

type AdminTab = 'overview' | 'practices' | 'practiceUsers' | 'services' | 'library' | 'setup' | 'activationRequests' | 'audit' | 'demo';

type PlatformConfig = {
  service_medication_enabled: boolean;
  service_healthcheck_enabled: boolean;
  service_screening_enabled: boolean;
  service_immunisation_enabled: boolean;
  service_ltc_enabled: boolean;
};

const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  service_medication_enabled: true,
  service_healthcheck_enabled: false,
  service_screening_enabled: false,
  service_immunisation_enabled: false,
  service_ltc_enabled: false,
};

const GLOBAL_SERVICES: Array<{
  configKey: keyof PlatformConfig;
  practiceKey: keyof Pick<Practice, 'medication_enabled' | 'healthcheck_enabled' | 'screening_enabled' | 'immunisation_enabled' | 'ltc_enabled'>;
  label: string;
  description: string;
  builderSection: 'medication' | 'healthcheck' | 'screening' | 'immunisation' | 'ltc';
}> = [
  { configKey: 'service_medication_enabled', practiceKey: 'medication_enabled', label: 'Medication Cards', description: 'Structured medication review cards for patient consultations.', builderSection: 'medication' },
  { configKey: 'service_healthcheck_enabled', practiceKey: 'healthcheck_enabled', label: 'NHS Health Checks', description: 'Health check assessment pathway and outcome tracking.', builderSection: 'healthcheck' },
  { configKey: 'service_screening_enabled', practiceKey: 'screening_enabled', label: 'Screening', description: 'Cancer and vascular screening recommendations.', builderSection: 'screening' },
  { configKey: 'service_immunisation_enabled', practiceKey: 'immunisation_enabled', label: 'Immunisations', description: 'Vaccination schedule and immunisation programme cards.', builderSection: 'immunisation' },
  { configKey: 'service_ltc_enabled', practiceKey: 'ltc_enabled', label: 'Long Term Conditions', description: 'Chronic disease management and care pathway cards.', builderSection: 'ltc' },
];

const SERVICE_LABEL_BY_BUILDER: Record<ServiceWorkItem['service'], string> = {
  medication: 'Medication Cards',
  healthcheck: 'NHS Health Checks',
  screening: 'Screening',
  immunisation: 'Immunisations',
  ltc: 'Long Term Conditions',
};

const classifyReviewDate = (reviewDate?: string): ServiceWorkStatus | null => {
  if (!reviewDate) return 'missing';
  const value = new Date(`${reviewDate}T00:00:00`).getTime();
  if (Number.isNaN(value)) return 'missing';
  if (value < Date.now()) return 'overdue';
  if (value < Date.now() + 30 * 24 * 60 * 60 * 1000) return 'dueSoon';
  return null;
};

const createReviewWorkItem = (
  service: ServiceWorkItem['service'],
  id: string,
  label: string,
  reviewDate?: string,
): ServiceWorkItem | null => {
  const status = classifyReviewDate(reviewDate);
  if (!status) return null;
  return {
    id: `${service}:${id}`,
    service,
    serviceLabel: SERVICE_LABEL_BY_BUILDER[service],
    label,
    status,
    reviewDate,
  };
};

const getPayloadReviewDate = (payload: unknown): string | undefined => {
  const row = payload as { contentReviewDate?: unknown } | null;
  return typeof row?.contentReviewDate === 'string' ? row.contentReviewDate : undefined;
};

type AdminTabMeta = {
  id: AdminTab;
  label: string;
  icon: React.ReactNode;
};

const isAdminBuilderPath = (pathname: string) => ['/admin/card-builder', '/admin/drug-builder', '/card-builder', '/drug-builder'].includes(pathname);

const parseAdminTabFromSearch = (search: string): AdminTab | null => {
  const value = new URLSearchParams(search).get('tab');
  return value === 'overview' || value === 'practices' || value === 'practiceUsers' || value === 'services' || value === 'library' || value === 'setup' || value === 'activationRequests' || value === 'audit' || value === 'demo'
    ? value
    : null;
};

const parseAdminTabFromLocation = (pathname: string, search: string): AdminTab | null => (
  isAdminBuilderPath(pathname) ? 'services' : parseAdminTabFromSearch(search)
);

const AdminDashboard: React.FC = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<AdminTab>(() => parseAdminTabFromLocation(window.location.pathname, window.location.search) || 'overview');
  const [practices, setPractices] = useState<Practice[]>([]);
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>(DEFAULT_PLATFORM_CONFIG);
  const [showCardBuilder, setShowCardBuilder] = useState(() => isAdminBuilderPath(window.location.pathname));
  const [cardBuilderSection, setCardBuilderSection] = useState<'medication' | 'healthcheck' | 'screening' | 'immunisation' | 'ltc'>('medication');
  const [loginAudit, setLoginAudit] = useState<LoginAuditEntry[]>([]);
  const [practiceSearch, setPracticeSearch] = useState('');
  const [practiceStatusFilter, setPracticeStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(true);
  const [loadingLoginAudit, setLoadingLoginAudit] = useState(true);
  const [expandedPracticeCards, setExpandedPracticeCards] = useState<Record<string, boolean>>({});
  const [expandedLoginAudit, setExpandedLoginAudit] = useState<Record<string, boolean>>({});
  const [authenticated, setAuthenticated] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newOds, setNewOds] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [addError, setAddError] = useState('');
  const [editingPractice, setEditingPractice] = useState<Practice | null>(null);
  const [localResources, setLocalResources] = useState<LocalResourceLink[]>([]);
  const [loadingLocalResources, setLoadingLocalResources] = useState(false);
  const [localResourceSearch, setLocalResourceSearch] = useState('');
  const [showLocalResourceForm, setShowLocalResourceForm] = useState(false);
  const [editingLocalResource, setEditingLocalResource] = useState<LocalResourceLink | null>(null);
  const [localResourceDraft, setLocalResourceDraft] = useState<LocalResourceDraft>(() => emptyLocalResourceDraft());
  const [localResourceError, setLocalResourceError] = useState('');
  const [editName, setEditName] = useState('');
  const [editOds, setEditOds] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editMedicationEnabled, setEditMedicationEnabled] = useState(true);
  const [editHealthcheckEnabled, setEditHealthcheckEnabled] = useState(false);
  const [editScreeningEnabled, setEditScreeningEnabled] = useState(false);
  const [editImmunisationEnabled, setEditImmunisationEnabled] = useState(false);
  const [editLtcEnabled, setEditLtcEnabled] = useState(false);
  const [editError, setEditError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    isDangerous: boolean;
    onConfirm: () => void;
  } | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [serviceRequests, setServiceRequests] = useState<ServiceActivationRequest[]>([]);
  const [loadingServiceRequests, setLoadingServiceRequests] = useState(false);
  const [serviceWorkItems, setServiceWorkItems] = useState<ServiceWorkItem[]>([]);
  const [loadingServiceWork, setLoadingServiceWork] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const pendingRequestCount = serviceRequests.filter(r => r.status === 'pending').length;
  const serviceWorkCount = serviceWorkItems.filter((item) => item.status === 'overdue' || item.status === 'missing').length;
  const serviceDueSoonCount = serviceWorkItems.filter((item) => item.status === 'dueSoon').length;

  const adminTabs: AdminTabMeta[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} aria-hidden="true" /> },
    { id: 'practices', label: 'Practices', icon: <Building2 size={16} aria-hidden="true" /> },
    { id: 'practiceUsers', label: 'Users', icon: <Users size={16} aria-hidden="true" /> },
    { id: 'services', label: 'Services Manager', icon: <LayoutGrid size={16} aria-hidden="true" /> },
    { id: 'library', label: 'Pathway Library', icon: <BookOpen size={16} aria-hidden="true" /> },
    { id: 'setup', label: 'Setup', icon: <Settings size={16} aria-hidden="true" /> },
    { id: 'activationRequests', label: 'Activation Requests', icon: <Bell size={16} aria-hidden="true" /> },
    { id: 'audit', label: 'User Audit', icon: <Activity size={16} aria-hidden="true" /> },
    { id: 'demo', label: 'Demo Access', icon: <FlaskConical size={16} aria-hidden="true" /> },
  ];

  const setAdminTab = (tab: AdminTab) => {
    setActiveTab(tab);
    if (tab === 'services') {
      setShowCardBuilder(false);
    }
    if (isAdminBuilderPath(location.pathname)) {
      navigate(resolvePath('/admin/dashboard'));
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate(resolvePath('/admin'));
  };

  useEffect(() => {
    const requestedTab = parseAdminTabFromLocation(location.pathname, location.search);
    if (!requestedTab) return;
    setActiveTab(requestedTab);
    if (requestedTab === 'services') {
      setShowCardBuilder(isAdminBuilderPath(location.pathname));
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'library') return;
    void loadLocalResources();
  }, [activeTab, authenticated]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'activationRequests') return;
    void loadServiceRequests();
  }, [activeTab, authenticated]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'services' || showCardBuilder) return;
    void loadServiceWork();
  }, [activeTab, authenticated, showCardBuilder]);

  useEffect(() => {
    const hydrate = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setAuthenticated(true);
        setCurrentUserEmail(session.user.email ?? '');
        loadDashboardData();
        void loadPlatformConfig();
        void loadServiceRequests();
        void loadServiceWork();
        return;
      }

      navigate(resolvePath('/admin'));
    };

    void hydrate();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session?.user) {
        setAuthenticated(true);
        loadDashboardData();
        void loadServiceRequests();
        void loadServiceWork();
      } else {
        navigate(resolvePath('/admin'));
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadDashboardData = async () => {
    setLoading(true);
    setLoadingLoginAudit(true);
    setLoadError('');

    try {
      const { data, error } = await supabase.functions.invoke('list-admin-dashboard');
      if (error) throw error;

      const payload = (data || {}) as AdminDashboardPayload;
      setPractices(payload.practices || []);
      setLoginAudit(
        (payload.loginAudit || []).map((row) => ({
          id: row.id,
          uid: row.uid,
          email: row.email,
          actorType: row.actor_type,
          actorName: row.actor_name,
          actorId: row.actor_id,
          adminRole: row.admin_role,
          portal: row.portal,
          userAgent: row.user_agent || '',
          ipAddress: row.ip_address || '',
          createdAtMs: new Date(row.created_at).getTime(),
        })),
      );
    } catch (error) {
      console.error('Error loading admin dashboard:', error);
      const message = await getFunctionErrorMessage(error, 'Unable to load admin dashboard data.');
      setLoadError(message);
      setPractices([]);
      setLoginAudit([]);
    } finally {
      setLoading(false);
      setLoadingLoginAudit(false);
    }
  };

  const togglePracticeCard = (practiceId: string) => {
    setExpandedPracticeCards((current) => ({
      ...current,
      [practiceId]: !current[practiceId],
    }));
  };

  const loadPlatformConfig = async () => {
    const { data } = await supabase.from('platform_config').select('*').eq('id', 1).maybeSingle();
    if (data) {
      setPlatformConfig({
        service_medication_enabled: data.service_medication_enabled ?? true,
        service_healthcheck_enabled: data.service_healthcheck_enabled ?? false,
        service_screening_enabled: data.service_screening_enabled ?? false,
        service_immunisation_enabled: data.service_immunisation_enabled ?? false,
        service_ltc_enabled: data.service_ltc_enabled ?? false,
      });
    }
  };

  const toggleGlobalService = async (key: keyof PlatformConfig, value: boolean) => {
    setPlatformConfig((prev) => ({ ...prev, [key]: value }));
    const { error } = await supabase
      .from('platform_config')
      .update({ [key]: value, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) {
      console.error('Failed to update platform config:', error);
      setPlatformConfig((prev) => ({ ...prev, [key]: !value }));
    }
  };

  const loadLoginAudit = async () => {
    await loadDashboardData();
  };

  const loadLocalResources = async () => {
    setLoadingLocalResources(true);
    setLocalResourceError('');
    try {
      setLocalResources(await fetchLocalResourceLinks(false));
    } catch (error) {
      console.error('Error loading local resource library:', error);
      setLocalResourceError(await getFunctionErrorMessage(error, 'Unable to load local resource library. Has the local-resource-links migration been applied?'));
      setLocalResources([]);
    } finally {
      setLoadingLocalResources(false);
    }
  };

  const loadServiceRequests = async () => {
    setLoadingServiceRequests(true);
    try {
      const { data, error } = await supabase
        .from('service_activation_requests')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setServiceRequests((data as ServiceActivationRequest[]) || []);
    } catch (error) {
      console.error('Error loading service requests:', error);
      setServiceRequests([]);
    } finally {
      setLoadingServiceRequests(false);
    }
  };

  const loadServiceWork = async () => {
    setLoadingServiceWork(true);
    try {
      const [medications, healthcheckRows, screeningRows, immunisationRows, ltcRows] = await Promise.all([
        loadMedicationCatalog(),
        fetchCardTemplates<HealthCheckTemplatePayload>('healthcheck'),
        fetchCardTemplates<ScreeningTemplate>('screening'),
        fetchCardTemplates<ImmunisationTemplate>('immunisation'),
        fetchCardTemplates<LongTermConditionTemplate>('ltc'),
      ]);

      const medicationItems = (medications as MedicationRecord[])
        .map((medication) => createReviewWorkItem('medication', medication.code, medication.title, medication.contentReviewDate))
        .filter((item): item is ServiceWorkItem => Boolean(item));

      const templateItems = [
        ...healthcheckRows.map((row) => createReviewWorkItem('healthcheck', row.template_id, row.label, getPayloadReviewDate(row.payload))),
        ...screeningRows.map((row) => createReviewWorkItem('screening', row.template_id, row.label, getPayloadReviewDate(row.payload))),
        ...immunisationRows.map((row) => createReviewWorkItem('immunisation', row.template_id, row.label, getPayloadReviewDate(row.payload))),
        ...ltcRows.map((row) => createReviewWorkItem('ltc', row.template_id, row.label, getPayloadReviewDate(row.payload))),
      ].filter((item): item is ServiceWorkItem => Boolean(item));

      const statusRank: Record<ServiceWorkStatus, number> = { overdue: 0, missing: 1, dueSoon: 2 };
      setServiceWorkItems([...medicationItems, ...templateItems].sort((left, right) => (
        statusRank[left.status] - statusRank[right.status] ||
        left.serviceLabel.localeCompare(right.serviceLabel) ||
        left.label.localeCompare(right.label)
      )));
    } catch (error) {
      console.error('Error loading service work alerts:', error);
      setServiceWorkItems([]);
    } finally {
      setLoadingServiceWork(false);
    }
  };

  const updateServiceRequest = async (requestId: string, newStatus: 'approved' | 'dismissed') => {
    try {
      const request = serviceRequests.find(r => r.id === requestId);
      if (!request) throw new Error('Request not found');

      // Do the meaningful action first: enable the service on the practice.
      // If this fails we leave the request pending so it can be retried.
      if (newStatus === 'approved') {
        const serviceKey = `${request.service}_enabled` as keyof Practice;
        const updateData = { [serviceKey]: true } as Record<string, boolean>;
        const { error: practiceError, data: updateResult } = await supabase
          .from('practices')
          .update(updateData)
          .eq('id', request.practice_id)
          .select();
        if (practiceError) throw practiceError;
        if (!updateResult || updateResult.length === 0) {
          throw new Error('Service flag was not updated — check practices RLS policy for admins.');
        }
      }

      // Then record the request outcome. A duplicate-key (23505) means an
      // identical outcome row already exists, which is fine — treat as success.
      const { error: statusError } = await supabase
        .from('service_activation_requests')
        .update({ status: newStatus })
        .eq('id', requestId);
      if (statusError && (statusError as { code?: string }).code !== '23505') {
        throw statusError;
      }

      await loadServiceRequests();
      await loadDashboardData();
      toast.success(`Request ${newStatus}${newStatus === 'approved' ? ' and service enabled' : ''}`);
    } catch (error) {
      const err = error as { message?: string; code?: string; details?: string; hint?: string };
      console.error('Error updating request:', {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
      });
      toast.error(err?.message || 'Failed to update request');
    }
  };

  const openLocalResourceForm = (resource?: LocalResourceLink) => {
    setEditingLocalResource(resource || null);
    setLocalResourceDraft(resource ? {
      title: resource.title,
      show_title_on_card: resource.show_title_on_card,
      description: resource.description,
      category: resource.category,
      website: resource.website,
      website_label: resource.website_label,
      phone: resource.phone,
      phone_label: resource.phone_label,
      email: resource.email,
      email_label: resource.email_label,
      city: resource.city,
      county_area: resource.county_area,
      is_active: resource.is_active,
    } : emptyLocalResourceDraft());
    setShowLocalResourceForm(true);
    setLocalResourceError('');
  };

  const closeLocalResourceForm = () => {
    setShowLocalResourceForm(false);
    setEditingLocalResource(null);
    setLocalResourceDraft(emptyLocalResourceDraft());
    setLocalResourceError('');
  };

  const updateLocalResourceDraft = <K extends keyof LocalResourceDraft>(field: K, value: LocalResourceDraft[K]) => {
    setLocalResourceDraft((current) => ({ ...current, [field]: value }));
  };

  const saveLocalResource = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalResourceError('');

    if (!localResourceDraft.title.trim()) {
      setLocalResourceError('Resource title is required.');
      return;
    }

    if (!localResourceDraft.website.trim() && !localResourceDraft.phone.trim() && !localResourceDraft.email.trim()) {
      setLocalResourceError('Add at least one website, phone, or email contact.');
      return;
    }

    try {
      await upsertLocalResourceLink({
        ...(editingLocalResource ? { id: editingLocalResource.id } : {}),
        ...localResourceDraft,
      });
      await loadLocalResources();
      toast.success(editingLocalResource ? 'Resource updated.' : 'Resource added.');
      closeLocalResourceForm();
    } catch (error) {
      console.error('Error saving local resource:', error);
      setLocalResourceError(await getFunctionErrorMessage(error, 'Unable to save local resource.'));
    }
  };

  const removeLocalResource = (resource: LocalResourceLink) => {
    setConfirmDialog({
      title: 'Remove Resource',
      message: `Remove "${resource.title}" from the local resource library? Existing cards that already imported this link will not be changed.`,
      confirmLabel: 'Remove Resource',
      isDangerous: true,
      onConfirm: async () => {
        try {
          await deleteLocalResourceLink(resource.id);
          await loadLocalResources();
          toast.success(`Removed ${resource.title}.`);
        } catch (error) {
          console.error('Error deleting local resource:', error);
          toast.error(await getFunctionErrorMessage(error, 'Unable to remove local resource.'));
        }
        setConfirmDialog(null);
      },
    });
  };

  const filteredLocalResources = useMemo(() => {
    const query = localResourceSearch.trim().toLowerCase();
    if (!query) return localResources;
    return localResources.filter((resource) =>
      [resource.title, resource.description, resource.category, resource.website, resource.phone, resource.email, resource.city, resource.county_area]
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [localResourceSearch, localResources]);

  const groupedLoginAudit = useMemo<LoginAuditGroup[]>(() => {
    const groups = new Map<string, LoginAuditGroup>();

    loginAudit.forEach((entry) => {
      const groupKey = `${entry.actorType}:${entry.portal}:${entry.email || entry.uid}`;
      const existing = groups.get(groupKey);

      if (existing) {
        existing.entries.push(entry);
        if (entry.createdAtMs > existing.latestCreatedAtMs) {
          existing.latestCreatedAtMs = entry.createdAtMs;
          existing.latestIpAddress = entry.ipAddress;
          existing.latestUserAgent = entry.userAgent;
        }
        return;
      }

      groups.set(groupKey, {
        key: groupKey,
        actorName: entry.actorName,
        email: entry.email,
        actorType: entry.actorType,
        portal: entry.portal,
        adminRole: entry.adminRole,
        actorId: entry.actorId,
        latestCreatedAtMs: entry.createdAtMs,
        latestIpAddress: entry.ipAddress,
        latestUserAgent: entry.userAgent,
        entries: [entry],
      });
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        entries: [...group.entries].sort((left, right) => right.createdAtMs - left.createdAtMs),
      }))
      .sort((left, right) => right.latestCreatedAtMs - left.latestCreatedAtMs);
  }, [loginAudit]);

  const serviceWorkByService = useMemo(() => (
    GLOBAL_SERVICES.reduce<Record<ServiceWorkItem['service'], { overdue: number; missing: number; dueSoon: number; totalWork: number }>>((acc, service) => {
      const items = serviceWorkItems.filter((item) => item.service === service.builderSection);
      const overdue = items.filter((item) => item.status === 'overdue').length;
      const missing = items.filter((item) => item.status === 'missing').length;
      const dueSoon = items.filter((item) => item.status === 'dueSoon').length;
      acc[service.builderSection] = { overdue, missing, dueSoon, totalWork: overdue + missing };
      return acc;
    }, {
      medication: { overdue: 0, missing: 0, dueSoon: 0, totalWork: 0 },
      healthcheck: { overdue: 0, missing: 0, dueSoon: 0, totalWork: 0 },
      screening: { overdue: 0, missing: 0, dueSoon: 0, totalWork: 0 },
      immunisation: { overdue: 0, missing: 0, dueSoon: 0, totalWork: 0 },
      ltc: { overdue: 0, missing: 0, dueSoon: 0, totalWork: 0 },
    })
  ), [serviceWorkItems]);

  const urgentServiceWorkItems = useMemo(
    () => serviceWorkItems.filter((item) => item.status === 'overdue' || item.status === 'missing').slice(0, 8),
    [serviceWorkItems],
  );

  const practiceSignupLink = useMemo(
    () => new URL(practiceUrl('/signup'), window.location.origin).toString(),
    [],
  );

  const toggleLoginAuditGroup = (key: string) => {
    setExpandedLoginAudit((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const toggleActive = async (practice: Practice) => {
    try {
      await supabase
        .from('practices')
        .update({ is_active: !practice.is_active })
        .eq('id', practice.id);
      await loadDashboardData();
    } catch (error) {
      console.error('Error updating practice:', error);
    }
  };

  const deletePractice = (practice: Practice) => {
    setConfirmDialog({
      title: 'Remove Practice',
      message: `Are you sure you want to remove "${practice.name}"? This action cannot be undone.`,
      // Include the target name so the user can't misclick a practice
      // they didn't intend to delete.
      confirmLabel: `Remove ${practice.name}`,
      isDangerous: true,
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('practices').delete().eq('id', practice.id);
          if (error) throw error;
          await loadDashboardData();
          toast.success(`Removed ${practice.name}.`);
        } catch (error) {
          console.error('Error deleting practice:', error);
          toast.error(`Could not remove ${practice.name}. Please try again.`);
        }
        setConfirmDialog(null);
      },
    });
  };

  const resetPracticeCounters = (practice: Practice) => {
    setConfirmDialog({
      title: 'Reset Practice Counters',
      message: `Reset patient link usage and satisfaction scores for "${practice.name}"? This will clear usage count, rating count, rating total, and last accessed date.`,
      confirmLabel: `Reset counters for ${practice.name}`,
      isDangerous: true,
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('practices').update({
            link_visit_count: 0,
            patient_rating_count: 0,
            patient_rating_total: 0,
            last_accessed: null,
            updated_at: new Date().toISOString(),
          }).eq('id', practice.id);
          if (error) throw error;
          await loadDashboardData();
          toast.success(`Counters reset for ${practice.name}.`);
        } catch (error) {
          console.error('Error resetting counters:', error);
          toast.error(`Could not reset counters for ${practice.name}. Please try again.`);
        }
        setConfirmDialog(null);
      },
    });
  };

  const getPracticeSatisfaction = (practice: Practice) => {
    const count = practice.patient_rating_count ?? 0;
    const total = practice.patient_rating_total ?? 0;
    if (count <= 0) {
      return 'No ratings';
    }

    return `${(total / count).toFixed(1)}/5 (${count})`;
  };

  const addPractice = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    if (!newName.trim()) {
      setAddError('Organisation name is required');
      return;
    }

    if (!newEmail.trim()) {
      setAddError('Contact email is required');
      return;
    }

    const emailError = validatePracticeContactEmail(newEmail);
    if (emailError) {
      setAddError(emailError);
      return;
    }

    try {
      // 1. Create the practice document
      const { error: insertError } = await supabase
        .from('practices')
        .insert({
          name: newName.trim(),
          ods_code: newOds.trim().toUpperCase(),
          contact_email: newEmail.trim(),
          is_active: true,
          link_visit_count: 0,
        });

      if (insertError) throw insertError;

      const addedName = newName.trim();
      setNewName('');
      setNewOds('');
      setNewEmail('');
      setShowAddForm(false);
      await loadDashboardData();
      toast.success(`Added ${addedName}.`);
    } catch (error) {
      console.error('Error adding practice:', error);
      setAddError('Failed to add practice. Please try again.');
    }
  };

  const openEditForm = (practice: Practice) => {
    setEditingPractice(practice);
    setEditName(practice.name);
    setEditOds(practice.ods_code || '');
    setEditEmail(practice.contact_email || '');
    setEditMedicationEnabled(practice.medication_enabled !== false);
    setEditHealthcheckEnabled(practice.healthcheck_enabled === true);
    setEditScreeningEnabled(practice.screening_enabled === true);
    setEditImmunisationEnabled(practice.immunisation_enabled === true);
    setEditLtcEnabled(practice.ltc_enabled === true);
    setEditError('');
  };

  const savePracticeEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');

    if (!editingPractice) return;

    if (!editName.trim()) {
      setEditError('Organisation name is required');
      return;
    }

    if (!editEmail.trim()) {
      setEditError('Contact email is required');
      return;
    }

    try {
      const updatePayload = {
        name: editName.trim(),
        ods_code: editOds.trim().toUpperCase(),
        contact_email: editEmail.trim(),
        medication_enabled: editMedicationEnabled,
        healthcheck_enabled: editHealthcheckEnabled,
        screening_enabled: editScreeningEnabled,
        immunisation_enabled: editImmunisationEnabled,
        ltc_enabled: editLtcEnabled,
      };

      let { error } = await supabase
        .from('practices')
        .update(updatePayload)
        .eq('id', editingPractice.id);

      if (error && /medication_enabled/i.test(error.message)) {
        const fallbackResult = await supabase
          .from('practices')
          .update({
            name: updatePayload.name,
            ods_code: updatePayload.ods_code,
            contact_email: updatePayload.contact_email,
            healthcheck_enabled: updatePayload.healthcheck_enabled,
            screening_enabled: updatePayload.screening_enabled,
            immunisation_enabled: updatePayload.immunisation_enabled,
            ltc_enabled: updatePayload.ltc_enabled,
          })
          .eq('id', editingPractice.id);

        error = fallbackResult.error;

        if (!error) {
          setEditError('Practice saved, but medication card toggling needs the latest Supabase migration before it will persist.');
        }
      }

      if (error) {
        throw error;
      }

      await loadDashboardData();
      const savedName = editName.trim();
      setEditingPractice(null);
      toast.success(`Saved changes to ${savedName}.`);
    } catch (error) {
      console.error('Error updating practice:', error);
      setEditError(await getFunctionErrorMessage(error, 'Failed to update practice. Please try again.'));
    }
  };

  if (!authenticated) return null;

  const activePracticeCount = practices.filter((practice) => practice.is_active).length;
  const enabledServiceCount = practices.reduce(
    (total, practice) => total + PRACTICE_FUNCTIONS.filter((feature) => feature.isEnabled(practice)).length,
    0,
  );
  const filteredPractices = practices.filter((practice) => {
    const matchesSearch = practiceSearch === '' || [practice.name, practice.ods_code || '', practice.contact_email || ''].some((field) =>
      field.toLowerCase().includes(practiceSearch.toLowerCase()),
    );
    const matchesStatus = practiceStatusFilter === 'all' || (practiceStatusFilter === 'active' ? practice.is_active : !practice.is_active);
    return matchesSearch && matchesStatus;
  });

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
    <div className="admin-portal-shell">
      <header className="admin-portal-header">
        {/* Brand */}
        <div className="admin-portal-header__top">
          <div className="admin-portal-header__brand">
            <span className="admin-portal-header__brand-text">
              <span className="admin-portal-header__title">
                MyMed<span>Info</span> <span className="admin-portal-header__admin-pill">Admin</span>
              </span>
              <span className="admin-portal-header__badge-small">Management Portal</span>
            </span>
          </div>
        </div>

        {/* Sectioned nav */}
        <nav className="admin-portal-nav" aria-label="Admin management areas">
          <span className="admin-portal-nav__section-label">Management</span>
          {(['overview', 'practices', 'practiceUsers'] as AdminTab[]).map((id) => {
            const tab = adminTabs.find((t) => t.id === id)!;
            return (
              <button key={tab.id} type="button"
                className={`admin-portal-nav__item${activeTab === tab.id ? ' admin-portal-nav__item--active' : ''}`}
                onClick={() => setAdminTab(tab.id)}>
                {tab.icon}<span>{tab.label}</span>
              </button>
            );
          })}

          <span className="admin-portal-nav__section-label">Content</span>
          {(['services', 'library'] as AdminTab[]).map((id) => {
            const tab = adminTabs.find((t) => t.id === id)!;
            const badgeCount = id === 'services' ? serviceWorkCount : 0;
            return (
              <button key={tab.id} type="button"
                className={[
                  'admin-portal-nav__item',
                  activeTab === tab.id ? 'admin-portal-nav__item--active' : '',
                  badgeCount > 0 ? 'admin-portal-nav__item--attention' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setAdminTab(tab.id)}>
                {tab.icon}<span>{tab.label}</span>
                {badgeCount > 0 && (
                  <span className="admin-portal-nav__alert-count" aria-label={`${badgeCount} service review ${badgeCount === 1 ? 'task' : 'tasks'}`}>
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}

          <span className="admin-portal-nav__section-label">System</span>
          {(['setup', 'activationRequests', 'audit', 'demo'] as AdminTab[]).map((id) => {
            const tab = adminTabs.find((t) => t.id === id)!;
            const badgeCount = id === 'activationRequests' ? pendingRequestCount : 0;
            return (
              <button key={tab.id} type="button"
                className={[
                  'admin-portal-nav__item',
                  activeTab === tab.id ? 'admin-portal-nav__item--active' : '',
                  badgeCount > 0 ? 'admin-portal-nav__item--attention' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setAdminTab(tab.id)}>
                {tab.icon}<span>{tab.label}</span>
                {badgeCount > 0 && (
                  <span className="admin-portal-nav__alert-count" aria-label={`${badgeCount} pending activation ${badgeCount === 1 ? 'request' : 'requests'}`}>
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Logout at bottom */}
        <div className="admin-portal-nav__bottom">
          <button type="button" className="admin-portal-nav__item" onClick={handleSignOut} style={{ width: '100%' }}>
            <LogOut size={16} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <div className="admin-portal-right">
        {/* Topbar */}
        <div className="admin-portal-topbar">
          <div className="admin-portal-topbar__left">
            <span className="admin-portal-topbar__crumb">MyMedInfo</span>
            <span className="admin-portal-topbar__sep">/</span>
            <span className="admin-portal-topbar__title">
              {adminTabs.find((t) => t.id === activeTab)?.label ?? 'Dashboard'}
            </span>
          </div>
          <div className="admin-portal-topbar__right">
            <div className="admin-portal-topbar__avatar" aria-hidden="true">
              {currentUserEmail ? currentUserEmail.slice(0, 2).toUpperCase() : 'A'}
            </div>
            <span className="admin-portal-topbar__name">{currentUserEmail || 'Administrator'}</span>
          </div>
        </div>

      <div className="admin-portal-content">
      {loadError && (
        <div className="dashboard-banner dashboard-banner--error" style={{ marginBottom: '1rem' }}>
          {loadError}
        </div>
      )}

      {activeTab === 'overview' && (
        <section className="dashboard-section">
          <div className="admin-stat-row">
            <div className="admin-stat-card">
              <div className="admin-stat-card__value">{practices.length}</div>
              <div className="admin-stat-card__label">Registered Practices</div>
              <button type="button" className="admin-stat-card__link" onClick={() => setAdminTab('practices')}>View all →</button>
            </div>
            <div className="admin-stat-card admin-stat-card--green">
              <div className="admin-stat-card__value">{activePracticeCount}</div>
              <div className="admin-stat-card__label">Active Practices</div>
              <button type="button" className="admin-stat-card__link" onClick={() => setAdminTab('practices')}>View active →</button>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-card__value">{enabledServiceCount}</div>
              <div className="admin-stat-card__label">Enabled Services</div>
              <button type="button" className="admin-stat-card__link" onClick={() => setAdminTab('practices')}>View breakdown →</button>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={loadDashboardData} className="admin-action-btn admin-action-btn--edit">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </section>
      )}

      {showAddForm && activeTab === 'practices' && (
        <div className="dashboard-panel dashboard-section" style={{ borderLeft: '4px solid #005eb8' }}>
          <div className="dashboard-panel-header">
            <h2 className="dashboard-panel-title">Add Practice</h2>
            <button
              onClick={() => setShowAddForm(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4c6272' }}
              aria-label="Close add practice form"
            >
              <X size={20} />
            </button>
          </div>
          <PracticeForm
            values={{ name: newName, odsCode: newOds, contactName: '', contactEmail: newEmail }}
            error={addError}
            loading={false}
            submitLabel="Add Practice"
            onSubmit={addPractice}
            onChange={(field, value) => {
              if (field === 'name') setNewName(value);
              if (field === 'odsCode') setNewOds(value);
              if (field === 'contactEmail') setNewEmail(value);
            }}
            showContactName={false}
            showImportantNotice={false}
            contactNameRequired={false}
          />
        </div>
      )}

      {editingPractice && (
        <Modal
          isOpen
          onClose={() => setEditingPractice(null)}
          size="md"
          title="Edit Practice"
          bodyClassName="dashboard-modal__body"
          footer={(
            <>
              <button type="button" onClick={() => setEditingPractice(null)} className="action-button admin-action-button--secondary">
                Cancel
              </button>
              <button type="submit" form="edit-practice-form" className="action-button admin-action-button--primary">
                Save Changes
              </button>
            </>
          )}
        >
          {editError && (
            <div className="dashboard-banner dashboard-banner--error" style={{ marginBottom: '1rem' }}>
              {editError}
            </div>
          )}
          <form onSubmit={savePracticeEdit} className="dashboard-modal__form" id="edit-practice-form">
            <div className="dashboard-field">
              <label>Organisation Name *</label>
              <input
                type="text" value={editName} onChange={e => setEditName(e.target.value)} required
                placeholder="Exact name as in SystmOne"
              />
            </div>
            <div className="dashboard-form-grid">
              <div className="dashboard-field">
                <label>ODS Code</label>
                <input
                  type="text" value={editOds} onChange={e => setEditOds(e.target.value)}
                  placeholder="e.g. C84001"
                />
              </div>
              <div className="dashboard-field">
                <label>Contact Email *</label>
                <input
                  type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} required
                  placeholder="e.g. admin@nhs.net"
                />
              </div>
            </div>
            <div className="dashboard-settings">
              <h3>Patient Information Functions</h3>
              <p>These shared card sets are controlled by administrators and stay off until enabled here for the practice.</p>
              <div className="dashboard-settings__grid">
                <label className="dashboard-setting-toggle">
                  <input type="checkbox" checked={editMedicationEnabled} onChange={(e) => setEditMedicationEnabled(e.target.checked)} />
                  Enable Medication Cards
                </label>
                <label className="dashboard-setting-toggle">
                  <input type="checkbox" checked={editHealthcheckEnabled} onChange={(e) => setEditHealthcheckEnabled(e.target.checked)} />
                  Enable Health Checks
                </label>
                <label className="dashboard-setting-toggle">
                  <input type="checkbox" checked={editScreeningEnabled} onChange={(e) => setEditScreeningEnabled(e.target.checked)} />
                  Enable Screening
                </label>
                <label className="dashboard-setting-toggle">
                  <input type="checkbox" checked={editImmunisationEnabled} onChange={(e) => setEditImmunisationEnabled(e.target.checked)} />
                  Enable Immunisations
                </label>
                <label className="dashboard-setting-toggle">
                  <input type="checkbox" checked={editLtcEnabled} onChange={(e) => setEditLtcEnabled(e.target.checked)} />
                  Enable Long Term Conditions
                </label>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {activeTab === 'library' && showLocalResourceForm && (
        <Modal
          isOpen
          onClose={closeLocalResourceForm}
          size="md"
          title={editingLocalResource ? 'Edit Local Resource' : 'Add Local Resource'}
          bodyClassName="dashboard-modal__body"
          closeOnOverlayClick={false}
          footer={(
            <>
              <button type="button" onClick={closeLocalResourceForm} className="action-button admin-action-button--secondary">
                Cancel
              </button>
              <button type="submit" form="local-resource-form" className="action-button admin-action-button--primary">
                Save Resource
              </button>
            </>
          )}
        >
          {localResourceError && (
            <div className="dashboard-banner dashboard-banner--error" style={{ marginBottom: '1rem' }}>
              {localResourceError}
            </div>
          )}
          <form onSubmit={saveLocalResource} className="dashboard-modal__form" id="local-resource-form">
            <div className="dashboard-field">
              <label>Service title *</label>
              <input
                type="text"
                value={localResourceDraft.title}
                onChange={(event) => updateLocalResourceDraft('title', event.target.value)}
                required
              />
            </div>
            <label className="dashboard-setting-toggle">
              <input
                type="checkbox"
                checked={localResourceDraft.show_title_on_card}
                onChange={(event) => updateLocalResourceDraft('show_title_on_card', event.target.checked)}
              />
              Show title on card
            </label>
            <div className="dashboard-field">
              <label>Category</label>
              <input
                type="text"
                value={localResourceDraft.category}
                onChange={(event) => updateLocalResourceDraft('category', event.target.value)}
                placeholder="e.g. Smoking, Weight management, Diabetes"
              />
            </div>
            <div className="dashboard-field">
              <label>Description</label>
              <textarea
                value={localResourceDraft.description}
                onChange={(event) => updateLocalResourceDraft('description', event.target.value)}
                rows={3}
              />
            </div>
            <div className="dashboard-form-grid">
              <div className="dashboard-field">
                <label>Phone number</label>
                <input
                  type="text"
                  value={localResourceDraft.phone}
                  onChange={(event) => updateLocalResourceDraft('phone', event.target.value)}
                />
              </div>
              <div className="dashboard-field">
                <label>Phone link text (optional)</label>
                <input
                  type="text"
                  value={localResourceDraft.phone_label}
                  onChange={(event) => updateLocalResourceDraft('phone_label', event.target.value)}
                  placeholder="e.g. Call service"
                />
              </div>
            </div>
            <div className="dashboard-form-grid">
              <div className="dashboard-field">
                <label>Email address</label>
                <input
                  type="email"
                  value={localResourceDraft.email}
                  onChange={(event) => updateLocalResourceDraft('email', event.target.value)}
                />
              </div>
              <div className="dashboard-field">
                <label>Email link text (optional)</label>
                <input
                  type="text"
                  value={localResourceDraft.email_label}
                  onChange={(event) => updateLocalResourceDraft('email_label', event.target.value)}
                  placeholder="e.g. Email the team"
                />
              </div>
            </div>
            <div className="dashboard-form-grid">
              <div className="dashboard-field">
                <label>Website</label>
                <input
                  type="text"
                  value={localResourceDraft.website}
                  onChange={(event) => updateLocalResourceDraft('website', event.target.value)}
                  placeholder="www.example.org.uk or https://..."
                />
              </div>
              <div className="dashboard-field">
                <label>Website link text (optional)</label>
                <input
                  type="text"
                  value={localResourceDraft.website_label}
                  onChange={(event) => updateLocalResourceDraft('website_label', event.target.value)}
                  placeholder="e.g. Visit website"
                />
              </div>
            </div>
            <div className="dashboard-form-grid">
              <div className="dashboard-field">
                <label>City</label>
                <select
                  value={localResourceDraft.city}
                  onChange={(event) => updateLocalResourceDraft('city', event.target.value)}
                >
                  <option value="">Select a city</option>
                  {ENGLAND_CITIES.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
              <div className="dashboard-field">
                <label>County / Area</label>
                <select
                  value={localResourceDraft.county_area}
                  onChange={(event) => updateLocalResourceDraft('county_area', event.target.value)}
                >
                  <option value="">Select a county / area</option>
                  {ENGLAND_COUNTY_AREAS.map((area) => (
                    <option key={area} value={area}>{area}</option>
                  ))}
                </select>
              </div>
            </div>
            <label className="dashboard-setting-toggle">
              <input
                type="checkbox"
                checked={localResourceDraft.is_active}
                onChange={(event) => updateLocalResourceDraft('is_active', event.target.checked)}
              />
              Available to card editors
            </label>
          </form>
        </Modal>
      )}

      {activeTab === 'practiceUsers' && (
        <PracticeUserManagement practices={practices} />
      )}

      {activeTab === 'practices' && (
      <div className="dashboard-panel dashboard-section">
        <div className="dashboard-panel-header">
          <div>
            <h2 className="dashboard-panel-title">
            Registered Practices ({practices.length})
            </h2>
            <p className="dashboard-panel-subtitle">Control which practices can use the service and keep their setup details up to date.</p>
          </div>
          {!showAddForm && (
            <button onClick={() => setShowAddForm(true)} className="action-button admin-action-button--primary">
              <Plus size={16} /> Add Practice
            </button>
          )}
        </div>

        {loading ? (
          <p style={{ color: '#4c6272' }}>Loading practices...</p>
        ) : practices.length === 0 ? (
          <p style={{ color: '#4c6272' }}>No practices registered yet. Share the sign-up link with practices.</p>
        ) : (
          <>
            <div className="dashboard-toolbar" style={{ marginBottom: '1rem' }}>
              <div className="dashboard-search">
                <input
                  type="text"
                  value={practiceSearch}
                  onChange={(e) => setPracticeSearch(e.target.value)}
                  placeholder="Search by name, ODS code, or email"
                  style={{ width: '100%', padding: '0.75rem 0.9rem', border: '2px solid #d8dde0', borderRadius: '8px', fontSize: '0.95rem' }}
                />
              </div>
              <div className="dashboard-chip-row">
                <button
                  className={`dashboard-chip${practiceStatusFilter === 'all' ? ' dashboard-chip--active' : ''}`}
                  onClick={() => setPracticeStatusFilter('all')}
                >
                  All
                </button>
                <button
                  className={`dashboard-chip${practiceStatusFilter === 'active' ? ' dashboard-chip--active' : ''}`}
                  onClick={() => setPracticeStatusFilter('active')}
                >
                  Active
                </button>
                <button
                  className={`dashboard-chip${practiceStatusFilter === 'inactive' ? ' dashboard-chip--active' : ''}`}
                  onClick={() => setPracticeStatusFilter('inactive')}
                >
                  Inactive
                </button>
              </div>
            </div>
            {filteredPractices.length === 0 ? (
              <p style={{ color: '#4c6272' }}>No practices match the current filters.</p>
            ) : (
              <div className="admin-data-table-wrap">
                <table className="admin-data-table admin-data-table--practices">
                  <thead>
                    <tr>
                      <th scope="col">Practice</th>
                      <th scope="col">ODS Code</th>
                      <th scope="col">Status</th>
                      <th scope="col">Services</th>
                      <th scope="col">Rating</th>
                      <th scope="col">Last Access</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPractices.map((practice) => {
                      const isExpanded = Boolean(expandedPracticeCards[practice.id]);
                      const ratingCount = practice.patient_rating_count ?? 0;
                      const ratingAvg = ratingCount > 0
                        ? (practice.patient_rating_total ?? 0) / ratingCount
                        : null;
                      const services = [
                        { key: 'medication_enabled' as const, short: 'Meds', enabled: practice.medication_enabled !== false },
                        { key: 'healthcheck_enabled' as const, short: 'HC', enabled: practice.healthcheck_enabled === true },
                        { key: 'immunisation_enabled' as const, short: 'Imm', enabled: practice.immunisation_enabled === true },
                        { key: 'screening_enabled' as const, short: 'Scr', enabled: practice.screening_enabled === true },
                        { key: 'ltc_enabled' as const, short: 'LTC', enabled: practice.ltc_enabled === true },
                      ];

                      return (
                        <React.Fragment key={practice.id}>
                          <tr className={practice.is_active ? 'admin-data-table__row--active' : 'admin-data-table__row--inactive'}>
                            <td>
                              <div className="admin-table-identity">
                                <strong>{practice.name}</strong>
                                {practice.contact_email && <span className="admin-table-identity__email">{practice.contact_email}</span>}
                              </div>
                            </td>
                            <td>
                              {practice.ods_code
                                ? <span className="admin-ods-badge">{practice.ods_code}</span>
                                : <span className="admin-table-muted">—</span>}
                            </td>
                            <td>
                              <span className={`admin-status-dot ${practice.is_active ? 'admin-status-dot--active' : 'admin-status-dot--inactive'}`}>
                                <span className="admin-status-dot__circle" aria-hidden="true" />
                                {practice.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td>
                              <div className="admin-service-pills">
                                {services.map((svc) => (
                                  <span
                                    key={svc.key}
                                    className={`admin-service-pill ${svc.enabled ? 'admin-service-pill--on' : 'admin-service-pill--off'}`}
                                  >
                                    {svc.short}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>
                              {ratingAvg !== null ? (
                                <span className="admin-rating">
                                  <Star size={13} className="admin-rating__star" aria-hidden="true" />
                                  {ratingAvg.toFixed(1)}
                                  <span className="admin-rating__count">({ratingCount})</span>
                                </span>
                              ) : (
                                <span className="admin-table-muted">No ratings</span>
                              )}
                            </td>
                            <td>
                              <span className="admin-table-date">
                                {practice.last_accessed
                                  ? new Date(practice.last_accessed).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                                  : <span className="admin-table-muted">Never</span>}
                              </span>
                            </td>
                            <td>
                              <div className="admin-table-actions">
                                <button
                                  onClick={() => openEditForm(practice)}
                                  className="admin-action-btn admin-action-btn--edit"
                                  title="Edit practice"
                                >
                                  <Edit2 size={14} /> Edit
                                </button>
                                {practice.is_active ? (
                                  <button
                                    onClick={() => togglePracticeCard(practice.id)}
                                    className="admin-action-btn admin-action-btn--icon"
                                    aria-expanded={isExpanded}
                                    title="View details"
                                  >
                                    <Eye size={15} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => toggleActive(practice)}
                                    className="admin-action-btn admin-action-btn--activate"
                                    title="Activate practice"
                                  >
                                    Activate
                                  </button>
                                )}
                                <button
                                  onClick={() => deletePractice(practice)}
                                  className="admin-action-btn admin-action-btn--icon"
                                  title="Delete practice"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="admin-data-table__detail-row">
                              <td colSpan={7}>
                                <div className="dashboard-practice-detail-grid">
                                  <div className="dashboard-practice-stats">
                                    <div className="dashboard-practice-stat">
                                      <span className="dashboard-practice-stat-label">Uses</span>
                                      <strong>{practice.link_visit_count ?? 0}</strong>
                                    </div>
                                    <div className="dashboard-practice-stat">
                                      <span className="dashboard-practice-stat-label">Satisfaction</span>
                                      <strong>{getPracticeSatisfaction(practice)}</strong>
                                    </div>
                                    <div className="dashboard-practice-stat">
                                      <span className="dashboard-practice-stat-label">Last active</span>
                                      <strong>{practice.last_accessed ? new Date(practice.last_accessed).toLocaleDateString('en-GB') : 'No visits yet'}</strong>
                                    </div>
                                  </div>
                                  <div className="dashboard-practice-feature-panel dashboard-practice-feature-panel--full">
                                    <div className="dashboard-practice-feature-title">Active functions</div>
                                    <div className="dashboard-practice-feature-list">
                                      {PRACTICE_FUNCTIONS.map((feature) => {
                                        const on = feature.isEnabled(practice);
                                        return (
                                          <div key={feature.key} className={`dashboard-practice-feature-item${on ? ' is-enabled' : ''}`}>
                                            <span className={`dashboard-practice-feature-icon${on ? ' is-enabled' : ''}`}>
                                              {on ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                            </span>
                                            <span>{feature.label}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
                                    <button onClick={() => toggleActive(practice)} className={`dashboard-pill-button ${practice.is_active ? 'dashboard-pill-button--danger' : 'dashboard-pill-button--success'}`}>
                                      {practice.is_active ? <><XCircle size={14} /> Deactivate</> : <><CheckCircle size={14} /> Activate</>}
                                    </button>
                                    <button onClick={() => resetPracticeCounters(practice)} className="dashboard-pill-button dashboard-pill-button--muted">
                                      <RefreshCw size={14} /> Reset counters
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </>
        )}
      </div>
      )}

      {activeTab === 'setup' && (
      <div className="dashboard-panel dashboard-section">
        <div className="dashboard-panel-header">
          <div>
            <h2 className="dashboard-panel-title">Practice Sign-up Link</h2>
            <p className="dashboard-panel-subtitle">Share this link with practices that want to register.</p>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(practiceSignupLink)}
            className="admin-action-btn admin-action-btn--edit"
          >
            Copy Link
          </button>
        </div>
        <div className="admin-code-block">
          {practiceSignupLink}
        </div>
        <div className="dashboard-banner dashboard-banner--info" style={{ marginTop: '1rem' }}>
          Use the Users tab to create accounts, assign users to multiple practices, and send reset links after accounts are created.
        </div>
      </div>
      )}

      {activeTab === 'activationRequests' && (
      <div className="dashboard-panel dashboard-section">
        <div className="dashboard-panel-header">
          <div>
            <h2 className="dashboard-panel-title">Service Activation Requests</h2>
            <p className="dashboard-panel-subtitle">Review and action requests from practices to enable services.</p>
          </div>
        </div>
        {loadingServiceRequests ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#4c6272' }}>Loading requests...</div>
        ) : serviceRequests.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#4c6272' }}>No service requests yet</div>
        ) : (
          <div className="admin-data-table-wrap">
            <table className="admin-data-table" style={{ minWidth: 640, tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th scope="col">Practice</th>
                  <th scope="col">Service</th>
                  <th scope="col">Requested By</th>
                  <th scope="col">Date</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {serviceRequests.map((request) => (
                  <tr key={request.id}>
                    <td style={{ fontWeight: 500 }}>{request.practice_name}</td>
                    <td>{request.service}</td>
                    <td style={{ fontSize: '0.9em', color: '#4c6272' }}>{request.requested_by_email}</td>
                    <td style={{ fontSize: '0.9em', color: '#6b7280' }}>{new Date(request.updated_at).toLocaleDateString('en-GB')}</td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        paddingLeft: 6,
                        paddingRight: 6,
                        paddingTop: 3,
                        paddingBottom: 3,
                        borderRadius: 4,
                        fontSize: '0.85em',
                        fontWeight: 600,
                        backgroundColor: request.status === 'pending' ? 'rgba(251, 191, 36, 0.15)' : request.status === 'approved' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                        color: request.status === 'pending' ? '#fbbf24' : request.status === 'approved' ? '#22c55e' : '#94a3b8',
                        textTransform: 'capitalize',
                      }}>
                        {request.status}
                      </span>
                    </td>
                    <td>
                      {request.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => updateServiceRequest(request.id, 'approved')}
                            style={{
                              background: 'rgba(34, 197, 94, 0.2)',
                              border: '1px solid rgba(34, 197, 94, 0.4)',
                              color: '#22c55e',
                              padding: '4px 10px',
                              borderRadius: 4,
                              fontSize: '0.85em',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => updateServiceRequest(request.id, 'dismissed')}
                            style={{
                              background: 'rgba(239, 68, 68, 0.2)',
                              border: '1px solid rgba(239, 68, 68, 0.4)',
                              color: '#ef4444',
                              padding: '4px 10px',
                              borderRadius: 4,
                              fontSize: '0.85em',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {activeTab === 'services' && !showCardBuilder && (
        <div className="dashboard-panel dashboard-section">
          <div className="dashboard-panel-header">
            <div>
              <h2 className="dashboard-panel-title">Services Manager</h2>
              <p className="dashboard-panel-subtitle">
                Control which services are available platform-wide. Disabled services are hidden from all practice portals regardless of per-practice settings.
              </p>
            </div>
            <button onClick={() => { setCardBuilderSection('medication'); setShowCardBuilder(true); }} className="action-button admin-action-button--primary">
              <Edit2 size={16} /> Card Builder
            </button>
          </div>
          <div className="admin-service-work-panel">
            <div className="admin-service-work-panel__summary">
              <div>
                <span className="admin-service-work-panel__eyebrow">Work alerts</span>
                <strong>
                  {loadingServiceWork
                    ? 'Checking service reviews...'
                    : serviceWorkCount > 0
                      ? `${serviceWorkCount} review ${serviceWorkCount === 1 ? 'task' : 'tasks'} need attention`
                      : 'No overdue review work'}
                </strong>
                <span>
                  {serviceDueSoonCount > 0
                    ? `${serviceDueSoonCount} review ${serviceDueSoonCount === 1 ? 'is' : 'are'} due in the next 30 days.`
                    : 'Services with current review dates will stay quiet here.'}
                </span>
              </div>
              {serviceWorkCount > 0 && (
                <span className="admin-service-work-panel__badge">{serviceWorkCount}</span>
              )}
            </div>
            {!loadingServiceWork && urgentServiceWorkItems.length > 0 && (
              <div className="admin-service-work-list">
                {urgentServiceWorkItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="admin-service-work-item"
                    onClick={() => { setCardBuilderSection(item.service); setShowCardBuilder(true); }}
                  >
                    <span className={`admin-service-work-item__status admin-service-work-item__status--${item.status}`}>
                      {item.status === 'overdue' ? 'Overdue' : 'No review'}
                    </span>
                    <span className="admin-service-work-item__text">
                      <strong>{item.label}</strong>
                      <span>{item.serviceLabel}{item.reviewDate ? ` · Review date ${item.reviewDate}` : ''}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="admin-data-table-wrap">
            <table className="admin-data-table" style={{ minWidth: 640, tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col">Platform Status</th>
                  <th scope="col">Practices Enabled</th>
                  <th scope="col">Content Work</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {GLOBAL_SERVICES.map((service) => {
                  const isEnabled = platformConfig[service.configKey];
                  const practiceFn = PRACTICE_FUNCTIONS.find((f) => f.key === service.practiceKey);
                  const enabledCount = practiceFn ? practices.filter((p) => practiceFn.isEnabled(p)).length : 0;
                  const work = serviceWorkByService[service.builderSection];
                  return (
                    <tr key={service.configKey}>
                      <td>
                        <div className="admin-table-identity">
                          <strong>{service.label}</strong>
                          <span className="admin-table-identity__email">{service.description}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`admin-status-dot ${isEnabled ? 'admin-status-dot--active' : 'admin-status-dot--inactive'}`}>
                          <span className="admin-status-dot__circle" aria-hidden="true" />
                          {isEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{enabledCount}</span>
                        <span style={{ color: '#9ca3af', fontSize: 13 }}> / {practices.length}</span>
                      </td>
                      <td>
                        {work.totalWork > 0 ? (
                          <button
                            type="button"
                            className="admin-service-work-chip admin-service-work-chip--alert"
                            onClick={() => { setCardBuilderSection(service.builderSection); setShowCardBuilder(true); }}
                          >
                            {work.totalWork} to review
                          </button>
                        ) : work.dueSoon > 0 ? (
                          <span className="admin-service-work-chip admin-service-work-chip--soon">
                            {work.dueSoon} due soon
                          </span>
                        ) : (
                          <span className="admin-service-work-chip admin-service-work-chip--clear">
                            Clear
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="admin-table-actions">
                          <button
                            onClick={() => void toggleGlobalService(service.configKey, !isEnabled)}
                            className={`admin-action-btn ${isEnabled ? 'admin-action-btn--icon' : 'admin-action-btn--edit'}`}
                          >
                            {isEnabled ? <XCircle size={14} /> : <CheckCircle size={14} />}
                            {isEnabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            onClick={() => { setCardBuilderSection(service.builderSection); setShowCardBuilder(true); }}
                            className="admin-action-btn admin-action-btn--icon"
                            title="Open card builder"
                          >
                            <Edit2 size={14} />
                          </button>
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

      {activeTab === 'services' && showCardBuilder && (
        <CardBuilder
          embedded
          initialSection={cardBuilderSection}
          enabledServices={{
            medication: platformConfig.service_medication_enabled,
            healthcheck: platformConfig.service_healthcheck_enabled,
            screening: platformConfig.service_screening_enabled,
            immunisation: platformConfig.service_immunisation_enabled,
            ltc: platformConfig.service_ltc_enabled,
          }}
          onBack={() => setShowCardBuilder(false)}
        />
      )}

      {activeTab === 'library' && (
      <div className="dashboard-panel dashboard-section">
        <div className="dashboard-panel-header">
          <div>
            <h2 className="dashboard-panel-title">Local Resource Library</h2>
            <p className="dashboard-panel-subtitle">Maintain reusable local support links that can be applied to cards across every service.</p>
          </div>
          <div className="dashboard-inline-actions">
            <button onClick={() => { setActiveTab('services'); setShowCardBuilder(true); }} className="action-button admin-action-button--secondary">
              <Edit2 size={16} /> Open Card Builder
            </button>
            <button onClick={() => openLocalResourceForm()} className="action-button admin-action-button--primary">
              <Plus size={16} /> Add Resource
            </button>
          </div>
        </div>

        {localResourceError && (
          <div className="dashboard-banner dashboard-banner--error" style={{ marginBottom: '1rem' }}>
            {localResourceError}
          </div>
        )}

        <div className="dashboard-toolbar" style={{ marginBottom: '1rem' }}>
          <div className="dashboard-search">
            <input
              type="text"
              value={localResourceSearch}
              onChange={(event) => setLocalResourceSearch(event.target.value)}
              placeholder="Search resources by title, category, contact, or description"
              style={{ width: '100%', padding: '0.75rem 0.9rem', border: '2px solid #d8dde0', borderRadius: '8px', fontSize: '0.95rem' }}
            />
          </div>
          <button onClick={loadLocalResources} className="action-button admin-action-button--secondary">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        {loadingLocalResources ? (
          <p style={{ color: '#4c6272' }}>Loading local resources...</p>
        ) : filteredLocalResources.length === 0 ? (
          <p style={{ color: '#4c6272' }}>No local resources found yet.</p>
        ) : (
          <div className="admin-data-table-wrap">
            <table className="admin-data-table admin-data-table--resources">
              <thead>
                <tr>
                  <th scope="col" className="admin-data-table__col-resource-title">Resource</th>
                  <th scope="col" className="admin-data-table__col-resource-status">Status</th>
                  <th scope="col" className="admin-data-table__col-resource-category">Category</th>
                  <th scope="col" className="admin-data-table__col-resource-contact">Contact / Location</th>
                  <th scope="col" className="admin-data-table__col-resource-link">Website</th>
                  <th scope="col" className="admin-data-table__col-resource-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLocalResources.map((resource) => (
                  <tr key={resource.id}>
                    <td className="admin-data-table__col-resource-title">
                      <div className="admin-table-identity">
                        <strong>{resource.title}</strong>
                        {resource.description && <span className="admin-table-identity__email">{resource.description}</span>}
                      </div>
                    </td>
                    <td className="admin-data-table__col-resource-status">
                      <span className={`admin-status-dot ${resource.is_active ? 'admin-status-dot--active' : 'admin-status-dot--inactive'}`}>
                        <span className="admin-status-dot__circle" aria-hidden="true" />
                        {resource.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="admin-data-table__col-resource-category">
                      {resource.category
                        ? <span className="admin-ods-badge">{resource.category}</span>
                        : <span className="admin-table-muted">—</span>}
                    </td>
                    <td className="admin-data-table__col-resource-contact">
                      <div className="admin-table-identity">
                        {resource.phone && <span>{resource.phone}</span>}
                        {resource.email && <span className="admin-table-identity__email">{resource.email}</span>}
                        {(resource.city || resource.county_area) && (
                          <span className="admin-table-identity__email">{[resource.city, resource.county_area].filter(Boolean).join(', ')}</span>
                        )}
                        {!resource.phone && !resource.email && !resource.city && !resource.county_area && (
                          <span className="admin-table-muted">—</span>
                        )}
                      </div>
                    </td>
                    <td className="admin-data-table__col-resource-link">
                      {resource.website
                        ? <a href={resource.website} target="_blank" rel="noopener noreferrer" title={resource.website} style={{ color: '#005eb8' }}>
                            <ExternalLink size={16} />
                          </a>
                        : <span className="admin-table-muted">—</span>}
                    </td>
                    <td className="admin-data-table__col-resource-actions">
                      <div className="admin-table-actions">
                        <button onClick={() => openLocalResourceForm(resource)} className="admin-action-btn admin-action-btn--edit">
                          <Edit2 size={14} /> Edit
                        </button>
                        <button onClick={() => removeLocalResource(resource)} className="admin-action-btn admin-action-btn--icon" title="Remove resource">
                          <Trash2 size={15} />
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
      )}

      {activeTab === 'audit' && (
        <div className="dashboard-panel dashboard-section">
          <div className="dashboard-panel-header">
            <div>
              <h2 className="dashboard-panel-title">
              Recent User Audit ({groupedLoginAudit.length})
              </h2>
              <p className="dashboard-panel-subtitle">Successful sign-ins grouped by user so repeated logins stay tidy.</p>
            </div>
            <button onClick={loadLoginAudit} className="action-button admin-action-button--secondary">
              <RefreshCw size={16} /> Refresh Logins
            </button>
          </div>

          {loadingLoginAudit ? (
            <p style={{ color: '#4c6272' }}>Loading login audit...</p>
          ) : groupedLoginAudit.length === 0 ? (
            <p style={{ color: '#4c6272' }}>No successful sign-ins recorded yet.</p>
          ) : (
            <div className="admin-data-table-wrap" style={{ marginBottom: '1rem' }}>
              <table className="admin-data-table admin-data-table--audit">
                <thead>
                  <tr>
                    <th scope="col">User</th>
                    <th scope="col">Type</th>
                    <th scope="col">Portal</th>
                    <th scope="col">Logins</th>
                    <th scope="col">Latest Sign-in</th>
                    <th scope="col">Latest IP</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedLoginAudit.map((group) => {
                    const isExpanded = Boolean(expandedLoginAudit[group.key]);

                    return (
                      <React.Fragment key={group.key}>
                        <tr>
                          <td>
                            <div className="admin-table-identity">
                              <strong>{group.actorName}</strong>
                              <span className="admin-table-identity__email">{group.email}</span>
                              {group.adminRole && <span className="admin-table-identity__email">{group.adminRole}</span>}
                            </div>
                          </td>
                          <td>
                            <span className={`admin-role-badge admin-role-badge--${group.actorType === 'admin' ? 'owner' : 'practice'}`}>
                              {group.actorType === 'admin' ? 'Admin' : 'Practice'}
                            </span>
                          </td>
                          <td>
                            <span className="admin-role-badge admin-role-badge--portal">
                              {group.portal}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{group.entries.length}</span>
                          </td>
                          <td>
                            <span className="admin-table-date">{new Date(group.latestCreatedAtMs).toLocaleString('en-GB')}</span>
                          </td>
                          <td>
                            <span className="admin-table-date">{group.latestIpAddress || <span className="admin-table-muted">—</span>}</span>
                          </td>
                          <td>
                            <div className="admin-table-actions">
                              <button
                                onClick={() => toggleLoginAuditGroup(group.key)}
                                className="admin-action-btn admin-action-btn--icon"
                                title={isExpanded ? 'Hide history' : 'View history'}
                              >
                                {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="admin-data-table__detail-row">
                            <td colSpan={7}>
                              <div className="dashboard-audit-history">
                                {group.entries.map((entry, index) => (
                                  <div key={entry.id} className="dashboard-audit-history-row">
                                    <div className="dashboard-meta" style={{ margin: 0 }}>
                                      <span>{index === 0 ? 'Latest login' : `Login ${index + 1}`}</span>
                                      <span>{new Date(entry.createdAtMs).toLocaleString('en-GB')}</span>
                                      <span>IP: {entry.ipAddress || '—'}</span>
                                    </div>
                                    <div className="dashboard-meta" style={{ marginTop: '0.25rem' }}>
                                      <span title={entry.userAgent} style={{ fontSize: 12, color: '#6b7280' }}>
                                        {entry.userAgent || '—'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'demo' && (
        <div className="dashboard-panel dashboard-section">
          <div className="dashboard-panel-header">
            <div>
              <h2 className="dashboard-panel-title">Demo Access</h2>
              <p className="dashboard-panel-subtitle">Open a realistic patient sample for each content type.</p>
            </div>
          </div>
          <div className="admin-data-table-wrap">
            <table className="admin-data-table admin-data-table--demo">
              <thead>
                <tr>
                  <th scope="col">Content Type</th>
                  <th scope="col">Description</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { type: 'medication', label: 'Medication Cards', desc: 'Structured medication review cards with risk stratification.' },
                  { type: 'healthcheck', label: 'Health Check', desc: 'NHS Health Check assessment pathway.' },
                  { type: 'screening', label: 'Screening', desc: 'Cancer and vascular screening recommendations.' },
                  { type: 'immunisation', label: 'Immunisation', desc: 'Vaccination schedule and reminder cards.' },
                  { type: 'ltc', label: 'Long Term Condition', desc: 'Chronic disease management pathways.' },
                ] as const).map(({ type, label, desc }) => (
                  <tr key={type}>
                    <td><strong style={{ fontSize: 14 }}>{label}</strong></td>
                    <td><span style={{ fontSize: 13, color: '#6b7280' }}>{desc}</span></td>
                    <td>
                      <div className="admin-table-actions">
                        <button onClick={() => navigate(buildDemoPatientUrlForType(type))} className="admin-action-btn admin-action-btn--edit">
                          <Eye size={14} /> Open Demo
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
      </div>
    </div>
    </>
  );
};

export default AdminDashboard;
