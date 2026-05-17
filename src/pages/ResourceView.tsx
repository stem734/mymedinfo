import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, ExternalLink, FlaskConical, Info, Printer, Star } from 'lucide-react';
import { parseMedicationCodes, recordPatientAccess, resolveOrganisationMedicationCards, validateOrganisation } from '../protocolService';
import { DEFAULT_PRACTICE_FEATURE_SETTINGS, type PracticeFeatureSettings } from '../practiceFeatures';
import { useMedicationCatalog } from '../medicationCatalog';
import { supabase } from '../supabase';
import { getDemoNoticeText } from '../demoHelpers';
import { getExpiryDate, isIssuedDateStale, isUrlExpired, parsePatientDate, parseSystmOneTimestamp } from '../dateHelpers';
import { saveElementAsPdf } from '../pdfExport';
import WarningCallout from '../components/WarningCallout';
import PatientGuidanceNotice from '../components/PatientGuidanceNotice';
import PatientSupportFooter from '../components/PatientSupportFooter';
import SickDayRulesModal from '../components/SickDayRulesModal';
import type { SickDayRulesVariant } from '../components/SickDayRulesModal';
import { NhsCross, NhsTick } from '../components/NhsIcons';
import { getPracticeLookupFromSearchParams } from '../practiceLookup';

const VALIDATION_CACHE_TTL_MS = 5 * 60 * 1000;
const VALIDATION_CACHE_VERSION = 'v2';
const MEDICATION_BADGE_ORDER: Record<'NEW' | 'REAUTH' | 'GENERAL', number> = {
  NEW: 0,
  REAUTH: 1,
  GENERAL: 2,
};

const getSickDayRulesVariant = (content: { category?: string; title?: string }): SickDayRulesVariant =>
  `${content.category || ''} ${content.title || ''}`.toLowerCase().includes('insulin') ? 'insulin' : 'standard';

const getValidationCacheKey = (orgName: string) =>
  `practice-validation:${VALIDATION_CACHE_VERSION}:${orgName.trim().toLowerCase()}`;

const clearValidationCache = (orgName: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(getValidationCacheKey(orgName));
  } catch {
    // sessionStorage may be unavailable (private mode); safe to ignore.
  }
};

const isFreshValidationCache = (value: { expiresAt?: number; valid?: boolean }) =>
  value.valid === true &&
  typeof value.expiresAt === 'number' &&
  value.expiresAt > Date.now();

const GROUP_COPY: Record<'NEW' | 'REAUTH' | 'GENERAL', { title: string }> = {
  NEW: {
    title: 'Newly prescribed',
  },
  REAUTH: {
    title: 'Ongoing treatment',
  },
  GENERAL: {
    title: 'Medication Information',
  },
};

const stripTreatmentSuffix = (title: string) =>
  title
    .replace(/\s*-\s*Starting Treatment$/i, '')
    .replace(/\s*-\s*Annual Review$/i, '')
    .replace(/\s*-\s*Reauthorisation$/i, '');

const getMedicationStateLabel = (badge: 'NEW' | 'REAUTH' | 'GENERAL') =>
  badge === 'NEW' ? 'Newly prescribed' : badge === 'REAUTH' ? 'Ongoing treatment' : 'Information';

const getMedicationGroupCopy = (
  badge: 'NEW' | 'REAUTH' | 'GENERAL',
  count: number,
  hasNewerGroup: boolean,
  hasOlderGroup: boolean,
) => {
  const itemWord = count === 1 ? 'medicine' : 'medicines';
  if (badge === 'NEW') {
    return `You have ${count} newly prescribed ${itemWord} below. ${hasOlderGroup ? 'Scroll down for medicines in ongoing treatment and any general information.' : 'Read this information carefully so you know what to expect and how to take it safely.'}`;
  }

  if (badge === 'REAUTH') {
    const instructions = [
      hasNewerGroup ? 'Scroll up for newly prescribed medicines.' : '',
      hasOlderGroup ? 'Scroll down for any general information.' : '',
    ].filter(Boolean).join(' ');
    return `You have ${count} ${itemWord} in ongoing treatment below. ${instructions || 'Read this information carefully so you know what to expect and how to take it safely.'}`;
  }

  return `You have ${count} ${itemWord} with general information below. ${hasNewerGroup ? 'Scroll up for newly prescribed medicines and ongoing treatment.' : 'Read this information carefully so you know what to expect and how to take it safely.'}`;
};

