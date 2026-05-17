import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, ShieldCheck, ExternalLink, AlertCircle } from 'lucide-react';
import {
  LONG_TERM_CONDITION_TEMPLATES,
  findLongTermConditionTemplateByIdentifier,
  type LongTermConditionTemplate,
  withLongTermConditionTemplateDefaults,
} from '../patientTemplateCatalog';
import { fetchCardTemplates } from '../cardTemplateStore';
import { fetchPatientPracticeCardTemplates } from '../practiceCardTemplateStore';
import PatientSupportFooter from '../components/PatientSupportFooter';
import WarningCallout from '../components/WarningCallout';
import { usePracticeContentAccess } from '../usePracticeContentAccess';
import { getPracticeLookupFromSearchParams } from '../practiceLookup';
import { getExpiryDate, isUrlExpired, parseSystmOneTimestamp } from '../dateHelpers';
import { getVideoEmbedUrl } from '../videoEmbed';

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

const LongTermConditionView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const practiceLookup = getPracticeLookupFromSearchParams(searchParams);
  const org = practiceLookup.orgName;
  const practiceIdentifier = practiceLookup.lookupValue;
  const codesParam = (searchParams.get('codes') || '').trim();
  const isDemoMode = searchParams.get('demo') === '1';
  const conditionType = (searchParams.get('ltc') || searchParams.get('condition') || codesParam).trim().toLowerCase();
  const issuedAt = useMemo(() => parseSystmOneTimestamp(searchParams.get('codes')), [searchParams]);
  const [loadedTemplate, setLoadedTemplate] = useState<LongTermConditionTemplate | null>(null);
  const access = usePracticeContentAccess(practiceIdentifier, 'ltc_enabled', { skip: isDemoMode });
  const selectedTemplate = loadedTemplate;
  const videoEmbedUrl = getVideoEmbedUrl(selectedTemplate?.videoUrl);
  const validUntil = useMemo(
    () => formatValidUntil(issuedAt, selectedTemplate?.linkExpiryValue, selectedTemplate?.linkExpiryUnit),
    [issuedAt, selectedTemplate],
  );
  const isExpired = useMemo(
    () => Boolean(
      issuedAt &&
      selectedTemplate?.linkExpiryValue &&
      selectedTemplate?.linkExpiryUnit &&
      isUrlExpired(issuedAt, selectedTemplate.linkExpiryValue, selectedTemplate.linkExpiryUnit),
    ),
    [issuedAt, selectedTemplate],
  );

  useEffect(() => {
    const loadTemplate = async () => {
      try {
        const identifier = conditionType || 'asthma';
        const builtInIds = Object.keys(LONG_TERM_CONDITION_TEMPLATES);
        const practiceRows = practiceIdentifier
          ? await fetchPatientPracticeCardTemplates<LongTermConditionTemplate>(practiceIdentifier, 'ltc', builtInIds)
          : [];
        const rows = await fetchCardTemplates<LongTermConditionTemplate>('ltc');
        const candidates = [
          ...Object.values(LONG_TERM_CONDITION_TEMPLATES).map(withLongTermConditionTemplateDefaults),
          ...rows.map((row) => withLongTermConditionTemplateDefaults(row.payload)),
          ...practiceRows.map((row) => withLongTermConditionTemplateDefaults(row.payload)),
        ];
        setLoadedTemplate(findLongTermConditionTemplateByIdentifier(identifier, candidates));
      } catch (error) {
        console.error('Failed to load long term condition template override', error);
        setLoadedTemplate(null);
      }
    };
    void loadTemplate();
  }, [conditionType, practiceIdentifier]);

  if (access.loading) {
    return (
      <div className="card patient-state-card" style={{ textAlign: 'center' }}>
        <ClipboardList size={64} color="#005eb8" style={{ marginBottom: '1rem' }} />
        <h1>Long Term Condition Information</h1>
        <p style={{ color: '#4c6272', maxWidth: '36rem', margin: '0 auto', lineHeight: 1.6 }}>
          Checking whether this practice has long term condition information enabled.
        </p>
      </div>
    );
  }

  if (!access.allowed) {
    return (
      <div className="card patient-state-card" style={{ textAlign: 'center' }}>
        <ShieldCheck size={64} color="#005eb8" style={{ marginBottom: '1rem' }} />
        <h1>Long Term Condition Information</h1>
        <p style={{ color: '#4c6272', maxWidth: '40rem', margin: '0 auto', lineHeight: 1.6 }}>
          {access.error || 'This practice has not enabled long term condition information yet.'}
        </p>
      </div>
    );
  }

  if (!selectedTemplate) {
    return (
      <div className="card patient-state-card" style={{ textAlign: 'center' }}>
        <ClipboardList size={64} color="#005eb8" style={{ marginBottom: '1rem' }} />
        <h1>Long Term Condition Information</h1>
        <p style={{ color: '#4c6272', maxWidth: '40rem', margin: '0 auto', lineHeight: 1.6 }}>
          We could not find a long term condition card for this link. Please contact your GP practice if this problem continues.
        </p>
      </div>
    );
  }

  return (
    <div className="animation-container patient-view">
      <h1 className="sr-only">Long term condition information</h1>
      <div className="patient-greeting-card" role="status" style={{ marginBottom: '1rem' }}>
        <div className="patient-greeting-icon"><ClipboardList size={20} /></div>
        <p className="patient-greeting-text">
          Hi, {org ? `${org} has` : 'your practice has'} sent you information about {selectedTemplate.label.toLowerCase()}.
        </p>
      </div>

      <div className="card patient-section-card">
        {isExpired && (
          <div className="out-of-date-banner" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#8a1538', fontSize: '0.95rem', backgroundColor: '#fbe3ea', padding: '0.85rem 1rem', borderRadius: '8px', border: '2px solid #8a1538', marginBottom: '1rem', fontWeight: 700 }}>
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <span>
              This information is more than {formatExpiryWindowLabel(selectedTemplate.linkExpiryValue, selectedTemplate.linkExpiryUnit)} old and may be out of date. If you have any queries please speak to your GP practice.
            </span>
          </div>
        )}
        <h2 className="patient-section-title">{selectedTemplate.label}</h2>
        <p className="patient-section-copy">{selectedTemplate.headline}</p>
        <p className="patient-section-copy patient-section-copy--formatted">{selectedTemplate.explanation}</p>

        {selectedTemplate.importantMessage && (
          <WarningCallout title="Important">
            <p className="patient-section-copy patient-section-copy--formatted" style={{ marginBottom: 0 }}>
              {selectedTemplate.importantMessage}
            </p>
          </WarningCallout>
        )}

        <div className="patient-info-section">
          <h3 style={{ marginBottom: '0.5rem' }}>What to do next</h3>
          <ul className="patient-info-list">
            {selectedTemplate.guidance.map((item, index) => (
              <li key={index} className="patient-info-item">
                <div className="patient-info-icon"><ShieldCheck size={18} color="#007f3b" /></div>
                <span className="patient-info-text">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {videoEmbedUrl && (
          <div className="patient-info-section">
            <h3 className="patient-section-title patient-section-title--small">{selectedTemplate.videoTitle || 'Video guidance'}</h3>
            <div style={{ aspectRatio: '16 / 9', width: '100%', overflow: 'hidden', borderRadius: '8px', border: '1px solid #d8dde0', background: '#000' }}>
              <iframe
                src={videoEmbedUrl}
                title={selectedTemplate.videoTitle || `${selectedTemplate.label} video guidance`}
                style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        )}
      </div>

      {selectedTemplate.zones && selectedTemplate.zones.length > 0 && (
        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #4c6272', marginBottom: '1rem' }}>
          <h3 className="patient-section-title patient-section-title--small" style={{ marginTop: 0, marginBottom: '0.75rem' }}>Asthma action plan zones</h3>
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            {selectedTemplate.zones.map((zone) => {
              const tone = zone.color === 'green'
                ? { border: '#007f3b', bg: '#f3f9f2', heading: '#005a2e' }
                : zone.color === 'amber'
                  ? { border: '#b27a00', bg: '#fff8e6', heading: '#8a5f00' }
                  : { border: '#d5281b', bg: '#fdecec', heading: '#9d1c12' };

              return (
                <div
                  key={zone.color}
                  style={{
                    border: `1px solid ${tone.border}`,
                    background: tone.bg,
                    borderRadius: '10px',
                    padding: '0.85rem 0.9rem',
                  }}
                >
                  <h4 style={{ margin: '0 0 0.5rem', color: tone.heading }}>{zone.title}</h4>
                  <p style={{ margin: '0 0 0.35rem', fontWeight: 700, color: '#1d2a33' }}>Signs</p>
                  <ul style={{ margin: '0 0 0.55rem 1rem', padding: 0, color: '#1d2a33' }}>
                    {zone.when.map((item, index) => (
                      <li key={index} style={{ marginBottom: '0.2rem' }}>{item}</li>
                    ))}
                  </ul>
                  <p style={{ margin: '0 0 0.35rem', fontWeight: 700, color: '#1d2a33' }}>Actions</p>
                  <ul style={{ margin: '0 0 0 1rem', padding: 0, color: '#1d2a33' }}>
                    {zone.actions.map((item, index) => (
                      <li key={index} style={{ marginBottom: '0.2rem' }}>{item}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedTemplate.additionalSections && selectedTemplate.additionalSections.length > 0 && (
        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #4c6272', marginBottom: '1rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Additional plan details</h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {selectedTemplate.additionalSections.map((section) => (
              <div key={section.title} style={{ border: '1px solid #d8dde0', background: '#f8fbfd', borderRadius: '10px', padding: '0.8rem 0.9rem' }}>
                <h4 style={{ margin: '0 0 0.45rem' }}>{section.title}</h4>
                <ul style={{ margin: '0 0 0 1rem', padding: 0, color: '#1d2a33' }}>
                  {section.points.map((item, index) => (
                    <li key={index} style={{ marginBottom: '0.2rem' }}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="patient-resources patient-section-divider" style={{ marginTop: 0 }}>
        <h2 className="patient-resources-heading">Further guidance</h2>
        <div className="patient-resource-list patient-resource-list--compact">
          {selectedTemplate.nhsLinks.map((link) => (
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

      <PatientSupportFooter text={org || 'Nottingham West Primary Care Network'} />
    </div>
  );
};

export default LongTermConditionView;
