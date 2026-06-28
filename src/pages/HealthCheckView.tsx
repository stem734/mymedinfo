import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, ShieldCheck, AlertTriangle, CircleCheck, CircleAlert, CalendarClock, ChevronRight, Printer } from 'lucide-react';
import { parseHealthCheckParams } from '../healthCheckParser';
import { METRIC_ORDER, METRIC_DEFINITIONS, type ParsedMetric } from '../healthCheckData';
import { PREVIEW_DOMAIN_CONFIGS, type ClinicalDomainId } from '../healthCheckVariantConfig';
import HealthCheckCard from '../components/HealthCheckCard';
import PatientSupportFooter from '../components/PatientSupportFooter';
// pdfExport pulls in jsPDF + html2canvas (~600 kB / ~177 kB gzip). It is loaded
// on demand inside handleSavePdf so patients don't download it on initial load.
import { fetchCardTemplates } from '../cardTemplateStore';
import { fetchPatientPracticeCardTemplates } from '../practiceCardTemplateStore';
import type { HealthCheckTemplatePayload } from '../cardTemplateTypes';
import { usePracticeContentAccess } from '../usePracticeContentAccess';
import { getPracticeLookupFromSearchParams } from '../practiceLookup';
import { getExpiryDate, isUrlExpired, parseSystmOneTimestamp } from '../dateHelpers';
import { interpolatePracticeTemplateVariables } from '../practiceTemplateVariables';

// ─── Helpers (ported from NHSHealthCheck/App.tsx) ─────────────────────────────

const patientLabelForMetric = (metric: ParsedMetric): string => {
  switch (metric.id) {
    case 'bp':    return 'Blood pressure';
    case 'bmi':   return 'Body Mass Index (BMI)';
    case 'cvd':   return 'Heart disease risk (QRISK score)';
    case 'ldl':   return 'Cholesterol';
    case 'hba1c': return 'Blood sugar (HbA1c)';
    case 'act':   return 'How active you are';
    case 'alc':   return 'Alcohol';
    case 'smk':   return 'Smoking';
    default:      return metric.label;
  }
};

const patientBadgeForSeverity = (badgeClass: ParsedMetric['badgeClass']): string => {
  if (badgeClass === 'red')   return 'Needs action';
  if (badgeClass === 'amber') return 'Needs attention';
  return 'Healthy';
};

const riskRank = (badgeClass: ParsedMetric['badgeClass']): number => {
  if (badgeClass === 'red')   return 0;
  if (badgeClass === 'amber') return 1;
  return 2;
};

const groupLabelForRisk = (badgeClass: ParsedMetric['badgeClass']): string => {
  if (badgeClass === 'red')   return 'Higher risk';
  if (badgeClass === 'amber') return 'To review';
  return 'In a healthy range';
};

const cholesterolPrimaryValue = (metric: ParsedMetric): string => {
  const components = metric.components || {};
  const code = (metric.resultCode || '').toUpperCase().trim();
  if (code === 'CHOLNORMAL') return components.tc || metric.value;
  return components.ldl || metric.value || components.tc || '';
};

const getDisplayMetrics = (metrics: ParsedMetric[]): ParsedMetric[] =>
  METRIC_ORDER.filter((id) => id !== 'nhdl' && id !== 'tc').map((id) => {
    const parsed = metrics.find((m) => m.id === id);
    const def = METRIC_DEFINITIONS[id];
    if (parsed) return parsed;
    return {
      id, label: def.label, value: '—', unit: def.unit,
      what: def.what, whatTitle: def.whatTitle,
      status: 'unknown' as const, badge: 'NORMAL', badgeClass: 'ok' as const,
      pathway: 'No result provided for this metric.',
      meaning: '', helpLinks: [],
    };
  });

const metricIdToTemplateId = (metricId: string) => metricId.split(':')[0] || metricId;

