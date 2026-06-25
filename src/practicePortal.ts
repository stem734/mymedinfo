import type { MedContent } from './medicationData';
import {
  DEFAULT_PRACTICE_FEATURE_SETTINGS,
  coercePracticeFeatureSettings,
  type PracticeFeatureSettings,
} from './practiceFeatures';
import { supabase } from './supabase';

export const PRACTICE_SELECTION_STORAGE_KEY = 'practice-dashboard:selected-practice';
export const GLOBAL_TEMPLATE_DISCLAIMER_VERSION = 'global_v1';
export const CUSTOM_CARD_DISCLAIMER_VERSION = 'custom_v1';

export const GLOBAL_TEMPLATE_DISCLAIMER_TEXT =
  'I confirm that I have reviewed this global medication card, understand it is provided as a shared template, and accept responsibility for deciding whether it is suitable for use at my practice.';

export const CUSTOM_CARD_DISCLAIMER_TEXT =
  'I understand that I am creating or updating a practice-specific medication card and that my practice is responsible for reviewing, maintaining, and governing this custom content.';

export type PracticeSummary = Partial<PracticeFeatureSettings> & {
  id: string;
  name: string;
  ods_code?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  is_active: boolean;
  link_visit_count?: number | null;
  patient_rating_count?: number | null;
  patient_rating_total?: number | null;
  last_accessed?: string | null;
  selected_medications?: string[] | null;
};

export type PracticeMembership = {
  id: string;
  practice_id: string;
  user_uid: string;
  role: 'admin' | 'editor';
  is_default: boolean;
  practice: PracticeSummary;
};

export type AppUserSummary = {
  uid: string;
  email: string;
  name: string;
  is_active: boolean;
  global_role?: 'owner' | 'admin' | null;
  memberships: PracticeMembership[];
};

export type PracticeCardSource = 'global' | 'custom' | 'placeholder';

export type PracticeMedicationCardRow = {
  practice_id: string;
  code: string;
  source_type: 'global' | 'custom';
  title?: string | null;
  description?: string | null;
  badge?: 'NEW' | 'REAUTH' | 'GENERAL' | null;
  category?: string | null;
  key_info_mode?: 'do' | 'dont' | null;
  key_info?: string[] | null;
  do_key_info?: string[] | null;
  dont_key_info?: string[] | null;
  general_key_info?: string[] | null;
  nhs_link?: string | null;
  trend_links?: Array<{ title: string; url: string }> | null;
  sick_days_needed?: boolean | null;
  review_months?: number | null;
  content_review_date?: string | null;
  link_expiry_value?: number | null;
  link_expiry_unit?: 'weeks' | 'months' | null;
  disclaimer_version: string;
  accepted_at?: string | null;
  accepted_by?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

export type ResolvedMedicationCard = MedContent & {
  state: PracticeCardSource;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const toTrendLinks = (value: unknown): Array<{ title: string; url: string }> =>
  Array.isArray(value)
    ? value
        .map((item) => {
          const row = isRecord(item) ? item : {};
          return {
            title: typeof row.title === 'string' ? row.title : '',
            url: typeof row.url === 'string' ? row.url : '',
          };
        })
        .filter((item) => item.title && item.url)
    : [];

export const coerceResolvedMedicationCard = (value: unknown): ResolvedMedicationCard => {
  const row = isRecord(value) ? value : {};

  return {
    state: row.state === 'custom' || row.state === 'global' ? row.state : 'placeholder',
    code: typeof row.code === 'string' ? row.code : '',
    badge: row.badge === 'NEW' || row.badge === 'REAUTH' ? row.badge : 'GENERAL',
    title: typeof row.title === 'string' ? row.title : 'Medication information unavailable',
    description:
      typeof row.description === 'string'
        ? row.description
        : 'No drug information available at your practice for this particular medication.',
    category: typeof row.category === 'string' ? row.category : 'Medication Information',
    keyInfoMode: row.keyInfoMode === 'dont' || row.key_info_mode === 'dont' ? 'dont' : 'do',
    keyInfo: toStringArray(row.keyInfo ?? row.key_info),
    doKeyInfo: toStringArray(row.doKeyInfo ?? row.do_key_info),
    dontKeyInfo: toStringArray(row.dontKeyInfo ?? row.dont_key_info),
    generalKeyInfo: toStringArray(row.generalKeyInfo ?? row.general_key_info),
    nhsLink: typeof row.nhsLink === 'string' ? row.nhsLink : typeof row.nhs_link === 'string' ? row.nhs_link : '',
    trendLinks: toTrendLinks(row.trendLinks ?? row.trend_links),
    sickDaysNeeded: Boolean(row.sickDaysNeeded ?? row.sick_days_needed),
    reviewMonths:
      typeof row.reviewMonths === 'number'
        ? row.reviewMonths
        : typeof row.review_months === 'number'
          ? row.review_months
          : undefined,
    contentReviewDate:
      typeof row.contentReviewDate === 'string'
        ? row.contentReviewDate
        : typeof row.content_review_date === 'string'
          ? row.content_review_date
          : undefined,
    linkExpiryValue:
      typeof row.linkExpiryValue === 'number'
        ? row.linkExpiryValue
        : typeof row.link_expiry_value === 'number'
          ? row.link_expiry_value
          : undefined,
    linkExpiryUnit:
      row.linkExpiryUnit === 'weeks' || row.linkExpiryUnit === 'months'
        ? row.linkExpiryUnit
        : row.link_expiry_unit === 'weeks' || row.link_expiry_unit === 'months'
          ? row.link_expiry_unit
          : undefined,
  };
};

export const coercePracticeSummary = (value: unknown): PracticeSummary | null => {
  const row = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    ods_code: typeof row.ods_code === 'string' ? row.ods_code : null,
    contact_email: typeof row.contact_email === 'string' ? row.contact_email : null,
    contact_phone: typeof row.contact_phone === 'string' ? row.contact_phone : null,
    is_active: row.is_active === true,
    link_visit_count: typeof row.link_visit_count === 'number' ? row.link_visit_count : null,
    patient_rating_count: typeof row.patient_rating_count === 'number' ? row.patient_rating_count : null,
    patient_rating_total: typeof row.patient_rating_total === 'number' ? row.patient_rating_total : null,
    last_accessed: typeof row.last_accessed === 'string' ? row.last_accessed : null,
    selected_medications: Array.isArray(row.selected_medications)
      ? row.selected_medications.filter((item): item is string => typeof item === 'string')
      : [],
    ...DEFAULT_PRACTICE_FEATURE_SETTINGS,
    ...coercePracticeFeatureSettings(row),
  };
};

export type PracticeAccessStats = {
  week: number;
  month: number;
  year: number;
  total: number;
};

const toCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export async function fetchPracticeAccessStats(practiceId: string): Promise<PracticeAccessStats | null> {
  const { data, error } = await supabase.rpc('get_practice_access_stats', {
    target_practice: practiceId,
  });

  if (error) {
    throw error;
  }

  const row = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  if (row.success === false) {
    return null;
  }

  return {
    week: toCount(row.week),
    month: toCount(row.month),
    year: toCount(row.year),
    total: toCount(row.total),
  };
}

export async function resolvePatientMedicationCards(practiceIdentifier: string, requestedCodes: string[]): Promise<ResolvedMedicationCard[]> {
  const { data, error } = await supabase.rpc('resolve_patient_medication_cards', {
    org_name: practiceIdentifier,
    requested_codes: requestedCodes,
  });

  if (error) {
    throw error;
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map(coerceResolvedMedicationCard);
}