const getMedicationDisplayParts = (title: string) => {
  const strippedTitle = stripTreatmentSuffix(title).trim();
  const firstSegment = strippedTitle.split(' - ')[0]?.trim() || strippedTitle;
  const secondary = strippedTitle === firstSegment ? '' : strippedTitle;
  return {
    primary: firstSegment,
    secondary,
  };
};

const formatValidUntil = (issuedAt: Date | null, value?: number, unit?: 'weeks' | 'months') => {
  if (!issuedAt || !value || !unit) return '';
  return getExpiryDate(issuedAt, value, unit).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const formatExpiryWindowLabel = (value?: number, unit?: 'weeks' | 'months') => {
  if (!value || !unit) return '';
  return `${value} ${value === 1 ? unit.replace(/s$/, '') : unit}`;
};

const getEarliestExpiryDate = (
  issuedAt: Date | null,
  contents: Array<{ linkExpiryValue?: number; linkExpiryUnit?: 'weeks' | 'months' }>,
) : Date | null => {
  if (!issuedAt) return null;
  let earliest: Date | null = null;

  contents.forEach((content) => {
    if (!content.linkExpiryValue || !content.linkExpiryUnit) return;
    const expiry = getExpiryDate(issuedAt, content.linkExpiryValue, content.linkExpiryUnit);
    if (!earliest || expiry < earliest) {
      earliest = expiry;
    }
  });

  return earliest;
};

const sortMedicationGroups = <
  T extends {
    id: string;
    badge: 'NEW' | 'REAUTH' | 'GENERAL';
  },
>(items: T[]) =>
  [...items].sort((left, right) => {
    const badgeDiff = MEDICATION_BADGE_ORDER[left.badge] - MEDICATION_BADGE_ORDER[right.badge];
    if (badgeDiff !== 0) {
      return badgeDiff;
    }

    return Number.parseInt(left.id, 10) - Number.parseInt(right.id, 10);
  });

type PatientMedicationContent = {
  state: 'global' | 'custom' | 'placeholder';
  code: string;
  badge: 'NEW' | 'REAUTH' | 'GENERAL';
  title: string;
  description: string;
  category: string;
  keyInfoMode?: 'do' | 'dont';
  doKeyInfo?: string[];
  dontKeyInfo?: string[];
  generalKeyInfo?: string[];
  keyInfo: string[];
  nhsLink?: string;
  trendLinks: { title: string; url: string }[];
  sickDaysNeeded?: boolean;
  reviewMonths?: number;
  contentReviewDate?: string;
  linkExpiryValue?: number;
  linkExpiryUnit?: 'weeks' | 'months';
};

const ResourceView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const rawCode = searchParams.get('code') || searchParams.get('med') || '';
  const practiceLookup = getPracticeLookupFromSearchParams(searchParams);
  const orgName = practiceLookup.orgName;
  const practiceIdentifier = practiceLookup.lookupValue;
  const hasPracticeIdentifier = practiceLookup.hasIdentifier;
  const codesParam = searchParams.get('codes');
  const dateParam = searchParams.get('date');
  const isDemoMode = searchParams.get('demo') === '1';
  const isExactDemo = searchParams.get('exactDemo') === '1';
  const previewOnly = searchParams.get('previewOnly') === '1';
  const previewToken = (searchParams.get('previewToken') || '').trim();

  const isOutOfDate = useMemo(() => isIssuedDateStale(dateParam, 6), [dateParam]);
  const [resolvedContents, setResolvedContents] = useState<PatientMedicationContent[]>([]);

  const issuedAt = useMemo(() => parseSystmOneTimestamp(searchParams.get('codes')), [searchParams]);
  const issuedDateDisplay = useMemo(() => {
    const issuedDate = parsePatientDate(dateParam) || issuedAt;
    if (!issuedDate) return '';
    return issuedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }, [dateParam, issuedAt]);

  const [isAuthorised, setIsAuthorised] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [practiceFeatures, setPracticeFeatures] = useState<PracticeFeatureSettings>(DEFAULT_PRACTICE_FEATURE_SETTINGS);
  const [validationNonce, setValidationNonce] = useState(0);
  const { medicationMap: allMeds } = useMedicationCatalog();
  const [isResolvingContents, setIsResolvingContents] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const loggedAccessKeyRef = useRef<string | null>(null);

  const [rating, setRating] = useState<number>(0);
  const [hasRated, setHasRated] = useState<boolean>(false);
  const [isSubmittingRating, setIsSubmittingRating] = useState<boolean>(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [sickDayModalOpen, setSickDayModalOpen] = useState(false);
  const [sickDayRulesVariant, setSickDayRulesVariant] = useState<SickDayRulesVariant>('standard');
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [isSavingPdf, setIsSavingPdf] = useState(false);

  const previewContents = useMemo<PatientMedicationContent[]>(() => {
    if (!previewOnly || !previewToken || typeof window === 'undefined') {
      return [] as PatientMedicationContent[];
    }

    try {
      const raw = window.sessionStorage.getItem(previewToken);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { cards?: Array<{
        state?: 'global' | 'custom' | 'placeholder';
        code?: string;
        badge?: 'NEW' | 'REAUTH' | 'GENERAL';
        title?: string;
        description?: string;
        category?: string;
        keyInfoMode?: 'do' | 'dont';
        doKeyInfo?: string[];
        dontKeyInfo?: string[];
        generalKeyInfo?: string[];
        keyInfo?: string[];
        nhsLink?: string;
        trendLinks?: { title: string; url: string }[];
        sickDaysNeeded?: boolean;
        reviewMonths?: number;
      }> };

      return (parsed.cards || []).filter((card) =>
        card &&
        typeof card.code === 'string' &&
        typeof card.title === 'string' &&
        typeof card.description === 'string' &&
        typeof card.category === 'string' &&
        (card.badge === 'NEW' || card.badge === 'REAUTH' || card.badge === 'GENERAL'),
      ).map((card) => ({
        state: card.state || 'custom',
        code: card.code as string,
        badge: card.badge as 'NEW' | 'REAUTH' | 'GENERAL',
        title: card.title as string,
        description: card.description as string,
        category: card.category as string,
        keyInfoMode: card.keyInfoMode === 'dont' ? 'dont' as const : 'do' as const,
        doKeyInfo: Array.isArray(card.doKeyInfo) ? card.doKeyInfo : [],
        dontKeyInfo: Array.isArray(card.dontKeyInfo) ? card.dontKeyInfo : [],
        generalKeyInfo: Array.isArray(card.generalKeyInfo) ? card.generalKeyInfo : [],
        keyInfo: Array.isArray(card.keyInfo) ? card.keyInfo : [],
        nhsLink: card.nhsLink,
        trendLinks: Array.isArray(card.trendLinks) ? card.trendLinks : [],
        sickDaysNeeded: Boolean(card.sickDaysNeeded),
        reviewMonths: typeof card.reviewMonths === 'number' ? card.reviewMonths : undefined,
      }));
    } catch {
      return [];
    }
  }, [previewOnly, previewToken]);

  const handleRating = async (value: number) => {
    if (hasRated || !practiceIdentifier) return;
    setRating(value);
    setRatingError(null);
    setIsSubmittingRating(true);
    try {
      const { data, error } = await supabase.rpc('submit_patient_rating', {
        org_name: practiceIdentifier,
        rating_value: value,
      });
      if (error) {
        throw error;
      }
      const result = data as { success?: boolean; error?: string; rate_limited?: boolean } | null;
      if (result && result.success === false) {
        setRatingError(result.error || 'Unable to submit rating. Please try again later.');
        setRating(0);
      } else {
        setHasRated(true);
      }
    } catch (err) {
      console.error('Failed to submit rating:', err);
      setRatingError('Unable to submit rating. Please try again later.');
      setRating(0);
    }
    setIsSubmittingRating(false);
  };

  const handleSavePdf = async () => {
    if (!exportRef.current || isSavingPdf) return;
    setIsSavingPdf(true);
    try {
      await saveElementAsPdf(
        exportRef.current,
        orgName ? `${orgName} - Patient Medication Information` : 'MyMedInfo - Patient Medication Information',
      );
    } catch (error) {
      console.error('Failed to save patient PDF', error);
      window.print();
    } finally {
      setIsSavingPdf(false);
    }
  };

  useEffect(() => {
    if (previewOnly) {
      setIsAuthorised(true);
      setAuthError(null);
      setIsValidating(false);
      return;
    }

    if (isDemoMode) {
      setIsAuthorised(true);
      setAuthError(null);
      setIsValidating(false);
      return;
    }

    let cancelled = false;
    let loadingTimer: number | undefined;

    const validate = async () => {
      if (!hasPracticeIdentifier) {
        if (!cancelled) {
          setIsAuthorised(null);
          setAuthError(null);
          setIsValidating(false);
        }
        return;
      }

      const cacheKey = getValidationCacheKey(practiceLookup.cacheKey);
      const cached = window.sessionStorage.getItem(cacheKey);
      let usedCachedValue = false;
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as { expiresAt?: number; valid?: boolean; practiceFeatures?: PracticeFeatureSettings };
          if (isFreshValidationCache(parsed)) {
            if (!cancelled) {
              setIsAuthorised(true);
              setAuthError(null);
              setIsValidating(false);
              setPracticeFeatures(parsed.practiceFeatures || DEFAULT_PRACTICE_FEATURE_SETTINGS);
              usedCachedValue = true;
            }
          }
        } catch {
          // Ignore invalid cached values and fall through to live validation.
        }
        if (!usedCachedValue) {
          window.sessionStorage.removeItem(cacheKey);
        }
      }

      if (!cancelled && !usedCachedValue) {
        setIsAuthorised(null);
        setAuthError(null);
        setPracticeFeatures(DEFAULT_PRACTICE_FEATURE_SETTINGS);
      }
      loadingTimer = window.setTimeout(() => {
        if (!cancelled && !usedCachedValue) {
          setIsValidating(true);
        }
      }, 150);

      const result = await validateOrganisation(practiceIdentifier);
      if (cancelled) return;

      if (loadingTimer !== undefined) {
        window.clearTimeout(loadingTimer);
      }
      setIsAuthorised(result.valid);
      setAuthError(result.valid ? null : result.error || 'Practice not registered');
      setIsValidating(false);
      setPracticeFeatures(result.valid ? result.practiceFeatures : DEFAULT_PRACTICE_FEATURE_SETTINGS);

      if (result.valid) {
        window.sessionStorage.setItem(cacheKey, JSON.stringify({
          valid: true,
          expiresAt: Date.now() + VALIDATION_CACHE_TTL_MS,
          practiceFeatures: result.practiceFeatures,
        }));
      } else {
        window.sessionStorage.removeItem(cacheKey);
      }
    };

    void validate();

    return () => {
      cancelled = true;
      if (loadingTimer !== undefined) {
        window.clearTimeout(loadingTimer);
      }
    };
  }, [hasPracticeIdentifier, isDemoMode, practiceIdentifier, practiceLookup.cacheKey, previewOnly, validationNonce]);

  useEffect(() => {
    if (isDemoMode || previewOnly) {
      loggedAccessKeyRef.current = null;
      return;
    }

    if (!practiceIdentifier || isAuthorised !== true) {
      loggedAccessKeyRef.current = null;
      return;
    }

    const accessKey = `${practiceIdentifier.toLowerCase()}|${codesParam || rawCode || ''}`;
    if (loggedAccessKeyRef.current === accessKey) {
      return;
    }

    loggedAccessKeyRef.current = accessKey;
    void (async () => {
      const result = await recordPatientAccess(practiceIdentifier);
      if (!result.ok) {
        clearValidationCache(practiceLookup.cacheKey);
        loggedAccessKeyRef.current = null;
        setIsAuthorised(null);
        setAuthError(null);
        setValidationNonce((n) => n + 1);
      }
    })();
  }, [codesParam, isAuthorised, isDemoMode, practiceIdentifier, practiceLookup.cacheKey, previewOnly, rawCode]);

  const requestedCodes = useMemo(() => {
    if (codesParam) {
      return Array.from(new Set(parseMedicationCodes(codesParam)));
    }

    const matches = rawCode.match(/\d{3}/g) || [];
    return Array.from(new Set(matches));
  }, [codesParam, rawCode]);

  useEffect(() => {
    let cancelled = false;

    const resolveCards = async () => {
      if (requestedCodes.length === 0) {
        if (previewOnly && previewContents.length > 0) {
          if (!cancelled) {
            setResolvedContents(previewContents);
            setResolveError(null);
            setIsResolvingContents(false);
          }
          return;
        }

        if (!cancelled) {
          setResolvedContents([]);
          setResolveError(null);
          setIsResolvingContents(false);
        }
        return;
      }

      if (previewOnly) {
        if (!cancelled) {
          setResolvedContents(previewContents);
          setResolveError(null);
          setIsResolvingContents(false);
        }
        return;
      }

      if (isDemoMode || !hasPracticeIdentifier) {
        if (!cancelled) {
          setResolvedContents(
            requestedCodes
              .map((code) => {
                const med = allMeds[code];
                return med ? { ...med, code, state: 'global' as const } : null;
              })
              .filter((item): item is NonNullable<typeof item> => item !== null),
          );
          setResolveError(null);
          setIsResolvingContents(false);
        }
        return;
      }

      if (isAuthorised !== true || !practiceFeatures.medication_enabled) {
        if (!cancelled) {
          setResolvedContents([]);
          setResolveError(null);
          setIsResolvingContents(false);
        }
        return;
      }

      setIsResolvingContents(true);

      try {
        const result = await resolveOrganisationMedicationCards(practiceIdentifier, requestedCodes);
        if (!cancelled) {
          if (result.ok) {
            setResolvedContents(result.cards);
            setResolveError(null);
          } else {
            setResolvedContents([]);
            setResolveError(result.error);
          }
        }
      } finally {
        if (!cancelled) {
          setIsResolvingContents(false);
        }
      }
    };

    void resolveCards();

    return () => {
      cancelled = true;
    };
  }, [allMeds, hasPracticeIdentifier, isAuthorised, isDemoMode, practiceFeatures.medication_enabled, practiceIdentifier, previewContents, previewOnly, requestedCodes]);

  const contents = useMemo(() => {
    if (previewOnly) {
      return sortMedicationGroups(
        previewContents.map((card) => ({
          id: card.code,
          ...card,
        })),
      );
    }

    if (isDemoMode || !hasPracticeIdentifier) {
      return sortMedicationGroups(
        requestedCodes
          .map((code) => (allMeds[code] ? { id: code, state: 'global' as const, ...allMeds[code] } : null))
          .filter((item): item is NonNullable<typeof item> => item !== null && !!item.title),
      );
    }

    if (hasPracticeIdentifier) {
      if (isAuthorised !== true) {
        return [];
      }

      return sortMedicationGroups(
        resolvedContents.map((card) => ({
          id: card.code,
          ...card,
        })),
      );
    }

    return sortMedicationGroups(
      requestedCodes
        .map((code) => (allMeds[code] ? { id: code, state: 'global' as const, ...allMeds[code] } : null))
        .filter((item): item is NonNullable<typeof item> => item !== null && !!item.title),
    );
  }, [allMeds, hasPracticeIdentifier, isAuthorised, isDemoMode, previewContents, previewOnly, requestedCodes, resolvedContents]);

  const groupedContents = useMemo(() => {
    const groups = new Map<'NEW' | 'REAUTH' | 'GENERAL', typeof contents>();

    contents.forEach((content) => {
      const existing = groups.get(content.badge) ?? [];
      groups.set(content.badge, [...existing, content]);
    });

    return Array.from(groups.entries()).sort(
      ([leftBadge], [rightBadge]) => MEDICATION_BADGE_ORDER[leftBadge] - MEDICATION_BADGE_ORDER[rightBadge],
    );
  }, [contents]);

  const pageHeadline = 'Your GP practice has shared some information with you which you may find useful.';

  const guidanceOrganisationName = useMemo(() => {
    if (resolvedContents.some((content) => content.state === 'custom') && orgName) {
      return orgName;
    }

    return 'Nottingham West Primary Care Network';
  }, [orgName, resolvedContents]);

  const guidanceNoticeText = `Service provided by ${guidanceOrganisationName} on behalf of the NHS. This information has been prepared and checked by the clinical pharmacists at ${guidanceOrganisationName}.`;

  if ((isValidating || isResolvingContents) && hasPracticeIdentifier && !previewOnly) {
    return (
      <div className="card patient-state-card" style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>
            <FlaskConical size={64} color="#005eb8" />
          </div>
        </div>
        <h1>Loading...</h1>
      </div>
    );
  }

  if (hasPracticeIdentifier && isAuthorised === false && !previewOnly) {
    return (
      <div className="card patient-state-card" style={{ textAlign: 'center', borderLeft: '4px solid #d5281b' }} role="alert" aria-live="assertive">
        <AlertCircle size={64} color="#d5281b" style={{ marginBottom: '1rem' }} aria-hidden="true" />
        <h1>Practice Not Registered</h1>
        <p style={{ color: '#d5281b', marginBottom: '1rem' }}>{authError}</p>
        <p style={{ fontSize: '0.9rem', color: '#4c6272' }}>
          If your practice would like to use this service, please contact your PCN coordinator.
        </p>
      </div>
    );
  }

  if (hasPracticeIdentifier && isAuthorised === true && !practiceFeatures.medication_enabled && !previewOnly) {
    return (
      <div className="card patient-state-card" style={{ textAlign: 'center', borderLeft: '4px solid #d5281b' }} role="alert" aria-live="assertive">
        <AlertCircle size={64} color="#d5281b" style={{ marginBottom: '1rem' }} aria-hidden="true" />
        <h1>Medication Cards Unavailable</h1>
        <p style={{ color: '#d5281b', marginBottom: '1rem' }}>Medication cards are not enabled for this practice yet.</p>
        <p style={{ fontSize: '0.9rem', color: '#4c6272' }}>
          Please contact your GP practice if you were expecting medication information here.
        </p>
      </div>
    );
  }

  if (resolveError && hasPracticeIdentifier && requestedCodes.length > 0) {
    return (
      <div className="card patient-state-card" style={{ textAlign: 'center', borderLeft: '4px solid #d5281b' }} role="alert" aria-live="assertive">
        <AlertCircle size={64} color="#d5281b" style={{ marginBottom: '1rem' }} aria-hidden="true" />
        <h1>Medication Information Unavailable</h1>
        <p style={{ color: '#d5281b', marginBottom: '1rem' }}>{resolveError}</p>
        <p style={{ fontSize: '0.9rem', color: '#4c6272', marginBottom: '1rem' }}>
          This is usually a temporary issue. Please try again in a moment.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            backgroundColor: '#005eb8',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (contents.length === 0) {
    return (
      <div className="card patient-state-card" style={{ textAlign: 'center' }}>
        <FlaskConical size={64} color="#005eb8" style={{ marginBottom: '1rem' }} />
        <h1>MyMedInfo</h1>
        <p style={{ fontSize: '1.1rem', fontWeight: '500', marginBottom: '1rem' }}>Clear, trusted medication information</p>
        <p>Please use the link provided by your GP or scan the QR code to find information about your specific medication.</p>
        {!hasPracticeIdentifier && (
          <div className="patient-empty-grid">
            {Object.entries(allMeds).map(([key, item]) => (
              <a key={key} href={`?code=${key}`} className="resource-card patient-empty-card" style={{ textAlign: 'center' }}>
                <h3>{item.title}</h3>
                <span className={`badge badge-${item.badge.toLowerCase()}`}>{item.badge}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="animation-container patient-view patient-page-shell" ref={exportRef}>
      <h1 className="sr-only">Patient medication information</h1>
      <SickDayRulesModal isOpen={sickDayModalOpen} onClose={() => setSickDayModalOpen(false)} variant={sickDayRulesVariant} />
      {isDemoMode && !isExactDemo && (
        <div className="patient-demo-banner no-print" role="note" aria-live="polite">
          {getDemoNoticeText()}
        </div>
      )}
      <div className="patient-greeting-card" role="status" aria-live="polite" style={{ marginBottom: '1rem' }}>
        <div className="patient-greeting-icon">
          <Info size={20} aria-hidden="true" />
        </div>
        <div className="patient-greeting-copy">
          <p className="patient-greeting-title">{pageHeadline}</p>
          {issuedDateDisplay && (
            <p className="patient-greeting-meta">
              {`Information sent on ${issuedDateDisplay}`}
            </p>
          )}
        </div>
      </div>

      {isOutOfDate && (
        <div className="out-of-date-banner" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#8a1538', fontSize: '0.95rem', backgroundColor: '#fbe3ea', padding: '0.85rem 1rem', borderRadius: '8px', border: '2px solid #8a1538', marginBottom: '1rem', fontWeight: 700 }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <span>This information was issued over 6 months ago and may be out of date. Please contact your GP practice if you have any concerns.</span>
        </div>
      )}

      {!previewOnly && (
        <div className="patient-print-bar no-print">
          <button onClick={() => void handleSavePdf()} className="action-button patient-print-button" style={{ backgroundColor: '#4c6272', color: 'white', padding: '0.5rem 1rem', fontSize: '0.9rem', marginTop: 0 }}>
            <Printer size={16} /> {isSavingPdf ? 'Saving PDF...' : 'Save page as PDF'}
          </button>
        </div>
      )}

      {groupedContents.map(([badge, items], index) => (
        <section key={badge} className={`patient-section patient-section--${badge.toLowerCase()}`}>
          <div className={`patient-group-heading patient-group-heading--${badge.toLowerCase()}`}>
            <div className="patient-group-eyebrow">{GROUP_COPY[badge].title}</div>
            <p className="patient-group-copy">
              {getMedicationGroupCopy(
                badge,
                items.length,
                index > 0,
                index < groupedContents.length - 1,
              )}
            </p>
          </div>

          <div className={`patient-content-grid${items.length === 1 ? ' patient-content-grid--single' : ''}`}>
            {items.map((content) => {
              const displayTitle = getMedicationDisplayParts(content.title);
                  const validUntil = formatValidUntil(issuedAt, content.linkExpiryValue, content.linkExpiryUnit);
                  const isExpired = Boolean(
                    issuedAt &&
                content.linkExpiryValue &&
                content.linkExpiryUnit &&
                isUrlExpired(issuedAt, content.linkExpiryValue, content.linkExpiryUnit),
              );
              return (
              <article key={content.id} className="patient-content-panel">
                <div className="card patient-card">
                  {isExpired && (
                    <div
                      className="out-of-date-banner"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#8a1538', fontSize: '0.95rem', backgroundColor: '#fbe3ea', padding: '0.85rem 1rem', borderRadius: '8px', border: '2px solid #8a1538', marginBottom: '1rem', fontWeight: 700 }}
                        >
                          <AlertCircle size={20} style={{ flexShrink: 0 }} />
                          <span>
                            This information is more than {formatExpiryWindowLabel(content.linkExpiryValue, content.linkExpiryUnit)} old and may be out of date. If you have any queries please speak to your GP practice.
                          </span>
                        </div>
                  )}
                  <div className="patient-card-meta">
                    <span className={`badge badge-${content.badge.toLowerCase()}`}>
                      {getMedicationStateLabel(content.badge)}
                    </span>
                  </div>

                  <h2 className="patient-medication-title">{displayTitle.primary}</h2>
                  {displayTitle.secondary && (
                    <p className="patient-medication-subtitle">{displayTitle.secondary}</p>
                  )}
                  <p className="patient-section-copy">{content.description}</p>

                  {content.state !== 'placeholder' && content.generalKeyInfo && content.generalKeyInfo.length > 0 && (
                    <div className="patient-info-section">
                      <h3 className="patient-section-title patient-section-title--small">General advice</h3>
                      <ul className="patient-info-list">
                        {content.generalKeyInfo.map((info, i) => (
                          <li key={`general-${i}`} className="patient-info-item">
                            <div className="patient-info-icon">
                              <span className="patient-info-bullet" aria-hidden="true">•</span>
                            </div>
                            <span className="patient-info-text">{info}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(content.state !== 'placeholder' && ((content.doKeyInfo && content.doKeyInfo.length > 0) || (content.keyInfoMode !== 'dont' && content.keyInfo.length > 0))) && (
                    <div className="patient-info-section">
                      <h3 className="patient-section-title patient-section-title--small">Do</h3>
                      <ul className="patient-info-list">
                        {(content.doKeyInfo?.length ? content.doKeyInfo : content.keyInfo).map((info, i) => (
                          <li key={`do-${i}`} className="patient-info-item">
                            <div className="patient-info-icon">
                              <NhsTick size={22} aria-hidden="true" />
                            </div>
                            <span className="patient-info-text">{info}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {content.state !== 'placeholder' && ((content.dontKeyInfo && content.dontKeyInfo.length > 0) || (content.keyInfoMode === 'dont' && content.keyInfo.length > 0)) && (
                    <div className="patient-info-section">
                      <h3 className="patient-section-title patient-section-title--small">Don't</h3>
                      <ul className="patient-info-list">
                        {(content.dontKeyInfo?.length ? content.dontKeyInfo : content.keyInfo).map((info, i) => (
                          <li key={`dont-${i}`} className="patient-info-item">
                            <div className="patient-info-icon">
                              <NhsCross size={22} aria-hidden="true" />
                            </div>
                            <span className="patient-info-text">{info}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {content.state !== 'placeholder' && content.sickDaysNeeded && (
                    <WarningCallout title="Important: Sick day rules apply">
                      <p style={{ marginBottom: '0.75rem', color: '#212b32' }}>
                        {getSickDayRulesVariant(content) === 'insulin'
                          ? 'If you become unwell, you should follow insulin-specific sick day guidance.'
                          : 'If you become unwell and are unable to eat or drink normally, you may need to pause this medication.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSickDayRulesVariant(getSickDayRulesVariant(content));
                          setSickDayModalOpen(true);
                        }}
                        className="action-button"
                      >
                        View Sick Day Rules
                      </button>
                    </WarningCallout>
                  )}

                  {content.state !== 'placeholder' && (content.nhsLink || content.trendLinks.length > 0) && (
                    <div className="patient-resources patient-section-divider">
                      <h3 className="patient-resources-heading">
                        Further guidance
                      </h3>
                      <div className="patient-resource-list patient-resource-list--compact">
                        {content.nhsLink && (
                          <a
                            href={content.nhsLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="patient-resource-link patient-resource-link--compact"
                            aria-label="Read NHS.UK, opens in new tab"
                          >
                            <div className="patient-resource-meta">
                              <div className="patient-resource-chip">NHS</div>
                              <span className="patient-resource-meta-text">Official Guidance</span>
                            </div>
                            <h3>Read NHS.UK <span style={{ fontSize: '0.85rem', fontWeight: 400 }}>(opens in new tab)</span></h3>
                            <p className="patient-resource-copy">Read the comprehensive medical guide from the NHS website.</p>
                            <span className="patient-resource-arrow" aria-hidden="true"><ExternalLink size={18} /></span>
                          </a>
                        )}

                        {content.trendLinks.map((link, i) => (
                          <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="patient-resource-link patient-resource-link--compact"
                            aria-label={`${link.title} opens in new tab`}
                          >
                            <div className="patient-resource-meta patient-resource-meta--trend">
                              <span className="patient-resource-meta-text">Further guidance</span>
                            </div>
                            <h3>{link.title} <span style={{ fontSize: '0.85rem', fontWeight: 400 }}>(opens in new tab)</span></h3>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </article>
              );
            })}
          </div>
        </section>
      ))}

      {contents.length > 0 && (
        <PatientSupportFooter text={guidanceOrganisationName} />
      )}

      {hasPracticeIdentifier && isAuthorised && contents.length > 0 && (
        <div className="card hc-rating" style={{ marginTop: '2rem', textAlign: 'center', padding: '2rem 1rem' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#212b32' }}>Did you find this information useful?</h2>
          {hasRated ? (
            <div style={{ color: '#007f3b', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '1rem' }}>Thank you for your feedback!</div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleRating(star)}
                  disabled={isSubmittingRating}
                  aria-label={`Rate ${star} out of 5 stars${rating === star ? ', selected' : ''}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: isSubmittingRating ? 'default' : 'pointer',
                    padding: '0.5rem',
                    opacity: isSubmittingRating ? 0.5 : 1,
                    transition: 'transform 0.2s',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSubmittingRating) {
                      const buttons = e.currentTarget.parentElement?.querySelectorAll('button');
                      if (buttons) {
                        for (let i = 0; i < 5; i += 1) {
                          const svg = buttons[i].querySelector('svg');
                          if (svg) svg.style.fill = i <= star - 1 ? '#fbc02d' : 'none';
                          if (svg) svg.style.stroke = i <= star - 1 ? '#fbc02d' : '#8A99A8';
                        }
                      }
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSubmittingRating) {
                      const buttons = e.currentTarget.parentElement?.querySelectorAll('button');
                      if (buttons) {
                        for (let i = 0; i < 5; i += 1) {
                          const svg = buttons[i].querySelector('svg');
                          if (svg) svg.style.fill = i <= rating - 1 ? '#fbc02d' : 'none';
                          if (svg) svg.style.stroke = i <= rating - 1 ? '#fbc02d' : '#8A99A8';
                        }
                      }
                    }
                  }}
                >
                  <Star
                    size={36}
                    color={star <= rating ? '#fbc02d' : '#8A99A8'}
                    fill={star <= rating ? '#fbc02d' : 'none'}
                  />
                </button>
              ))}
            </div>
          )}
          {ratingError && !hasRated && (
            <p
              role="alert"
              style={{ marginTop: '1rem', color: '#d5281b', fontSize: '0.95rem' }}
            >
              {ratingError}
            </p>
          )}
        </div>
      )}

      {hasPracticeIdentifier && isAuthorised && contents.length > 0 && (
        <div className="hc-rating__notice">
          <PatientGuidanceNotice text={guidanceNoticeText} />
        </div>
      )}

    </div>
  );
};

export default ResourceView;
