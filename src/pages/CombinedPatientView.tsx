import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Check, ExternalLink, FlaskConical, Info, Link as LinkIcon, Printer, Search, ShieldCheck } from 'lucide-react';
import { parseMedicationCodes, recordPatientAccess, resolveOrganisationMedicationCards, validateOrganisation } from '../protocolService';
import { DEFAULT_PRACTICE_FEATURE_SETTINGS, type PracticeFeatureSettings } from '../practiceFeatures';
import { useMedicationCatalog } from '../medicationCatalog';
import { getDemoNoticeText } from '../demoHelpers';
import { fetchCardTemplates } from '../cardTemplateStore';
import { fetchPatientPracticeCardTemplates } from '../practiceCardTemplateStore';
import {
  SCREENING_TEMPLATES,
  IMMUNISATION_TEMPLATES,
  findImmunisationTemplateByIdentifier,
  findScreeningTemplateByIdentifier,
  hydrateScreeningTemplate,
  withImmunisationTemplateDefaults,
  type ImmunisationTemplate,
  type ScreeningTemplate,
  withScreeningTemplateDefaults,
} from '../patientTemplateCatalog';
import WarningCallout from '../components/WarningCallout';
import PatientGuidanceNotice from '../components/PatientGuidanceNotice';
import PatientSupportFooter from '../components/PatientSupportFooter';
import SickDayRulesModal from '../components/SickDayRulesModal';
import type { SickDayRulesVariant } from '../components/SickDayRulesModal';
import { NhsCross, NhsTick } from '../components/NhsIcons';
import { getPracticeLookupFromSearchParams } from '../practiceLookup';
import { getExpiryDate, isUrlExpired, parsePatientDate, parseSystmOneTimestamp } from '../dateHelpers';
import { saveElementAsPdf } from '../pdfExport';
import { getVideoEmbedUrl } from '../videoEmbed';
import { parsePatientLinkCodes } from '../patientLinkCodes';

const VALIDATION_CACHE_TTL_MS = 5 * 60 * 1000;
const VALIDATION_CACHE_VERSION = 'v2';
const MEDICATION_BADGE_ORDER: Record<'NEW' | 'REAUTH' | 'GENERAL', number> = {
  NEW: 0,
  REAUTH: 1,
  GENERAL: 2,
};

const getSickDayRulesVariant = (content: { category?: string; title?: string }): SickDayRulesVariant =>
  `${content.category || ''} ${content.title || ''}`.toLowerCase().includes('insulin') ? 'insulin' : 'standard';

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

const getValidationCacheKey = (orgName: string) =>
  `practice-validation:${VALIDATION_CACHE_VERSION}:${orgName.trim().toLowerCase()}`;

const isFreshValidationCache = (value: { expiresAt?: number; valid?: boolean }) =>
  value.valid === true &&
  typeof value.expiresAt === 'number' &&
  value.expiresAt > Date.now();

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
    if (badgeDiff !== 0) return badgeDiff;
    return Number.parseInt(left.id, 10) - Number.parseInt(right.id, 10);
  });

const parseRequestedList = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const getContentListPhrase = (items: string[]) => {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
};

