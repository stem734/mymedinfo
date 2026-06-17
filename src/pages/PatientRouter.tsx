import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { detectContentType, CONTENT_TYPES } from '../contentRouter';
import { getPracticeLookupFromSearchParams } from '../practiceLookup';
import { parsePatientLinkCodes } from '../patientLinkCodes';

// All content views are lazy-loaded to keep patient routes split by content type.
const ResourceView = React.lazy(() => import('./ResourceView'));
const CombinedPatientView = React.lazy(() => import('./CombinedPatientView'));
const HealthCheckView = React.lazy(() => import('./HealthCheckView'));
const ScreeningView = React.lazy(() => import('./ScreeningView'));
const ImmunisationView = React.lazy(() => import('./ImmunisationView'));
const LongTermConditionView = React.lazy(() => import('./LongTermConditionView'));

/**
 * PatientRouter — detects the content type from URL params
 * and renders the appropriate view component.
 *
 * URL formats from SystmOne:
 *   ?type=meds&org=...&codes=101,201        → Medication info
 *   ?type=healthcheck&org=...&s1=CSV        → NHS Health Check
 *   ?type=screening&org=...&screen=cervical → Screening info
 *   ?type=imms&org=...&vaccine=flu          → Immunisation info
 *   ?org=...&codes=101,201                  → Auto-detect → meds
 */
const PatientRouter: React.FC = () => {
  const [searchParams] = useSearchParams();
  const practiceLookup = getPracticeLookupFromSearchParams(searchParams);
  const explicitType = (searchParams.get('type') || '').toLowerCase().trim();
  const codesParam = (searchParams.get('codes') || '').trim();
  const parsedCodes = useMemo(() => parsePatientLinkCodes(codesParam), [codesParam]);
  const hasMedicationParams = Boolean((searchParams.get('code') || searchParams.get('med') || '').trim()) || (
    parsedCodes.medicationCodes.length > 0 &&
    explicitType !== CONTENT_TYPES.SCREENING &&
    explicitType !== CONTENT_TYPES.IMMUNISATION &&
    explicitType !== CONTENT_TYPES.LONG_TERM_CONDITION
  );
  const hasScreeningParams = Boolean((searchParams.get('screen') || searchParams.get('screening') || '').trim()) || parsedCodes.screeningIdentifiers.length > 0;
  const hasHealthCheckParams = Boolean((searchParams.get('s1') || searchParams.get('s1csv') || searchParams.get('payload') || searchParams.get('hc') || '').trim());
  const hasImmunisationParams = Boolean((searchParams.get('vaccine') || searchParams.get('jab') || searchParams.get('imms') || '').trim()) || parsedCodes.immunisationIdentifiers.length > 0;
  const hasLtcParams = Boolean((searchParams.get('ltc') || searchParams.get('condition') || '').trim()) || parsedCodes.longTermConditionIdentifiers.length > 0;
  const mvpBundleParamCount = [hasMedicationParams, hasScreeningParams, hasImmunisationParams].filter(Boolean).length;
  const isCombinedBundle = mvpBundleParamCount > 1;

  const { contentType } = useMemo(
    () => detectContentType(searchParams),
    [searchParams],
  );

  const renderContent = () => {
    if (isCombinedBundle) {
      return <CombinedPatientView />;
    }

    // Prefer the actual dataset params over a stale/mistyped explicit `type=`.
    if (hasScreeningParams) {
      return <ScreeningView />;
    }
    if (hasHealthCheckParams) {
      return <HealthCheckView />;
    }
    if (hasImmunisationParams) {
      return <ImmunisationView />;
    }
    if (hasLtcParams) {
      return <LongTermConditionView />;
    }
    if (hasMedicationParams) {
      return <ResourceView />;
    }

    switch (contentType) {
      case CONTENT_TYPES.HEALTH_CHECK:
        return <HealthCheckView />;
      case CONTENT_TYPES.SCREENING:
        return <ScreeningView />;
      case CONTENT_TYPES.IMMUNISATION:
        return <ImmunisationView />;
      case CONTENT_TYPES.LONG_TERM_CONDITION:
        return <LongTermConditionView />;
      case CONTENT_TYPES.MEDICATION:
      case CONTENT_TYPES.UNKNOWN:
      default:
        return <ResourceView />;
    }
  };

  return (
    <React.Suspense fallback={
      <div className="card patient-state-card" style={{ textAlign: 'center' }}>
        <p style={{ marginTop: '1rem', color: '#4c6272' }}>Loading...</p>
      </div>
    }>
      <div className="patient-page-shell">
        <div className="patient-page-shell__brand no-print">
          <div className="patient-page-shell__brand-wordmark" aria-label="MyMedInfo">
            <span className="patient-page-shell__brand-wordmark-my">My</span>
            <span className="patient-page-shell__brand-wordmark-medinfo">MedInfo</span>
          </div>
          {practiceLookup.orgName && (
            <div className="patient-page-shell__brand-partner-block">
              <img className="patient-page-shell__brand-partner-logo" src="/nhs-wordmark-blue.jpg" alt="NHS" />
              <p className="patient-page-shell__brand-partner">
                Partnering with {practiceLookup.orgName}
              </p>
            </div>
          )}
        </div>
        {renderContent()}
      </div>
    </React.Suspense>
  );
};

export default PatientRouter;
