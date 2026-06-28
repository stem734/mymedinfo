import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ShieldCheck, ExternalLink, AlertCircle } from 'lucide-react';
import {
  findScreeningTemplateByIdentifier,
  hydrateScreeningTemplate,
  type ScreeningTemplate,
  withScreeningTemplateDefaults,
} from '../patientTemplateCatalog';
import { fetchCardTemplates } from '../cardTemplateStore';
import { fetchPatientPracticeCardTemplates } from '../practiceCardTemplateStore';
import { usePracticeContentAccess } from '../usePracticeContentAccess';
import { NhsCross, NhsTick } from '../components/NhsIcons';
import PatientSupportFooter from '../components/PatientSupportFooter';
import WarningCallout from '../components/WarningCallout';
import { getPracticeLookupFromSearchParams } from '../practiceLookup';
import { isUrlExpired, parseSystmOneTimestamp } from '../dateHelpers';
import { getVideoEmbedUrl } from '../videoEmbed';
import { interpolatePracticeTemplateVariables } from '../practiceTemplateVariables';
import { safeHttpHref } from '../safeHref';

/**
 * ScreeningView — renders screening invitation / result info.
 *
 * Expected params:
 *   ?type=screening&org=PracticeName&screen=cervical
 *   ?type=screening&org=PracticeName&screen=bowel
 *
 * Supported screening types (extend as needed):
 *   cervical | bowel | breast | aaa | diabetic_eye
 */