const getHealthCheckVariant = (payload: HealthCheckTemplatePayload | undefined, resultCodeRaw: string) => {
  const variants = payload?.variants;
  if (!variants) return undefined;

  const resultCode = (resultCodeRaw || '').trim();
  if (resultCode && variants[resultCode]) {
    return variants[resultCode];
  }

  const normalised = resultCode.toUpperCase();
  const matchingKey = Object.keys(variants).find((key) => key.toUpperCase() === normalised);
  return matchingKey ? variants[matchingKey] : undefined;
};

const buildPreviewMetrics = (domainId: ClinicalDomainId): ParsedMetric[] => {
  const domainConfig = PREVIEW_DOMAIN_CONFIGS[domainId];
  return Object.entries(domainConfig.metricByCode).map(([resultCode, metric]) => ({
    id: `${domainId}:${resultCode}`,
    label: metric.label,
    value: metric.value,
    unit: metric.unit,
    whatTitle: domainConfig.whatIsTitle,
    what: domainConfig.whatIsText,
    resultCode,
    status: metric.badgeClass === 'ok' ? 'ok' : metric.badgeClass === 'amber' ? 'amber' : 'red',
    badge: metric.badge,
    badgeClass: metric.badgeClass,
    pathway: metric.pathway,
    meaning: metric.pathway,
    helpLinks: [],
  }));
};

