import React, { useMemo, useState, useEffect } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BookOpen,
  Building2,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Edit2,
  Eye,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
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

interface AdminUser {
  uid: string;
  email: string;
  name: string;
  is_active: boolean;
  role: 'owner' | 'admin';
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

type AdminTab = 'overview' | 'practices' | 'practiceUsers' | 'admins' | 'library' | 'setup' | 'audit' | 'demo';

type AdminTabMeta = {
  id: AdminTab;
  label: string;
  icon: React.ReactNode;
};

const parseAdminTabFromSearch = (search: string): AdminTab | null => {
  const value = new URLSearchParams(search).get('tab');
  return value === 'overview' || value === 'practices' || value === 'practiceUsers' || value === 'admins' || value === 'library' || value === 'setup' || value === 'audit' || value === 'demo'
    ? value
    : null;
};

const AdminDashboard: React.FC = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<AdminTab>(() => parseAdminTabFromSearch(window.location.search) || 'overview');
  const [practices, setPractices] = useState<Practice[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loginAudit, setLoginAudit] = useState<LoginAuditEntry[]>([]);
  const [practiceSearch, setPracticeSearch] = useState('');
  const [practiceStatusFilter, setPracticeStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(true);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [loadingLoginAudit, setLoadingLoginAudit] = useState(true);
  const [expandedPracticeCards, setExpandedPracticeCards] = useState<Record<string, boolean>>({});
  const [expandedLoginAudit, setExpandedLoginAudit] = useState<Record<string, boolean>>({});
  const [authenticated, setAuthenticated] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddAdminForm, setShowAddAdminForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newOds, setNewOds] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [addError, setAddError] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [addAdminError, setAddAdminError] = useState('');
  const [editingPractice, setEditingPractice] = useState<Practice | null>(null);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
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
  const [editAdminName, setEditAdminName] = useState('');
  const [editAdminEmail, setEditAdminEmail] = useState('');
  const [editAdminActive, setEditAdminActive] = useState(true);
  const [editAdminError, setEditAdminError] = useState('');
  const [adminActionMessage, setAdminActionMessage] = useState('');
  const [adminActionLink, setAdminActionLink] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    isDangerous: boolean;
    onConfirm: () => void;
  } | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const toast = useToast();
  const navigate = useNavigate();

  const adminTabs: AdminTabMeta[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} aria-hidden="true" /> },
    { id: 'practices', label: 'Practices', icon: <Building2 size={16} aria-hidden="true" /> },
    { id: 'practiceUsers', label: 'Users', icon: <Users size={16} aria-hidden="true" /> },
    { id: 'admins', label: 'Administrators', icon: <ShieldCheck size={16} aria-hidden="true" /> },
    { id: 'library', label: 'Pathway Library', icon: <BookOpen size={16} aria-hidden="true" /> },
    { id: 'setup', label: 'Setup', icon: <Settings size={16} aria-hidden="true" /> },
    { id: 'audit', label: 'User Audit', icon: <Activity size={16} aria-hidden="true" /> },
    { id: 'demo', label: 'Demo Access', icon: <FlaskConical size={16} aria-hidden="true" /> },
  ];

  const setAdminTab = (tab: AdminTab) => {
    setActiveTab(tab);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate(resolvePath('/admin'));
  };

  useEffect(() => {
    const requestedTab = parseAdminTabFromSearch(location.search);
    if (!requestedTab) return;
    setActiveTab(requestedTab);
  }, [location.search]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'library') return;
    void loadLocalResources();
  }, [activeTab, authenticated]);

  useEffect(() => {
    const hydrate = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setAuthenticated(true);
        setCurrentUserEmail(session.user.email ?? '');
        loadDashboardData();
        return;
      }

      navigate(resolvePath('/admin'));
    };

    void hydrate();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session?.user) {
        setAuthenticated(true);
        loadDashboardData();
      } else {
        navigate(resolvePath('/admin'));
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadDashboardData = async () => {
    setLoading(true);
    setLoadingAdmins(true);
    setLoadingLoginAudit(true);
    setLoadError('');

    try {
      const { data, error } = await supabase.functions.invoke('list-admin-dashboard');
      if (error) throw error;

      const payload = (data || {}) as AdminDashboardPayload;
      setPractices(payload.practices || []);
      setAdminUsers(
        (payload.admins || [])
          .filter((row) => row.global_role === 'owner' || row.global_role === 'admin')
          .map((row) => ({
            uid: row.uid,
            email: row.email,
            name: row.name,
            is_active: row.is_active,
            role: row.global_role as 'owner' | 'admin',
          })),
      );
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
      setAdminUsers([]);
      setLoginAudit([]);
    } finally {
      setLoading(false);
      setLoadingAdmins(false);
      setLoadingLoginAudit(false);
    }
  };

  const togglePracticeCard = (practiceId: string) => {
    setExpandedPracticeCards((current) => ({
      ...current,
      [practiceId]: !current[practiceId],
    }));
  };

  const loadAdmins = async () => {
    await loadDashboardData();
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

  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddAdminError('');

    if (!newAdminEmail.trim()) {
      setAddAdminError('Administrator email is required');
      return;
    }

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('create-admin-user', {
        body: { email: newAdminEmail.trim(), name: newAdminName.trim() },
      });
      if (invokeError) throw invokeError;
      const nextEmail = newAdminEmail.trim();
      setNewAdminName('');
      setNewAdminEmail('');
      setShowAddAdminForm(false);
      setAdminActionMessage(
        data?.created === false
          ? `Global administrator access added for ${nextEmail}. Any existing practice memberships remain in place.`
          : `Administrator created. Copy the setup link below and send it to ${nextEmail}.`,
      );
      setAdminActionLink(data?.resetLink || '');
      toast.success(`Administrator ready for ${nextEmail}.`);
      loadAdmins();
    } catch (error) {
      console.error('Error adding admin:', error);
      setAddAdminError(await getFunctionErrorMessage(error, 'Failed to add administrator'));
    }
  };

  const openAdminEditForm = (adminUser: AdminUser) => {
    setEditingAdmin(adminUser);
    setEditAdminName(adminUser.name);
    setEditAdminEmail(adminUser.email);
    setEditAdminActive(adminUser.is_active);
    setEditAdminError('');
  };

  const saveAdminEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditAdminError('');

    if (!editingAdmin) return;

    try {
      const { error: invokeError } = await supabase.functions.invoke('update-admin-user', {
        body: {
          uid: editingAdmin.uid,
          email: editAdminEmail.trim(),
          name: editAdminName.trim(),
          isActive: editAdminActive,
        },
      });
      if (invokeError) throw invokeError;
      setEditingAdmin(null);
      loadAdmins();
    } catch (error) {
      console.error('Error updating admin:', error);
      setEditAdminError(await getFunctionErrorMessage(error, 'Failed to update administrator'));
    }
  };

  const resetAdminPassword = async (adminUser: AdminUser) => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('send-admin-password-reset', {
        body: { uid: adminUser.uid },
      });
      if (invokeError) throw invokeError;
      setAdminActionMessage(`Password reset link prepared for ${adminUser.email}. Copy and send it manually.`);
      setAdminActionLink(data.resetLink || '');
    } catch (error) {
      console.error('Error sending reset:', error);
      alert(await getFunctionErrorMessage(error, 'Failed to send password reset'));
    }
  };

  const deleteAdmin = (adminUser: AdminUser) => {
    setConfirmDialog({
      title: 'Remove Administrator',
      message: `Remove administrator "${adminUser.email}"? This action cannot be undone.`,
      confirmLabel: 'Remove',
      isDangerous: true,
      onConfirm: async () => {
        try {
          const { data, error: invokeError } = await supabase.functions.invoke('delete-admin-user', {
            body: { uid: adminUser.uid },
          });
          if (invokeError) throw invokeError;
          setAdminActionMessage(
            data?.demotedOnly
              ? `${adminUser.email} still has practice access, so only their global administrator role was removed.`
              : `${adminUser.email} was deleted completely.`,
          );
          setAdminActionLink('');
          loadAdmins();
        } catch (error) {
          console.error('Error deleting admin:', error);
          alert(await getFunctionErrorMessage(error, 'Failed to remove administrator'));
        }
        setConfirmDialog(null);
      },
    });
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
            <div className="admin-portal-header__brand-mark" aria-hidden="true">
              <img src="/mymedinfo-mark.svg" alt="" style={{ width: 20, height: 20, filter: 'brightness(0) invert(1)' }} />
            </div>
            <span className="admin-portal-header__brand-text">
              <span className="admin-portal-header__title">
                MyMedInfo <span className="admin-portal-header__admin-pill">Admin</span>
              </span>
              <span className="admin-portal-header__badge-small">Management Portal</span>
            </span>
          </div>
        </div>

        {/* Sectioned nav */}
        <nav className="admin-portal-nav" aria-label="Admin management areas">
          <span className="admin-portal-nav__section-label">Management</span>
          {(['overview', 'practices', 'practiceUsers', 'admins'] as AdminTab[]).map((id) => {
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
          <button
            type="button"
            className="admin-portal-nav__item"
            onClick={() => navigate(resolvePath('/admin/card-builder'))}
          >
            <Edit2 size={16} aria-hidden="true" />
            <span>Card Builder</span>
          </button>
          {(['library'] as AdminTab[]).map((id) => {
            const tab = adminTabs.find((t) => t.id === id)!;
            return (
              <button key={tab.id} type="button"
                className={`admin-portal-nav__item${activeTab === tab.id ? ' admin-portal-nav__item--active' : ''}`}
                onClick={() => setAdminTab(tab.id)}>
                {tab.icon}<span>{tab.label}</span>
              </button>
            );
          })}

          <span className="admin-portal-nav__section-label">System</span>
          {(['setup', 'audit', 'demo'] as AdminTab[]).map((id) => {
            const tab = adminTabs.find((t) => t.id === id)!;
            return (
              <button key={tab.id} type="button"
                className={`admin-portal-nav__item${activeTab === tab.id ? ' admin-portal-nav__item--active' : ''}`}
                onClick={() => setAdminTab(tab.id)}>
                {tab.icon}<span>{tab.label}</span>
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
              <div className="admin-stat-card__value">{adminUsers.length}</div>
              <div className="admin-stat-card__label">Administrators</div>
              <button type="button" className="admin-stat-card__link" onClick={() => setAdminTab('admins')}>Manage →</button>
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

      {(adminActionMessage || adminActionLink) && (
        <div className="dashboard-panel dashboard-section" style={{ borderLeft: '4px solid #005eb8' }}>
          <h2 className="dashboard-panel-title">Access Link Ready</h2>
          {adminActionMessage && (
            <p className="dashboard-panel-subtitle" style={{ marginBottom: adminActionLink ? '1rem' : '0' }}>
              {adminActionMessage}
            </p>
          )}
          {adminActionLink && (
            <>
              <textarea
                readOnly
                value={adminActionLink}
                rows={4}
                style={{ width: '100%', resize: 'vertical' }}
                className="dashboard-field"
              />
              <div className="dashboard-inline-actions" style={{ marginTop: '1rem' }}>
                <button
                  onClick={() => navigator.clipboard.writeText(adminActionLink)}
                  className="action-button admin-action-button--primary"
                >
                  Copy Link
                </button>
                <button
                  onClick={() => {
                    setAdminActionLink('');
                    setAdminActionMessage('');
                  }}
                  className="action-button admin-action-button--secondary"
                >
                  Clear
                </button>
              </div>
            </>
          )}
          {!adminActionLink && (
            <div className="dashboard-inline-actions" style={{ marginTop: '1rem' }}>
              <button
                onClick={() => {
                  setAdminActionLink('');
                  setAdminActionMessage('');
                }}
                className="action-button admin-action-button--secondary"
              >
                Clear
              </button>
            </div>
          )}
        </div>
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

      {showAddAdminForm && activeTab === 'admins' && (
        <div className="dashboard-panel dashboard-section" style={{ borderLeft: '4px solid #005eb8' }}>
          <div className="dashboard-panel-header">
            <h2 className="dashboard-panel-title">Add Administrator</h2>
            <button
              onClick={() => setShowAddAdminForm(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4c6272' }}
              aria-label="Close add administrator form"
            >
              <X size={20} />
            </button>
          </div>
          {addAdminError && (
            <div className="dashboard-banner dashboard-banner--error" style={{ marginBottom: '1rem' }}>
              {addAdminError}
            </div>
          )}
          <form onSubmit={addAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="dashboard-field">
              <label>Administrator Name</label>
              <input
                type="text" value={newAdminName} onChange={e => setNewAdminName(e.target.value)}
                placeholder="e.g. Jane Smith"
              />
            </div>
            <div className="dashboard-field">
              <label>Administrator Email *</label>
              <input
                type="email" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} required
                placeholder="e.g. admin@nhs.net"
              />
            </div>
            <button type="submit" className="action-button admin-action-button--primary" style={{ alignSelf: 'flex-start' }}>
              <Plus size={16} /> Add Administrator
            </button>
          </form>
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

      {editingAdmin && (
        <Modal
          isOpen
          onClose={() => setEditingAdmin(null)}
          size="sm"
          title="Edit Administrator"
          bodyClassName="dashboard-modal__body"
          footer={(
            <>
              <button type="button" onClick={() => setEditingAdmin(null)} className="action-button admin-action-button--secondary">
                Cancel
              </button>
              <button type="submit" form="edit-admin-form" className="action-button admin-action-button--primary">
                Save Changes
              </button>
            </>
          )}
        >
          {editAdminError && (
            <div className="dashboard-banner dashboard-banner--error" style={{ marginBottom: '1rem' }}>
              {editAdminError}
            </div>
          )}
          <form onSubmit={saveAdminEdit} className="dashboard-modal__form" id="edit-admin-form">
            <div className="dashboard-field">
              <label>Administrator Name *</label>
              <input
                type="text" value={editAdminName} onChange={e => setEditAdminName(e.target.value)} required
              />
            </div>
            <div className="dashboard-field">
              <label>Administrator Email *</label>
              <input
                type="email" value={editAdminEmail} onChange={e => setEditAdminEmail(e.target.value)} required
              />
            </div>
            <label className="dashboard-setting-toggle">
              <input
                type="checkbox"
                checked={editAdminActive}
                onChange={e => setEditAdminActive(e.target.checked)}
              />
              Administrator account active
            </label>
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
      <>
        <div className="dashboard-panel dashboard-section" style={{ borderLeft: '4px solid #005eb8' }}>
          <h2 className="dashboard-panel-title">User Management</h2>
          <p className="dashboard-panel-subtitle">
            Users can be practice admins, global admins, or both. Practice-linked users can belong to multiple practices, and global medication changes go live immediately for practices using the global source.
          </p>
        </div>
        <PracticeUserManagement practices={practices} />
      </>
      )}

      {activeTab === 'admins' && (
      <div className="dashboard-panel dashboard-section">
        <div className="dashboard-panel-header">
          <div>
            <h2 className="dashboard-panel-title">
            Administrator Accounts ({adminUsers.length})
            </h2>
            <p className="dashboard-panel-subtitle">Manage global administrator access on top of the shared user account model.</p>
          </div>
          {!showAddAdminForm && (
            <button onClick={() => setShowAddAdminForm(true)} className="action-button admin-action-button--primary">
              <Plus size={16} /> Add Administrator
            </button>
          )}
        </div>

        {loadingAdmins ? (
          <p style={{ color: '#4c6272' }}>Loading administrators...</p>
        ) : adminUsers.length === 0 ? (
          <p style={{ color: '#4c6272' }}>No administrator accounts found yet.</p>
        ) : (
          <div className="admin-data-table-wrap">
            <table className="admin-data-table admin-data-table--admins">
              <thead>
                <tr>
                  <th scope="col">Administrator</th>
                  <th scope="col">Status</th>
                  <th scope="col">Role</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((adminUser) => (
                  <tr key={adminUser.uid}>
                    <td>
                      <div className="admin-table-identity">
                        <strong>{adminUser.name}</strong>
                        <span className="admin-table-identity__email">{adminUser.email}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`admin-status-dot ${adminUser.is_active ? 'admin-status-dot--active' : 'admin-status-dot--inactive'}`}>
                        <span className="admin-status-dot__circle" aria-hidden="true" />
                        {adminUser.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <span className={`admin-role-badge admin-role-badge--${adminUser.role}`}>
                        {adminUser.role === 'owner' ? 'Owner' : 'Admin'}
                      </span>
                    </td>
                    <td>
                      <div className="admin-table-actions">
                        <button onClick={() => openAdminEditForm(adminUser)} className="admin-action-btn admin-action-btn--edit">
                          <Edit2 size={14} /> Edit
                        </button>
                        <button onClick={() => resetAdminPassword(adminUser)} className="admin-action-btn admin-action-btn--icon" title="Reset password">
                          <RefreshCw size={15} />
                        </button>
                        {adminUser.role !== 'owner' && (
                          <button onClick={() => deleteAdmin(adminUser)} className="admin-action-btn admin-action-btn--icon" title="Remove administrator">
                            <Trash2 size={15} />
                          </button>
                        )}
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

      {activeTab === 'library' && (
      <div className="dashboard-panel dashboard-section">
        <div className="dashboard-panel-header">
          <div>
            <h2 className="dashboard-panel-title">Local Resource Library</h2>
            <p className="dashboard-panel-subtitle">Maintain reusable local support links that can be applied to cards across every service.</p>
          </div>
          <div className="dashboard-inline-actions">
            <button onClick={() => navigate(resolvePath('/admin/card-builder'))} className="action-button admin-action-button--secondary">
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
                  <th scope="col">Resource</th>
                  <th scope="col">Status</th>
                  <th scope="col">Category</th>
                  <th scope="col">Contact / Location</th>
                  <th scope="col">Website</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLocalResources.map((resource) => (
                  <tr key={resource.id}>
                    <td>
                      <div className="admin-table-identity">
                        <strong>{resource.title}</strong>
                        {resource.description && <span className="admin-table-identity__email">{resource.description}</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`admin-status-dot ${resource.is_active ? 'admin-status-dot--active' : 'admin-status-dot--inactive'}`}>
                        <span className="admin-status-dot__circle" aria-hidden="true" />
                        {resource.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {resource.category
                        ? <span className="admin-ods-badge">{resource.category}</span>
                        : <span className="admin-table-muted">—</span>}
                    </td>
                    <td>
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
                    <td>
                      {resource.website
                        ? <a href={resource.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#005eb8' }}>{resource.website}</a>
                        : <span className="admin-table-muted">—</span>}
                    </td>
                    <td>
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
            <table className="admin-data-table" style={{ minWidth: 480, tableLayout: 'auto' }}>
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
