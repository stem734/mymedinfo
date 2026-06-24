import { useEffect, useState } from 'react';
import { validateOrganisation, type PracticePublicDetails } from './protocolService';
import { PRACTICE_FEATURE_METADATA, type PracticeFeatureKey } from './practiceFeatures';

type PracticeContentAccessState = {
  loading: boolean;
  allowed: boolean;
  error: string;
  details: PracticePublicDetails | null;
};

export function usePracticeContentAccess(
  orgName: string,
  featureKey: PracticeFeatureKey,
  options?: { skip?: boolean },
): PracticeContentAccessState {
  const skip = options?.skip === true;
  const trimmedOrgName = orgName.trim();
  const [state, setState] = useState<PracticeContentAccessState>({ loading: false, allowed: true, error: '', details: null });

  useEffect(() => {
    if (skip || !trimmedOrgName) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setState({ loading: true, allowed: false, error: '', details: null });
      const result = await validateOrganisation(trimmedOrgName);
      if (cancelled) return;

      if (!result.valid) {
        setState({
          loading: false,
          allowed: false,
          error: result.error || 'This practice is not registered with MyMedInfo.',
          details: null,
        });
        return;
      }

      if (!result.practiceFeatures[featureKey]) {
        setState({
          loading: false,
          allowed: false,
          error: `${PRACTICE_FEATURE_METADATA[featureKey].label} are not enabled for this practice yet.`,
          details: result.practiceDetails,
        });
        return;
      }

      setState({ loading: false, allowed: true, error: '', details: result.practiceDetails });
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [featureKey, skip, trimmedOrgName]);

  if (skip || !trimmedOrgName) {
    return { loading: false, allowed: true, error: '', details: null };
  }

  return state;
}