const formatValidUntil = (issuedAt: Date | null, value?: number, unit?: 'weeks' | 'months') => {
  if (!issuedAt || !value || !unit) return '';
  return getExpiryDate(issuedAt, value, unit).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

// ─── Main HealthCheckView ─────────────────────────────────────────────────────

const HealthCheckView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const practiceLookup = getPracticeLookupFromSearchParams(searchParams);
  const org = practiceLookup.orgName;
  const practiceIdentifier = practiceLookup.lookupValue;
  const isDemoMode = searchParams.get('demo') === '1';
  const previewOnly = searchParams.get('previewOnly') === '1';
  const previewDomain = (searchParams.get('previewDomain') || '').trim() as ClinicalDomainId | '';
  const previewToken = (searchParams.get('previewToken') || '').trim();
  const localSupportName = searchParams.get('localName') || `${org || 'Your practice'} support team`;
  const localSupportPhone = searchParams.get('localPhone') || '';
  const localSupportEmail = searchParams.get('localEmail') || '';
  const localSupportWebsite = searchParams.get('localWebsite') || '';
  const issuedAt = useMemo(() => parseSystmOneTimestamp(searchParams.get('codes')), [searchParams]);

  const metrics = useMemo(() => {
    if (previewOnly && previewDomain && PREVIEW_DOMAIN_CONFIGS[previewDomain]) {
      return buildPreviewMetrics(previewDomain);
    }
    return parseHealthCheckParams(searchParams);
  }, [previewDomain, previewOnly, searchParams]);
  const hasData = metrics.length > 0;
  const [templateOverrides, setTemplateOverrides] = useState<Record<string, HealthCheckTemplatePayload>>({});
  const access = usePracticeContentAccess(practiceIdentifier, 'healthcheck_enabled', { skip: previewOnly || isDemoMode });
  const practicePhone = access.details?.contactPhone || localSupportPhone;
  const templateIds = useMemo(
    () => Array.from(new Set(metrics.map((metric) => metricIdToTemplateId(metric.id)))),
    [metrics],
  );
  const effectiveTemplateOverrides = useMemo(
    () => (templateIds.length === 0 ? {} : templateOverrides),
    [templateIds, templateOverrides],
  );
  const previewTemplateOverrides = useMemo<Record<string, HealthCheckTemplatePayload>>(() => {
    if (!previewOnly || !previewDomain || !previewToken || typeof window === 'undefined') {
      return {};
    }

    try {
      const raw = window.sessionStorage.getItem(previewToken);
      if (!raw) return {};
      const payload = JSON.parse(raw) as HealthCheckTemplatePayload;
      return payload?.variants ? { [previewDomain]: payload } : {};
    } catch {
      return {};
    }
  }, [previewDomain, previewOnly, previewToken]);
  const mergedTemplateOverrides = useMemo(
    () => ({ ...effectiveTemplateOverrides, ...previewTemplateOverrides }),
    [effectiveTemplateOverrides, previewTemplateOverrides],
  );
  useEffect(() => {
    if (templateIds.length === 0) {
      return;
    }
    const loadOverrides = async () => {
      try {
        const practiceRows = await fetchPatientPracticeCardTemplates<HealthCheckTemplatePayload>(practiceIdentifier, 'healthcheck', templateIds);
        const practiceMap = Object.fromEntries(
          practiceRows.map((row) => [
            row.template_id,
            interpolatePracticeTemplateVariables(row.payload, { practicePhone }),
          ]),
        );
        const rows = await fetchCardTemplates<HealthCheckTemplatePayload>('healthcheck', templateIds);
        setTemplateOverrides({
          ...Object.fromEntries(
            rows.map((row) => [
              row.template_id,
              interpolatePracticeTemplateVariables(row.payload, { practicePhone }),
            ]),
          ),
          ...practiceMap,
        });
      } catch (error) {
        console.error('Failed to load health check template overrides', error);
        setTemplateOverrides({});
      }
    };
    loadOverrides();
  }, [isDemoMode, practiceIdentifier, practicePhone, templateIds]);

  const displayMetrics = useMemo(() => {
    const baseMetrics = previewOnly && previewDomain ? metrics : getDisplayMetrics(metrics);
    return baseMetrics.map((metric) => {
      const templatePayload = mergedTemplateOverrides[metricIdToTemplateId(metric.id)];
      const variant = getHealthCheckVariant(templatePayload, metric.resultCode || '');
      if (!variant) return metric;
      return {
        ...metric,
        whatTitle: variant.whatIsTitle || metric.whatTitle,
        what: variant.whatIsText || metric.what,
        pathway: variant.resultsMessage || metric.pathway,
        helpLinks: (variant.links || [])
          .filter((link) => (link.title || '').trim() && (link.website || '').trim())
          .map((link) => ({ title: link.title, url: link.website || '' })),
      };
    });
  }, [mergedTemplateOverrides, metrics, previewDomain, previewOnly]);

  const groupedMetrics = useMemo(() => {
    const withIndex = displayMetrics.map((metric, index) => ({ metric, index }));
    withIndex.sort((a, b) => {
      const r = riskRank(a.metric.badgeClass) - riskRank(b.metric.badgeClass);
      return r !== 0 ? r : a.index - b.index;
    });
    const groups: { label: string; items: ParsedMetric[] }[] = [];
    withIndex.forEach(({ metric }) => {
      const label = groupLabelForRisk(metric.badgeClass);
      const last = groups[groups.length - 1];
      if (!last || last.label !== label) groups.push({ label, items: [metric] });
      else last.items.push(metric);
    });
    return groups;
  }, [displayMetrics]);

  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    return initial;
  });
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [isSavingPdf, setIsSavingPdf] = useState(false);

  // Auto-expand red cards on first render after metrics load
  useMemo(() => {
    const next: Record<string, boolean> = {};
    displayMetrics.forEach((m) => { next[m.id] = m.badgeClass === 'red'; });
    Object.assign(expandedCards, next);
  }, [displayMetrics]); // eslint-disable-line react-hooks/exhaustive-deps

  const severityCounts = useMemo(() => {
    const counts = { red: 0, amber: 0, ok: 0 };
    displayMetrics.forEach((m) => {
      if (m.badgeClass === 'red') counts.red++;
      else if (m.badgeClass === 'amber') counts.amber++;
      else counts.ok++;
    });
    return counts;
  }, [displayMetrics]);

  const hasRedResults = severityCounts.red > 0;

  const triageHeadline = hasRedResults
    ? `Your results show ${severityCounts.red} thing${severityCounts.red === 1 ? '' : 's'} that need follow-up.`
    : severityCounts.amber > 0
      ? `Your results show ${severityCounts.amber} thing${severityCounts.amber === 1 ? '' : 's'} to keep an eye on.`
      : 'Your results look good overall.';

  const resultDateText = displayMetrics.find((m) => m.resultDate)?.resultDate || '';
  const resultDateDisplay = useMemo(() => {
    if (!resultDateText) return '';
    try {
      return new Date(resultDateText).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return resultDateText; }
  }, [resultDateText]);

  const mostUrgentMetric = useMemo(() => {
    const priority = ['bp', 'hba1c', 'cvd', 'ldl', 'bmi', 'smk', 'alc', 'act'];
    const red = displayMetrics.filter((m) => m.badgeClass === 'red');
    return red.sort((a, b) => priority.indexOf(a.id) - priority.indexOf(b.id))[0] || null;
  }, [displayMetrics]);

  const localSupportLink = useMemo(() => {
    if (!(localSupportPhone || localSupportEmail || localSupportWebsite)) return null;
    return {
      title: localSupportName,
      showTitleOnCard: true,
      phone: localSupportPhone,
      phoneLabel: 'Call',
      email: localSupportEmail,
      emailLabel: 'Email',
      website: localSupportWebsite,
      websiteLabel: 'Website',
    };
  }, [localSupportEmail, localSupportName, localSupportPhone, localSupportWebsite]);

  const jumpToUrgent = () => {
    if (!mostUrgentMetric) return;
    document.getElementById(`metric-${mostUrgentMetric.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSavePdf = async () => {
    if (!exportRef.current || isSavingPdf) return;
    setIsSavingPdf(true);
    try {
      const { saveElementAsPdf } = await import('../pdfExport');
      await saveElementAsPdf(
        exportRef.current,
        org ? `${org} - Health Check Results` : 'MyMedInfo - Health Check Results',
      );
    } catch (error) {
      console.error('Failed to save health check PDF', error);
      window.print();
    } finally {
      setIsSavingPdf(false);
    }
  };

  if (access.loading) {
    return (
      <div className="card patient-state-card" style={{ textAlign: 'center' }}>
        <Activity size={64} color="#005eb8" style={{ marginBottom: '1rem' }} />
        <h1>NHS Health Check</h1>
        <p style={{ color: '#4c6272', maxWidth: '36rem', margin: '0 auto', lineHeight: 1.6 }}>
          Checking whether this practice has health check information enabled.
        </p>
      </div>
    );
  }

  if (!access.allowed) {
    return (
      <div className="card patient-state-card" style={{ textAlign: 'center' }}>
        <ShieldCheck size={64} color="#005eb8" style={{ marginBottom: '1rem' }} />
        <h1>NHS Health Check</h1>
        <p style={{ color: '#4c6272', maxWidth: '40rem', margin: '0 auto', lineHeight: 1.6 }}>
          {access.error || 'This practice has not enabled health check information yet.'}
        </p>
      </div>
    );
  }

  // ─── Empty state ────────────────────────────────────────────────────────────
  if (!hasData) {
    return (
      <div className="card patient-state-card" style={{ textAlign: 'center' }}>
        <Activity size={64} color="#005eb8" style={{ marginBottom: '1rem' }} />
        <h1>NHS Health Check</h1>
        <p style={{ fontSize: '1.1rem', fontWeight: 500, marginBottom: '1rem' }}>Clear, trusted results for patients</p>
        <p style={{ color: '#4c6272', maxWidth: '44rem', margin: '0 auto', lineHeight: 1.6 }}>
          Use the link provided by your GP practice to view your NHS Health Check results.
        </p>
      </div>
    );
  }

  // ─── Results view ────────────────────────────────────────────────────────────
  return (
    <div className="hc-page hc-page--mobile patient-page-shell" ref={exportRef}>
      <h1 className="sr-only">NHS health check results</h1>
      {/* Top bar */}
      <div className="hc-topbar">
        <Activity size={20} color="#005eb8" />
        <div className="hc-topbar__title">NHS Health Check{org ? ` — ${org}` : ''}</div>
      </div>

      {/* Hero */}
      <div className="hc-hero">
        <h1 className="hc-header__title">Your Health Check Results</h1>
        <p className="hc-header__sub">
          {resultDateDisplay ? `Results from ${resultDateDisplay}.` : ''} Your summary across {displayMetrics.length} key health metrics.
        </p>
      </div>

      {/* Privacy bar */}
      {/* Triage summary */}
      <section className={`hc-triage hc-triage--${hasRedResults ? 'red' : severityCounts.amber > 0 ? 'amber' : 'ok'}`} aria-label="Results summary">
        <div className="hc-triage__headline">
          {hasRedResults
            ? <AlertTriangle size={18} aria-hidden="true" />
            : severityCounts.amber > 0
              ? <CircleAlert size={18} aria-hidden="true" />
              : <CircleCheck size={18} aria-hidden="true" />}
          <span>{triageHeadline}</span>
        </div>
        <div className="hc-triage__counts">
          <span className="hc-triage__pill hc-triage__pill--red">{severityCounts.red} need follow-up</span>
          <span className="hc-triage__pill hc-triage__pill--amber">{severityCounts.amber} to review</span>
          <span className="hc-triage__pill hc-triage__pill--ok">{severityCounts.ok} looking good</span>
        </div>
        {hasRedResults && (
          <div className="hc-triage__cta">
            <button type="button" className="hc-primary-cta hc-primary-cta--urgent" onClick={jumpToUrgent}>
              <CalendarClock size={18} aria-hidden="true" />
              See what needs follow-up
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </section>

      {/* Metric card groups */}
      {groupedMetrics.map((group) => {
        const groupTone = group.label === 'Higher risk' ? 'red' : group.label === 'To review' ? 'amber' : 'ok';
        return (
          <section key={group.label} className={`hc-group hc-group--${groupTone}`}>
            <div className="hc-group__header">
              <h2 className="hc-group__title">{group.label}</h2>
              <button
                type="button"
                className="hc-group__toggle"
                onClick={() => {
                  const ids = group.items.map((m) => m.id);
                  const anyCollapsed = ids.some((id) => !expandedCards[id]);
                  setExpandedCards((cur) => {
                    const next = { ...cur };
                    ids.forEach((id) => { next[id] = anyCollapsed; });
                    return next;
                  });
                }}
              >
                {group.items.some((m) => !expandedCards[m.id]) ? 'Expand all' : 'Collapse all'}
              </button>
            </div>
            <div className="hc-grid">
              {group.items.map((metric) => {
                const templatePayload = mergedTemplateOverrides[metricIdToTemplateId(metric.id)];
                const variant = getHealthCheckVariant(templatePayload, metric.resultCode || '');
                const metricExpired = Boolean(
                  issuedAt &&
                  templatePayload?.linkExpiryValue &&
                  templatePayload?.linkExpiryUnit &&
                  isUrlExpired(issuedAt, templatePayload.linkExpiryValue, templatePayload.linkExpiryUnit),
                );
                const validUntil = formatValidUntil(issuedAt, templatePayload?.linkExpiryValue, templatePayload?.linkExpiryUnit);
                const cholBreakdown = metric.id === 'ldl' && metric.components ? [
                  { label: 'HDL',     value: metric.components.hdl || '', unit: 'mmol/L' },
                  { label: 'LDL',     value: metric.components.ldl || '', unit: 'mmol/L' },
                  { label: 'Non-HDL', value: (() => {
                      const tc = parseFloat(metric.components?.tc || '');
                      const hdl = parseFloat(metric.components?.hdl || '');
                      return isFinite(tc) && isFinite(hdl) ? (tc - hdl).toFixed(1) : '';
                  })(), unit: 'mmol/L' },
                  { label: 'Total',   value: metric.components.tc || '', unit: 'mmol/L' },
                ] : undefined;

                return (
                  <div key={metric.id} id={`metric-${metric.id}`}>
                    {metricExpired && (
                      <div className="out-of-date-banner" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#8a1538', fontSize: '0.95rem', backgroundColor: '#fbe3ea', padding: '0.85rem 1rem', borderRadius: '8px', border: '2px solid #8a1538', marginBottom: '0.75rem', fontWeight: 700 }}>
                        <AlertTriangle size={20} style={{ flexShrink: 0 }} />
                        <span>
                          This information is more than {templatePayload?.linkExpiryValue} {templatePayload?.linkExpiryValue === 1 ? templatePayload?.linkExpiryUnit?.replace(/s$/, '') : templatePayload?.linkExpiryUnit} old and may be out of date. If you have any queries please speak to your GP practice.
                        </span>
                      </div>
                    )}
                    {validUntil && !metricExpired && (
                      <div className="patient-card-meta" style={{ marginBottom: '0.75rem' }}>
                      </div>
                    )}
                    <HealthCheckCard
                      metric={{
                        label:      patientLabelForMetric(metric),
                        value:      metric.id === 'ldl' ? cholesterolPrimaryValue(metric) : metric.value,
                        unit:       metric.id === 'ldl' ? 'mmol/L' : metric.unit,
                        badge:      patientBadgeForSeverity(metric.badgeClass),
                        badgeClass: metric.badgeClass,
                        whatTitle:  metric.whatTitle,
                        what:       metric.what,
                        pathway:    metric.pathway,
                        breakdown:  cholBreakdown,
                        oneLiner:   metric.id === 'ldl'
                          ? 'HDL is often called "good" cholesterol and LDL "bad" cholesterol. Together with your total cholesterol, they help assess your heart and stroke risk.'
                          : undefined,
                      }}
                      resultsMessage={variant?.resultsMessage || metric.pathway}
                      importantText={variant?.importantText || ''}
                      nextStepsTitle={variant?.nextStepsTitle}
                      nextStepsText={variant?.nextStepsText}
                      links={[
                        ...((variant?.links || []).filter((link) => (link.title || '').trim() && ((link.phone || '').trim() || (link.email || '').trim() || (link.website || '').trim()))),
                        ...(!(variant?.links || []).length ? (metric.helpLinks || []).map((link) => ({
                          title: link.title,
                          showTitleOnCard: true,
                          website: link.url,
                          websiteLabel: 'Read',
                        })) : []),
                        ...(localSupportLink ? [localSupportLink] : []),
                      ]}
                      expanded={expandedCards[metric.id] ?? false}
                      onExpandedChange={(next) => setExpandedCards((cur) => ({ ...cur, [metric.id]: next }))}
                      collapsedPrompt={
                        metric.badgeClass === 'red'   ? 'Tap for details' :
                        metric.badgeClass === 'amber' ? 'Tap to see what to do' :
                        'Looking good — tap for details'
                      }
                    />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {!previewOnly && (
        <div className="hc-actions no-print">
          <h2 className="hc-actions__title">Save or print</h2>
          <div className="hc-actions__row">
            <button
              type="button"
              className="hc-action-card hc-action-card--primary"
              onClick={() => void handleSavePdf()}
              aria-label="Save health check results as a PDF"
            >
              <span className="hc-action-card__icon"><Printer size={22} /></span>
              <span className="hc-action-card__text">{isSavingPdf ? 'Saving PDF...' : 'Save page as PDF'}</span>
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}

      <PatientSupportFooter text={org || 'Nottingham West Primary Care Network'} />

    </div>
  );
};

export default HealthCheckView;
