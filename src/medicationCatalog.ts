import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { MEDICATIONS, type MedContent } from './medicationData';

export type MedicationRecord = MedContent & {
  source: 'built-in' | 'override' | 'custom';
  isBuiltIn: boolean;
  isGpRatified?: boolean;
  gpRatifiedAt?: string | null;
  gpRatifiedBy?: string | null;
};

type MedicationOverride = Partial<MedContent> & {
  code: string;
  isGpRatified?: boolean;
  gpRatifiedAt?: string | null;
  gpRatifiedBy?: string | null;
  is_deleted?: boolean;
};

type MedicationDbRow = {
  code: string;
  title: string;
  description: string;
  badge: MedContent['badge'];
  category: string;
  key_info_mode?: 'do' | 'dont';
  key_info?: string[];
  do_key_info?: string[];
  dont_key_info?: string[];
  general_key_info?: string[];
  nhs_link?: string;
  trend_links?: { title: string; url: string }[];
  sick_days_needed?: boolean;
  review_months?: number;
  content_review_date?: string;
  link_expiry_value?: number | null;
  link_expiry_unit?: 'weeks' | 'months' | null;
  is_gp_ratified?: boolean;
  gp_ratified_at?: string | null;
  gp_ratified_by?: string | null;
  is_deleted?: boolean;
};

const BUILT_IN_MAP = new Map(MEDICATIONS.map((med) => [med.code, med]));

const sortByCode = (left: { code: string }, right: { code: string }) =>
  Number.parseInt(left.code, 10) - Number.parseInt(right.code, 10);

export const mergeMedicationCatalog = (overrides: MedicationOverride[]): MedicationRecord[] => {
  const merged = new Map<string, MedicationRecord>(
    MEDICATIONS.map((med) => [
      med.code,
      {
        ...med,
        source: 'built-in' as const,
        isBuiltIn: true,
      },
    ]),
  );

  overrides.forEach((override) => {
    if (!override.code) {
      return;
    }

    if (override.is_deleted) {
      merged.delete(override.code);
      return;
    }

    const builtIn = BUILT_IN_MAP.get(override.code);
    const base = builtIn ?? null;

    if (!override.title || !override.description || !override.category || !override.badge) {
      return;
    }

    merged.set(override.code, {
      code: override.code,
      title: override.title,
      description: override.description,
      badge: override.badge,
      category: override.category,
      keyInfoMode: override.keyInfoMode,
      keyInfo: Array.isArray(override.keyInfo) ? override.keyInfo : base?.keyInfo ?? [],
      doKeyInfo: Array.isArray(override.doKeyInfo) ? override.doKeyInfo : base?.doKeyInfo ?? [],
      dontKeyInfo: Array.isArray(override.dontKeyInfo) ? override.dontKeyInfo : base?.dontKeyInfo ?? [],
      generalKeyInfo: Array.isArray(override.generalKeyInfo) ? override.generalKeyInfo : base?.generalKeyInfo ?? [],
      reviewMonths:
        typeof override.reviewMonths === 'number' && override.reviewMonths > 0
          ? override.reviewMonths
          : base?.reviewMonths ?? 12,
      contentReviewDate: typeof override.contentReviewDate === 'string' ? override.contentReviewDate : base?.contentReviewDate,
      linkExpiryValue:
        typeof override.linkExpiryValue === 'number' && override.linkExpiryValue > 0
          ? override.linkExpiryValue
          : base?.linkExpiryValue,
      linkExpiryUnit:
        override.linkExpiryUnit === 'weeks' || override.linkExpiryUnit === 'months'
          ? override.linkExpiryUnit
          : base?.linkExpiryUnit,
      nhsLink: typeof override.nhsLink === 'string' ? override.nhsLink : base?.nhsLink,
      trendLinks: Array.isArray(override.trendLinks) ? override.trendLinks : base?.trendLinks ?? [],
      sickDaysNeeded: typeof override.sickDaysNeeded === 'boolean' ? override.sickDaysNeeded : base?.sickDaysNeeded,
      isGpRatified: override.isGpRatified === true,
      gpRatifiedAt: override.gpRatifiedAt ?? null,
      gpRatifiedBy: override.gpRatifiedBy ?? null,
      source: builtIn ? 'override' : 'custom',
      isBuiltIn: Boolean(builtIn),
    });
  });

  return Array.from(merged.values()).sort(sortByCode);
};

export const buildMedicationMap = (medications: MedicationRecord[]): Record<string, MedicationRecord> =>
  Object.fromEntries(medications.map((med) => [med.code, med]));

export const loadMedicationCatalog = async (): Promise<MedicationRecord[]> => {
  const { data, error } = await supabase.from('medications').select('*');
  if (error) {
    console.error('Failed to load medications:', error);
    return mergeMedicationCatalog([]);
  }

  // Map snake_case DB columns back to camelCase for the MedicationOverride type
  const overrides: MedicationOverride[] = ((data || []) as MedicationDbRow[]).map((row) => ({
    code: row.code,
    title: row.title,
    description: row.description,
    badge: row.badge,
    category: row.category,
    keyInfoMode: row.key_info_mode,
    keyInfo: row.key_info,
    doKeyInfo: row.do_key_info,
    dontKeyInfo: row.dont_key_info,
    generalKeyInfo: row.general_key_info,
    nhsLink: row.nhs_link,
    trendLinks: row.trend_links,
    sickDaysNeeded: row.sick_days_needed,
    reviewMonths: row.review_months,
    contentReviewDate: row.content_review_date,
    linkExpiryValue: row.link_expiry_value ?? undefined,
    linkExpiryUnit: row.link_expiry_unit ?? undefined,
    isGpRatified: row.is_gp_ratified === true,
    gpRatifiedAt: row.gp_ratified_at ?? null,
    gpRatifiedBy: row.gp_ratified_by ?? null,
    is_deleted: row.is_deleted,
  }));

  return mergeMedicationCatalog(overrides);
};

export const useMedicationCatalog = () => {
  const [medications, setMedications] = useState<MedicationRecord[]>(() => mergeMedicationCatalog([]));
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const catalog = await loadMedicationCatalog();
      setMedications(catalog);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const medicationMap = useMemo(() => buildMedicationMap(medications), [medications]);

  return {
    medications,
    medicationMap,
    loading,
    reload,
  };
};
