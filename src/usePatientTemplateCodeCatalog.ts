import { useEffect, useState } from 'react';
import { fetchCardTemplates } from './cardTemplateStore';
import { fetchPatientPracticeCardTemplates } from './practiceCardTemplateStore';
import {
  hydrateScreeningTemplate,
  type ImmunisationTemplate,
  type LongTermConditionTemplate,
  type ScreeningTemplate,
  withImmunisationTemplateDefaults,
  withLongTermConditionTemplateDefaults,
} from './patientTemplateCatalog';

export type PatientTemplateCodeCatalog = {
  screeningTemplates: ScreeningTemplate[];
  immunisationTemplates: ImmunisationTemplate[];
  longTermConditionTemplates: LongTermConditionTemplate[];
};

const emptyCatalog: PatientTemplateCodeCatalog = {
  screeningTemplates: [],
  immunisationTemplates: [],
  longTermConditionTemplates: [],
};

export function usePatientTemplateCodeCatalog(practiceIdentifier: string) {
  const [catalog, setCatalog] = useState<PatientTemplateCodeCatalog>(emptyCatalog);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [
          globalScreeningRows,
          globalImmunisationRows,
          globalLtcRows,
          practiceScreeningRows,
          practiceImmunisationRows,
          practiceLtcRows,
        ] = await Promise.all([
          fetchCardTemplates<ScreeningTemplate>('screening'),
          fetchCardTemplates<ImmunisationTemplate>('immunisation'),
          fetchCardTemplates<LongTermConditionTemplate>('ltc'),
          practiceIdentifier
            ? fetchPatientPracticeCardTemplates<ScreeningTemplate>(practiceIdentifier, 'screening')
            : Promise.resolve([]),
          practiceIdentifier
            ? fetchPatientPracticeCardTemplates<ImmunisationTemplate>(practiceIdentifier, 'immunisation')
            : Promise.resolve([]),
          practiceIdentifier
            ? fetchPatientPracticeCardTemplates<LongTermConditionTemplate>(practiceIdentifier, 'ltc')
            : Promise.resolve([]),
        ]);

        if (cancelled) return;

        setCatalog({
          screeningTemplates: [
            ...globalScreeningRows.map((row) => hydrateScreeningTemplate(row.payload)),
            ...practiceScreeningRows.map((row) => hydrateScreeningTemplate(row.payload)),
          ],
          immunisationTemplates: [
            ...globalImmunisationRows.map((row) => withImmunisationTemplateDefaults(row.payload)),
            ...practiceImmunisationRows.map((row) => withImmunisationTemplateDefaults(row.payload)),
          ],
          longTermConditionTemplates: [
            ...globalLtcRows.map((row) => withLongTermConditionTemplateDefaults(row.payload)),
            ...practiceLtcRows.map((row) => withLongTermConditionTemplateDefaults(row.payload)),
          ],
        });
      } catch (error) {
        console.error('Failed to load patient template code catalog', error);
        if (!cancelled) {
          setCatalog(emptyCatalog);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [practiceIdentifier]);

  return { catalog, loading };
}