const CombinedPatientView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const rawCode = searchParams.get('code') || searchParams.get('med') || '';
  const codesParam = searchParams.get('codes') || '';
  const dateParam = searchParams.get('date');
  const practiceLookup = getPracticeLookupFromSearchParams(searchParams);
  const orgName = practiceLookup.orgName;
  const practiceIdentifier = practiceLookup.lookupValue;
  const hasPracticeIdentifier = practiceLookup.hasIdentifier;
  const screenParam = searchParams.get('screen') || searchParams.get('screening') || '';
  const vaccineParam = searchParams.get('vaccine') || searchParams.get('jab') || searchParams.get('imms') || '';
  const isDemoMode = searchParams.get('demo') === '1';
  const isExactDemo = searchParams.get('exactDemo') === '1';
  const parsedCodes = useMemo(() => parsePatientLinkCodes(codesParam), [codesParam]);
  const requestedCodes = useMemo(() => {
    if (codesParam) {
      return Array.from(new Set(parsedCodes.medicationCodes.length > 0 ? parsedCodes.medicationCodes : parseMedicationCodes(codesParam)));
    }
    const matches = rawCode.match(/\d{3}/g) || [];
    return Array.from(new Set(matches));
  }, [codesParam, parsedCodes.medicationCodes, rawCode]);
  const requestedScreenings = useMemo(
    () => Array.from(new Set(screenParam ? parseRequestedList(screenParam) : parsedCodes.screeningIdentifiers)),
    [parsedCodes.screeningIdentifiers, screenParam],
  );
  const requestedImmunisations = useMemo(
    () => Array.from(new Set((vaccineParam ? parseRequestedList(vaccineParam) : parsedCodes.immunisationIdentifiers).map((item) => item.toLowerCase()))),
    [parsedCodes.immunisationIdentifiers, vaccineParam],
  );
  const issuedAt = useMemo(() => parseSystmOneTimestamp(searchParams.get('codes')), [searchParams]);
  const issuedDateDisplay = useMemo(() => {
    const issuedDate = parsePatientDate(dateParam) || issuedAt;
    if (!issuedDate) return '';
    return issuedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }, [dateParam, issuedAt]);
  const builtInScreeningTemplates = useMemo(
    () => Object.values(SCREENING_TEMPLATES).map(withScreeningTemplateDefaults),
    [],
  );
  const builtInScreeningIds = useMemo(
    () => builtInScreeningTemplates.map((template) => template.id),
    [builtInScreeningTemplates],
  );
  const builtInImmunisationTemplates = useMemo(
    () => Object.values(IMMUNISATION_TEMPLATES).map(withImmunisationTemplateDefaults),
    [],
  );
  const builtInImmunisationIds = useMemo(
    () => builtInImmunisationTemplates.map((template) => template.id),
    [builtInImmunisationTemplates],
  );

  const [isAuthorised, setIsAuthorised] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [practiceFeatures, setPracticeFeatures] = useState<PracticeFeatureSettings>(DEFAULT_PRACTICE_FEATURE_SETTINGS);
  const [validationNonce, setValidationNonce] = useState(0);
  const { medicationMap: allMeds } = useMedicationCatalog();
  const [resolvedContents, setResolvedContents] = useState<Array<{
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
    linkExpiryValue?: number;
    linkExpiryUnit?: 'weeks' | 'months';
  }>>([]);
  const [selectedScreenings, setSelectedScreenings] = useState<ScreeningTemplate[]>([]);
  const [selectedImmunisations, setSelectedImmunisations] = useState<ImmunisationTemplate[]>([]);
  const [isResolvingContents, setIsResolvingContents] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [screeningError, setScreeningError] = useState<string | null>(null);
  const [immunisationError, setImmunisationError] = useState<string | null>(null);
  const [sickDayModalOpen, setSickDayModalOpen] = useState(false);
  const [sickDayRulesVariant, setSickDayRulesVariant] = useState<SickDayRulesVariant>('standard');
  const [completedSectionIds, setCompletedSectionIds] = useState<Set<string>>(() => new Set());
  const loggedAccessKeyRef = useRef<string | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [isSavingPdf, setIsSavingPdf] = useState(false);

  const handleSavePdf = async () => {
    if (!exportRef.current || isSavingPdf) return;
    setIsSavingPdf(true);
    try {
      await saveElementAsPdf(
        exportRef.current,
        orgName ? `${orgName} - Patient Information` : 'MyMedInfo - Patient Information',
      );
    } catch (error) {
      console.error('Failed to save combined patient PDF', error);
      window.print();
    } finally {
      setIsSavingPdf(false);
    }
  };

  useEffect(() => {
    if (isDemoMode) {
      setIsAuthorised(true);
      setAuthError(null);
      setIsValidating(false);
      setPracticeFeatures(DEFAULT_PRACTICE_FEATURE_SETTINGS);
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
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as { expiresAt?: number; valid?: boolean; practiceFeatures?: PracticeFeatureSettings };
          if (isFreshValidationCache(parsed)) {
            if (!cancelled) {
              setIsAuthorised(true);
              setAuthError(null);
              setIsValidating(false);
              setPracticeFeatures(parsed.practiceFeatures || DEFAULT_PRACTICE_FEATURE_SETTINGS);
            }
            return;
          }
        } catch {
          // Ignore invalid cache and continue with live validation.
        }
        window.sessionStorage.removeItem(cacheKey);
      }

      if (!cancelled) {
        setIsAuthorised(null);
        setAuthError(null);
        setPracticeFeatures(DEFAULT_PRACTICE_FEATURE_SETTINGS);
      }

      loadingTimer = window.setTimeout(() => {
        if (!cancelled) {
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
  }, [hasPracticeIdentifier, isDemoMode, practiceIdentifier, practiceLookup.cacheKey, validationNonce]);

  useEffect(() => {
    if (isDemoMode) {
      loggedAccessKeyRef.current = null;
      return;
    }

    if (!practiceIdentifier || isAuthorised !== true) {
      loggedAccessKeyRef.current = null;
      return;
    }

    const accessKey = `${practiceIdentifier.toLowerCase()}|${requestedCodes.join(',')}|${requestedScreenings.join(',')}|${requestedImmunisations.join(',')}`;
    if (loggedAccessKeyRef.current === accessKey) {
      return;
    }

    loggedAccessKeyRef.current = accessKey;
    void (async () => {
      const result = await recordPatientAccess(practiceIdentifier);
      if (!result.ok) {
        loggedAccessKeyRef.current = null;
        setIsAuthorised(null);
        setAuthError(null);
        setValidationNonce((n) => n + 1);
      }
    })();
  }, [isAuthorised, isDemoMode, practiceIdentifier, requestedCodes, requestedScreenings, requestedImmunisations]);

  useEffect(() => {
    let cancelled = false;

    const resolveCards = async () => {
      if (requestedCodes.length === 0) {
        if (!cancelled) {
          setResolvedContents([]);
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
        if (cancelled) return;
        if (result.ok) {
          setResolvedContents(result.cards);
          setResolveError(null);
        } else {
          setResolvedContents([]);
          setResolveError(result.error);
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
  }, [allMeds, hasPracticeIdentifier, isAuthorised, isDemoMode, practiceFeatures.medication_enabled, practiceIdentifier, requestedCodes]);

  useEffect(() => {
    let cancelled = false;

    const loadScreenings = async () => {
      if (requestedScreenings.length === 0) {
        if (!cancelled) {
          setSelectedScreenings([]);
          setScreeningError(null);
        }
        return;
      }

      if (!isDemoMode && (isAuthorised !== true || !practiceFeatures.screening_enabled)) {
        if (!cancelled) {
          setSelectedScreenings([]);
          setScreeningError(null);
        }
        return;
      }

      try {
        const [practiceRows, globalRows] = await Promise.all([
          practiceIdentifier
            ? fetchPatientPracticeCardTemplates<ScreeningTemplate>(practiceIdentifier, 'screening', builtInScreeningIds)
            : Promise.resolve([]),
          fetchCardTemplates<ScreeningTemplate>('screening'),
        ]);

        const candidates = [
          ...practiceRows.map((row) => hydrateScreeningTemplate(row.payload)),
          ...globalRows.map((row) => hydrateScreeningTemplate(row.payload)),
        ];

        const resolvedScreenings = requestedScreenings
          .map((identifier) => findScreeningTemplateByIdentifier(identifier, candidates))
          .filter((item): item is ScreeningTemplate => Boolean(item));

        if (!cancelled) {
          setSelectedScreenings(resolvedScreenings);
          setScreeningError(
            resolvedScreenings.length === requestedScreenings.length
              ? null
              : 'Some screening information could not be loaded for this link. Please contact your GP practice if this problem continues.',
          );
        }
      } catch (error) {
        console.error('Failed to load screening templates', error);
        if (!cancelled) {
          setSelectedScreenings([]);
          setScreeningError('We could not load screening information right now. Please try again.');
        }
      }
    };

    void loadScreenings();

    return () => {
      cancelled = true;
    };
  }, [builtInScreeningIds, builtInScreeningTemplates, isAuthorised, isDemoMode, practiceFeatures.screening_enabled, practiceIdentifier, requestedScreenings]);

  useEffect(() => {
    let cancelled = false;

    const loadImmunisations = async () => {
      if (requestedImmunisations.length === 0) {
        if (!cancelled) {
          setSelectedImmunisations([]);
          setImmunisationError(null);
        }
        return;
      }

      if (!isDemoMode && (isAuthorised !== true || !practiceFeatures.immunisation_enabled)) {
        if (!cancelled) {
          setSelectedImmunisations([]);
          setImmunisationError(null);
        }
        return;
      }

      try {
        const [practiceRows, globalRows] = await Promise.all([
          practiceIdentifier
            ? fetchPatientPracticeCardTemplates<ImmunisationTemplate>(practiceIdentifier, 'immunisation', builtInImmunisationIds)
            : Promise.resolve([]),
          fetchCardTemplates<ImmunisationTemplate>('immunisation'),
        ]);

        const candidates = [
          ...builtInImmunisationTemplates,
          ...globalRows.map((row) => withImmunisationTemplateDefaults(row.payload)),
          ...practiceRows.map((row) => withImmunisationTemplateDefaults(row.payload)),
        ];
        const resolvedImmunisations = requestedImmunisations
          .map((identifier) => findImmunisationTemplateByIdentifier(identifier, candidates))
          .filter((item): item is ImmunisationTemplate => Boolean(item));

        if (!cancelled) {
          setSelectedImmunisations(resolvedImmunisations);
          setImmunisationError(
            resolvedImmunisations.length === requestedImmunisations.length
              ? null
              : 'Some immunisation information could not be loaded for this link. Please contact your GP practice if this problem continues.',
          );
        }
      } catch (error) {
        console.error('Failed to load immunisation templates', error);
        if (!cancelled) {
          setSelectedImmunisations([]);
          setImmunisationError('We could not load immunisation information right now. Please try again.');
        }
      }
    };

    void loadImmunisations();

    return () => {
      cancelled = true;
    };
  }, [builtInImmunisationIds, builtInImmunisationTemplates, isAuthorised, isDemoMode, practiceFeatures.immunisation_enabled, practiceIdentifier, requestedImmunisations]);

  const medicationContents = useMemo(() => {
    if (isDemoMode || !hasPracticeIdentifier) {
      return sortMedicationGroups(
        requestedCodes
          .map((code) => (allMeds[code] ? { id: code, state: 'global' as const, ...allMeds[code] } : null))
          .filter((item): item is NonNullable<typeof item> => item !== null && !!item.title),
      );
    }

    if (hasPracticeIdentifier && isAuthorised !== true) {
      return [];
    }

    return sortMedicationGroups(
      resolvedContents.map((card) => ({
        id: card.code,
        ...card,
      })),
    );
  }, [allMeds, hasPracticeIdentifier, isAuthorised, isDemoMode, requestedCodes, resolvedContents]);

  const groupedMedicationContents = useMemo(() => {
    const groups = new Map<'NEW' | 'REAUTH' | 'GENERAL', typeof medicationContents>();
    medicationContents.forEach((content) => {
      const existing = groups.get(content.badge) ?? [];
      groups.set(content.badge, [...existing, content]);
    });
    return Array.from(groups.entries()).sort(
      ([leftBadge], [rightBadge]) => MEDICATION_BADGE_ORDER[leftBadge] - MEDICATION_BADGE_ORDER[rightBadge],
    );
  }, [medicationContents]);

  const pageHeadline = 'Your GP practice has shared some information with you which you may find useful.';

  const pageValidUntil = useMemo(() => {
    const sources = [
      ...medicationContents.map((content) => ({ linkExpiryValue: content.linkExpiryValue, linkExpiryUnit: content.linkExpiryUnit })),
      ...selectedScreenings.map((template) => ({ linkExpiryValue: template.linkExpiryValue, linkExpiryUnit: template.linkExpiryUnit })),
      ...selectedImmunisations.map((template) => ({ linkExpiryValue: template.linkExpiryValue, linkExpiryUnit: template.linkExpiryUnit })),
    ];
    const expiry = getEarliestExpiryDate(issuedAt, sources);
    return expiry ? expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  }, [issuedAt, medicationContents, selectedScreenings, selectedImmunisations]);

  const sectionLinks = useMemo(() => {
    const links: Array<{ id: string; label: string }> = [];
    if (medicationContents.length > 0) links.push({ id: 'bundle-medications', label: 'Medications' });
    if (selectedScreenings.length > 0) {
      selectedScreenings.forEach((screening) => {
        links.push({ id: `screening-${screening.code.toLowerCase()}`, label: screening.label });
      });
    }
    if (selectedImmunisations.length > 0) {
      selectedImmunisations.forEach((immunisation) => {
        links.push({ id: `immunisation-${immunisation.id.toLowerCase()}`, label: immunisation.label });
      });
    }
    return links;
  }, [medicationContents.length, selectedScreenings, selectedImmunisations]);

  useEffect(() => {
    setCompletedSectionIds(new Set());

    if (sectionLinks.length === 0 || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleIds = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target.id)
          .filter(Boolean);

        if (visibleIds.length === 0) return;

        setCompletedSectionIds((current) => {
          const next = new Set(current);
          visibleIds.forEach((id) => next.add(id));
          return next;
        });
      },
      {
        threshold: 0,
        rootMargin: '0px 0px -45% 0px',
      },
    );

    sectionLinks.forEach((link) => {
      const element = document.getElementById(link.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [sectionLinks]);

  const summaryParts = [
    medicationContents.length > 0 ? `${medicationContents.length} medication ${medicationContents.length === 1 ? 'update' : 'updates'}` : '',
    selectedScreenings.length > 0 ? `${selectedScreenings.length} screening ${selectedScreenings.length === 1 ? 'reminder' : 'reminders'}` : '',
    selectedImmunisations.length > 0 ? `${selectedImmunisations.length} immunisation ${selectedImmunisations.length === 1 ? 'update' : 'updates'}` : '',
  ].filter(Boolean);

  const summaryText = summaryParts.length > 0
    ? `${getContentListPhrase(summaryParts)} ready to review.`
    : 'Your GP practice has shared information for you to review.';

  if ((isValidating || isResolvingContents) && hasPracticeIdentifier && !isDemoMode) {
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

  if (hasPracticeIdentifier && isAuthorised === false && !isDemoMode) {
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

  return (
    <div className="animation-container patient-view patient-page-shell" ref={exportRef}>
      <h1 className="sr-only">Patient information</h1>
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
          {(issuedDateDisplay || pageValidUntil) && (
            <p className="patient-greeting-meta">
              {issuedDateDisplay ? `Sent ${issuedDateDisplay}` : ''}
              {issuedDateDisplay && pageValidUntil ? ' · ' : ''}
              {pageValidUntil ? `Valid until ${pageValidUntil}` : ''}
            </p>
          )}
        </div>
      </div>

      <section className="card patient-bundle-summary">
        <div className="patient-bundle-summary__header">
          <div className="patient-bundle-summary__icon">
            <LinkIcon size={20} />
          </div>
          <div>
            <h2 className="patient-section-title" style={{ marginBottom: '0.2rem' }}>Today&apos;s information</h2>
            <p className="patient-section-copy" style={{ marginBottom: 0 }}>{summaryText}</p>
          </div>
        </div>
        {sectionLinks.length > 0 && (
          <div className="patient-bundle-jumps">
            {sectionLinks.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                className={`patient-bundle-jump${completedSectionIds.has(link.id) ? ' patient-bundle-jump--complete' : ''}`}
                aria-label={`${link.label}${completedSectionIds.has(link.id) ? ', complete' : ', not complete'}`}
              >
                {completedSectionIds.has(link.id) && (
                  <span className="patient-bundle-jump__status" aria-hidden="true">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
                {link.label}
              </a>
            ))}
          </div>
        )}
      </section>

      <div className="patient-print-bar no-print">
        <button onClick={() => void handleSavePdf()} className="action-button patient-print-button" style={{ backgroundColor: '#4c6272', color: 'white', padding: '0.5rem 1rem', fontSize: '0.9rem', marginTop: 0 }}>
          <Printer size={16} /> {isSavingPdf ? 'Saving PDF...' : 'Save page as PDF'}
        </button>
      </div>

      {requestedCodes.length > 0 && !practiceFeatures.medication_enabled && hasPracticeIdentifier && isAuthorised === true && !isDemoMode && (
        <div className="card patient-state-card" role="alert" aria-live="assertive">
          <h2 className="patient-section-title">Medication cards unavailable</h2>
          <p className="patient-section-copy" style={{ marginBottom: 0 }}>Medication cards are not enabled for this practice yet.</p>
        </div>
      )}

      {resolveError && medicationContents.length === 0 && (
        <div className="card patient-state-card" role="alert" aria-live="assertive">
          <h2 className="patient-section-title">Medication information unavailable</h2>
          <p className="patient-section-copy" style={{ marginBottom: 0 }}>{resolveError}</p>
        </div>
      )}

      {medicationContents.length > 0 && (
        <section id="bundle-medications">
      {groupedMedicationContents.map(([badge, items], index) => (
        <section key={badge} className={`patient-section patient-section--${badge.toLowerCase()}`}>
          <div className={`patient-group-heading patient-group-heading--${badge.toLowerCase()}`}>
            <div className="patient-group-eyebrow">{GROUP_COPY[badge].title}</div>
            <p className="patient-group-copy">
              {getMedicationGroupCopy(
                badge,
                items.length,
                index > 0,
                index < groupedMedicationContents.length - 1,
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
                        {validUntil && !isExpired && (
                          <span className="patient-code-chip">Valid until {validUntil}</span>
                        )}
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
                          <h3 className="patient-section-title patient-section-title--small">Don&apos;t</h3>
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
                                  <span className="patient-resource-meta-text">Official guidance</span>
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
        </section>
      )}

      {requestedScreenings.length > 0 && !practiceFeatures.screening_enabled && hasPracticeIdentifier && isAuthorised === true && !isDemoMode && (
        <div className="card patient-state-card" role="alert" aria-live="assertive">
          <h2 className="patient-section-title">Screening information unavailable</h2>
          <p className="patient-section-copy" style={{ marginBottom: 0 }}>Screening information is not enabled for this practice yet.</p>
        </div>
      )}

      {screeningError && (
        <div className="card patient-state-card" role="alert" aria-live="assertive">
          <h2 className="patient-section-title">Screening information unavailable</h2>
          <p className="patient-section-copy" style={{ marginBottom: 0 }}>{screeningError}</p>
        </div>
      )}

      {selectedScreenings.map((template) => (
        <section key={template.id} id={`screening-${template.code.toLowerCase()}`} className="card patient-section-card patient-section-card--bundle">
          {(() => {
            const validUntil = formatValidUntil(issuedAt, template.linkExpiryValue, template.linkExpiryUnit);
            const isExpired = Boolean(
              issuedAt &&
              template.linkExpiryValue &&
              template.linkExpiryUnit &&
              isUrlExpired(issuedAt, template.linkExpiryValue, template.linkExpiryUnit),
            );
            return (
              <>
          {isExpired && (
            <div className="out-of-date-banner" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#8a1538', fontSize: '0.95rem', backgroundColor: '#fbe3ea', padding: '0.85rem 1rem', borderRadius: '8px', border: '2px solid #8a1538', marginBottom: '1rem', fontWeight: 700 }}>
              <AlertCircle size={20} style={{ flexShrink: 0 }} />
              <span>
                This information is more than {formatExpiryWindowLabel(template.linkExpiryValue, template.linkExpiryUnit)} old and may be out of date. If you have any queries please speak to your GP practice.
              </span>
            </div>
          )}
          {validUntil && !isExpired && (
            <div className="patient-card-meta" style={{ marginBottom: '0.85rem' }}>
              <span className="patient-code-chip">Valid until {validUntil}</span>
            </div>
          )}
              </>
            );
          })()}
          <div className="patient-bundle-section-label">
            <Search size={16} />
            Screening reminder
          </div>
          <h2 className="patient-section-title">{template.label}</h2>
          <p className="patient-section-copy">{template.headline}</p>

          <div className="patient-info-section">
            <h3 className="patient-section-title patient-section-title--small">Guidance</h3>
            <p className="patient-section-copy patient-section-copy--formatted" style={{ marginBottom: 0 }}>{template.explanation}</p>
          </div>

          {template.importantMessage && (
            <WarningCallout title="Important">
              <p className="patient-section-copy patient-section-copy--formatted" style={{ marginBottom: 0 }}>
                {template.importantMessage}
              </p>
            </WarningCallout>
          )}

          <div className="patient-info-section">
            <h3 className="patient-section-title patient-section-title--small">Do</h3>
            <ul className="patient-info-list">
              {template.guidance.map((item, index) => (
                <li key={index} className="patient-info-item">
                  <div className="patient-info-icon"><NhsTick size={22} aria-hidden="true" /></div>
                  <span className="patient-info-text">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {template.dontGuidance && template.dontGuidance.length > 0 && (
            <div className="patient-info-section">
              <h3 className="patient-section-title patient-section-title--small">Don&apos;t</h3>
              <ul className="patient-info-list">
                {template.dontGuidance.map((item, index) => (
                  <li key={index} className="patient-info-item">
                    <div className="patient-info-icon"><NhsCross size={22} aria-hidden="true" /></div>
                    <span className="patient-info-text">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {getVideoEmbedUrl(template.videoUrl) && (
            <div className="patient-info-section">
              <h3 className="patient-section-title patient-section-title--small">{template.videoTitle || 'Video guidance'}</h3>
              <div style={{ aspectRatio: '16 / 9', width: '100%', overflow: 'hidden', borderRadius: '8px', border: '1px solid #d8dde0', background: '#000' }}>
                <iframe
                  src={getVideoEmbedUrl(template.videoUrl)}
                  title={template.videoTitle || `${template.label} video guidance`}
                  style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
          )}

          <div className="patient-resources patient-section-divider">
            <h3 className="patient-resources-heading">Further guidance</h3>
            <div className="patient-resource-list patient-resource-list--compact">
              {template.nhsLinks.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="patient-resource-link patient-resource-link--compact"
                  aria-label={`${link.title} opens in new tab`}
                >
                  <div className="patient-resource-meta">
                    <div className="patient-resource-chip">NHS</div>
                    <span className="patient-resource-meta-text">National guidance</span>
                  </div>
                  <h3>{link.title}</h3>
                  <p className="patient-resource-copy">{link.description}</p>
                  <span className="patient-resource-arrow" aria-hidden="true"><ExternalLink size={18} /></span>
                </a>
              ))}
            </div>
          </div>
        </section>
      ))}

      {requestedImmunisations.length > 0 && !practiceFeatures.immunisation_enabled && hasPracticeIdentifier && isAuthorised === true && !isDemoMode && (
        <div className="card patient-state-card" role="alert" aria-live="assertive">
          <h2 className="patient-section-title">Immunisation information unavailable</h2>
          <p className="patient-section-copy" style={{ marginBottom: 0 }}>Immunisation information is not enabled for this practice yet.</p>
        </div>
      )}

      {immunisationError && (
        <div className="card patient-state-card" role="alert" aria-live="assertive">
          <h2 className="patient-section-title">Immunisation information unavailable</h2>
          <p className="patient-section-copy" style={{ marginBottom: 0 }}>{immunisationError}</p>
        </div>
      )}

      {selectedImmunisations.map((template) => (
        <section key={template.id} id={`immunisation-${template.id.toLowerCase()}`} className="card patient-section-card patient-section-card--bundle">
          {(() => {
            const validUntil = formatValidUntil(issuedAt, template.linkExpiryValue, template.linkExpiryUnit);
            const isExpired = Boolean(
              issuedAt &&
              template.linkExpiryValue &&
              template.linkExpiryUnit &&
              isUrlExpired(issuedAt, template.linkExpiryValue, template.linkExpiryUnit),
            );
            return (
              <>
                {isExpired && (
                  <div className="out-of-date-banner" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#8a1538', fontSize: '0.95rem', backgroundColor: '#fbe3ea', padding: '0.85rem 1rem', borderRadius: '8px', border: '2px solid #8a1538', marginBottom: '1rem', fontWeight: 700 }}>
                    <AlertCircle size={20} style={{ flexShrink: 0 }} />
                    <span>
                      This information is more than {formatExpiryWindowLabel(template.linkExpiryValue, template.linkExpiryUnit)} old and may be out of date. If you have any queries please speak to your GP practice.
                    </span>
                  </div>
                )}
                {validUntil && !isExpired && (
                  <div className="patient-card-meta" style={{ marginBottom: '0.85rem' }}>
                    <span className="patient-code-chip">Valid until {validUntil}</span>
                  </div>
                )}
              </>
            );
          })()}
          <div className="patient-bundle-section-label">
            <ShieldCheck size={16} />
            Immunisation update
          </div>
          <h2 className="patient-section-title">{template.label}</h2>
          <p className="patient-section-copy">{template.headline}</p>
          <p className="patient-section-copy patient-section-copy--formatted">{template.explanation}</p>

          {template.importantMessage && (
            <WarningCallout title="Important">
              <p className="patient-section-copy patient-section-copy--formatted" style={{ marginBottom: 0 }}>
                {template.importantMessage}
              </p>
            </WarningCallout>
          )}

          <div className="patient-info-section">
            <h3 className="patient-section-title patient-section-title--small">Aftercare and guidance</h3>
            <ul className="patient-info-list">
              {template.guidance.map((item, index) => (
                <li key={index} className="patient-info-item">
                  <div className="patient-info-icon"><NhsTick size={22} aria-hidden="true" /></div>
                  <span className="patient-info-text">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {getVideoEmbedUrl(template.videoUrl) && (
            <div className="patient-info-section">
              <h3 className="patient-section-title patient-section-title--small">{template.videoTitle || 'Video guidance'}</h3>
              <div style={{ aspectRatio: '16 / 9', width: '100%', overflow: 'hidden', borderRadius: '8px', border: '1px solid #d8dde0', background: '#000' }}>
                <iframe
                  src={getVideoEmbedUrl(template.videoUrl)}
                  title={template.videoTitle || `${template.label} video guidance`}
                  style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
          )}

          <div className="patient-resources patient-section-divider">
            <h3 className="patient-resources-heading">Further guidance</h3>
            <div className="patient-resource-list patient-resource-list--compact">
              {template.nhsLinks.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="patient-resource-link patient-resource-link--compact"
                  aria-label={`${link.title} opens in new tab`}
                >
                  <div className="patient-resource-meta">
                    <div className="patient-resource-chip">NHS</div>
                    <span className="patient-resource-meta-text">National guidance</span>
                  </div>
                  <h3>{link.title}</h3>
                  <p className="patient-resource-copy">{link.description}</p>
                  <span className="patient-resource-arrow" aria-hidden="true"><ExternalLink size={18} /></span>
                </a>
              ))}
            </div>
          </div>
        </section>
      ))}

      {(resolvedContents.length > 0 || selectedScreenings.length > 0 || selectedImmunisations.length > 0) && (
        <PatientSupportFooter text={orgName || 'Nottingham West Primary Care Network'} />
      )}

      <div className="hc-rating__notice">
        <PatientGuidanceNotice text="Service provided by your GP practice on behalf of the NHS." />
      </div>
    </div>
  );
};

export default CombinedPatientView;