const ScreeningView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const practiceLookup = getPracticeLookupFromSearchParams(searchParams);
  const org = practiceLookup.orgName;
  const practiceIdentifier = practiceLookup.lookupValue;
  const codesParam = (searchParams.get('codes') || '').trim();
  const isDemoMode = searchParams.get('demo') === '1';
  const previewOnly = searchParams.get('previewOnly') === '1';
  const previewToken = (searchParams.get('previewToken') || '').trim();
  const screenIdentifier = (
    searchParams.get('screen') ||
    searchParams.get('screening') ||
    codesParam
  ).trim();
  const [loadedTemplate, setLoadedTemplate] = useState<ScreeningTemplate | null>(null);
  const access = usePracticeContentAccess(practiceIdentifier, 'screening_enabled', { skip: isDemoMode || previewOnly });
  const practicePhone = access.details?.contactPhone || '';
  const selectedTemplate = loadedTemplate;
  const videoEmbedUrl = getVideoEmbedUrl(selectedTemplate?.videoUrl);
  const issuedAt = useMemo(() => parseSystmOneTimestamp(searchParams.get('codes')), [searchParams]);

  useEffect(() => {
    const loadTemplate = async () => {
      if (isDemoMode) {
        // Demo mode still uses the saved global template when one exists.
      }

      if (previewOnly && previewToken && typeof window !== 'undefined') {
        try {
          const raw = window.sessionStorage.getItem(previewToken);
          if (raw) {
            setLoadedTemplate(
              withScreeningTemplateDefaults(
                interpolatePracticeTemplateVariables(JSON.parse(raw) as ScreeningTemplate, { practicePhone }),
              ),
            );
            return;
          }
        } catch {
          // ignore malformed preview payloads and fall back to stored templates
        }
      }

      try {
        const practiceRows = practiceIdentifier
          ? await fetchPatientPracticeCardTemplates<ScreeningTemplate>(practiceIdentifier, 'screening')
          : [];
        const globalRows = await fetchCardTemplates<ScreeningTemplate>('screening');
        const candidateTemplates = [
          ...practiceRows.map((row) => hydrateScreeningTemplate(interpolatePracticeTemplateVariables(row.payload, { practicePhone }))),
          ...globalRows.map((row) => hydrateScreeningTemplate(interpolatePracticeTemplateVariables(row.payload, { practicePhone }))),
        ];
        setLoadedTemplate(findScreeningTemplateByIdentifier(screenIdentifier, candidateTemplates));
      } catch (error) {
        console.error('Failed to load screening template override', error);
        setLoadedTemplate(null);
      }
    };
    void loadTemplate();
  }, [isDemoMode, practiceIdentifier, practicePhone, previewOnly, previewToken, screenIdentifier]);

  if (access.loading) {
    return (
      <div className="card patient-state-card" style={{ textAlign: 'center' }}>
        <Search size={64} color="#005eb8" style={{ marginBottom: '1rem' }} />
        <h1>Screening Information</h1>
        <p style={{ color: '#4c6272', maxWidth: '36rem', margin: '0 auto', lineHeight: 1.6 }}>
          Checking whether this practice has screening information enabled.
        </p>
      </div>
    );
  }

  if (!access.allowed) {
    return (
      <div className="card patient-state-card" style={{ textAlign: 'center' }}>
        <ShieldCheck size={64} color="#005eb8" style={{ marginBottom: '1rem' }} />
        <h1>Screening Information</h1>
        <p style={{ color: '#4c6272', maxWidth: '40rem', margin: '0 auto', lineHeight: 1.6 }}>
          {access.error || 'This practice has not enabled screening information yet.'}
        </p>
      </div>
    );
  }

  if (!selectedTemplate) {
    return (
      <div className="card patient-state-card" style={{ textAlign: 'center' }}>
        <Search size={64} color="#005eb8" style={{ marginBottom: '1rem' }} />
        <h1>Screening Information</h1>
        <p style={{ color: '#4c6272', maxWidth: '40rem', margin: '0 auto', lineHeight: 1.6 }}>
          We could not find a screening card for this link. Please contact your GP practice if this problem continues.
        </p>
      </div>
    );
  }

  return (
    <div className="animation-container patient-view">
      <h1 className="sr-only">Screening information</h1>
      <div className="patient-greeting-card" role="status" style={{ marginBottom: '1rem' }}>
        <div className="patient-greeting-icon"><Search size={20} /></div>
        <p className="patient-greeting-text">
          Hi, {org ? `${org} has` : 'your practice has'} sent
          you information about {selectedTemplate.label.toLowerCase()}.
        </p>
      </div>

      <div className="card patient-section-card">
        {issuedAt && selectedTemplate.linkExpiryValue && selectedTemplate.linkExpiryUnit && isUrlExpired(issuedAt, selectedTemplate.linkExpiryValue, selectedTemplate.linkExpiryUnit) && (
          <div className="out-of-date-banner" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#8a1538', fontSize: '0.95rem', backgroundColor: '#fbe3ea', padding: '0.85rem 1rem', borderRadius: '8px', border: '2px solid #8a1538', marginBottom: '1rem', fontWeight: 700 }}>
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <span>
              This information is more than {selectedTemplate.linkExpiryValue} {selectedTemplate.linkExpiryValue === 1 ? selectedTemplate.linkExpiryUnit.replace(/s$/, '') : selectedTemplate.linkExpiryUnit} old and may be out of date. If you have any queries please speak to your GP practice.
            </span>
          </div>
        )}
        <h2 className="patient-section-title">{selectedTemplate.label}</h2>
        <p className="patient-section-copy">{selectedTemplate.headline}</p>

        <div className="patient-info-section">
          <h3 className="patient-section-title patient-section-title--small">Guidance</h3>
          <p className="patient-section-copy patient-section-copy--formatted" style={{ marginBottom: 0 }}>{selectedTemplate.explanation}</p>
        </div>

        {selectedTemplate.importantMessage && (
          <WarningCallout title="Important">
            <p className="patient-section-copy patient-section-copy--formatted" style={{ marginBottom: 0 }}>
              {selectedTemplate.importantMessage}
            </p>
          </WarningCallout>
        )}

        <div className="patient-info-section">
          <h3 className="patient-section-title patient-section-title--small">Do</h3>
          <ul className="patient-info-list">
            {selectedTemplate.guidance.map((item, index) => (
              <li key={index} className="patient-info-item">
                <div className="patient-info-icon"><NhsTick size={22} aria-hidden="true" /></div>
                <span className="patient-info-text">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {selectedTemplate.dontGuidance && selectedTemplate.dontGuidance.length > 0 && (
          <div className="patient-info-section">
            <h3 className="patient-section-title patient-section-title--small">Don&apos;t</h3>
            <ul className="patient-info-list">
              {selectedTemplate.dontGuidance.map((item, index) => (
                <li key={index} className="patient-info-item">
                  <div className="patient-info-icon"><NhsCross size={22} aria-hidden="true" /></div>
                  <span className="patient-info-text">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

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

      <div className="patient-resources patient-section-divider" style={{ marginTop: 0 }}>
        <h2 className="patient-resources-heading">Further guidance</h2>
        <div className="patient-resource-list patient-resource-list--compact">
          {selectedTemplate.nhsLinks.map((link) => (
            <a
              key={link.url}
              href={safeHttpHref(link.url)}
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

export default ScreeningView;
