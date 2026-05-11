import { HEALTH_CHECK_CODE_VALUES } from './healthCheckCodes';
import { CLINICAL_DOMAIN_IDS, PREVIEW_DOMAIN_CONFIGS } from './healthCheckVariantConfig';
import { MEDICATIONS } from './medicationData';
import type { MedicationRecord } from './medicationCatalog';
import {
  IMMUNISATION_TEMPLATES,
  LONG_TERM_CONDITION_TEMPLATES,
  SCREENING_TEMPLATES,
  type ImmunisationTemplate,
  type LongTermConditionTemplate,
  type ScreeningTemplate,
  withImmunisationTemplateDefaults,
  withLongTermConditionTemplateDefaults,
  withScreeningTemplateDefaults,
} from './patientTemplateCatalog';

export type DemoSample = {
  id: string;
  category: 'Medication' | 'Health check' | 'Screening' | 'Immunisation' | 'Long term condition';
  title: string;
  description: string;
  practiceName: string;
  params: Record<string, string>;
};

export type DemoType = 'medication' | 'healthcheck' | 'screening' | 'immunisation' | 'ltc';

type DemoTemplateSources = {
  screeningTemplates?: ScreeningTemplate[];
  immunisationTemplates?: ImmunisationTemplate[];
  ltcTemplates?: LongTermConditionTemplate[];
};

const DEMO_PRACTICE_NAME = 'Demo GP Practice';

const pickOne = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const randomDecimal = (min: number, max: number, digits = 1) =>
  (Math.random() * (max - min) + min).toFixed(digits);

const buildMedicationDemoSamples = (medications: Array<Pick<MedicationRecord, 'code' | 'title' | 'category'>>) =>
  medications.map((medication) => ({
    id: `medication-${medication.code}`,
    category: 'Medication' as const,
    title: medication.title,
    description: medication.category,
    practiceName: DEMO_PRACTICE_NAME,
    params: {
      type: 'meds',
      codes: medication.code,
    },
  }));

const buildRandomHealthCheckParams = () => {
  const bpCode = pickOne(HEALTH_CHECK_CODE_VALUES.bp);
  const bmiCode = pickOne(HEALTH_CHECK_CODE_VALUES.bmi);
  const cvdCode = pickOne(HEALTH_CHECK_CODE_VALUES.cvd);
  const cholCode = pickOne(HEALTH_CHECK_CODE_VALUES.chol);
  const hba1cCode = pickOne(HEALTH_CHECK_CODE_VALUES.hba1c);
  const actCode = pickOne(HEALTH_CHECK_CODE_VALUES.act);
  const alcCode = pickOne(HEALTH_CHECK_CODE_VALUES.alc);
  const smkCode = pickOne(HEALTH_CHECK_CODE_VALUES.smk);

  const bpValue = bpCode === 'BPNORMAL' ? '124/78' : '156/96';
  const bmiValue = bmiCode === 'BMINORMAL' ? randomDecimal(21.2, 24.4) : bmiCode === 'BMI1' ? randomDecimal(25.1, 29.8) : bmiCode === 'BMI2' ? randomDecimal(30.1, 39.2) : randomDecimal(40.1, 46.5);
  const cvdValue = cvdCode === 'QRISKLOW' ? randomDecimal(4.2, 9.4) : randomDecimal(10.1, 24.8);
  const hba1cValue = hba1cCode === 'HBA1CNORMAL' ? randomDecimal(34, 41, 0) : hba1cCode === 'HBA1CNDH1' ? randomDecimal(42, 47, 0) : randomDecimal(48, 76, 0);
  const alcValue = alcCode === 'ALCRISKTEETOTAL' ? 'Teetotal' : alcCode === 'ALCRISKOK' ? '8' : alcCode === 'ALCRISKATRISK' ? '24' : '16';
  const smkValue = smkCode === 'SMOKNONSMOK' ? 'No' : smkCode === 'SMOKSTOPPED' ? 'Stopped' : 'Yes';
  const actValue = actCode === 'GPPAQACTIVE' ? 'Active' : actCode === 'GPPAQINACTIVE' ? 'Inactive' : actCode === 'GPPAQUNABLE' ? 'Unable' : 'Moderately active';
  const cholValue = cholCode === 'CHOLNORMAL' ? '4.6' : '5.8';
  const hdlValue = cholCode === 'CHOLNORMAL' ? '1.3' : '1.0';
  const ldlValue = cholCode === 'CHOLNORMAL' ? '2.7' : '3.7';

  return new URLSearchParams({
    type: 'healthcheck',
    demo: '1',
    hc: [
      `bp:${bpValue}:${bpCode}`,
      `bmi:${bmiValue}:${bmiCode}`,
      `cvd:${cvdValue}:${cvdCode}`,
      `ldl:${ldlValue}:${cholCode}`,
      `hba1c:${hba1cValue}:${hba1cCode}`,
      `act:${actValue}:${actCode}`,
      `alc:${alcValue}:${alcCode}`,
      `smk:${smkValue}:${smkCode}`,
    ].join(','),
    hdl: hdlValue,
    ldl: ldlValue,
    totchol: cholValue,
    cholrv: cholCode,
  });
};

export const buildDemoSamples = (
  medications: Array<Pick<MedicationRecord, 'code' | 'title' | 'category'>> = MEDICATIONS,
  sources: DemoTemplateSources = {},
): DemoSample[] => [
  ...buildMedicationDemoSamples(medications),
  ...CLINICAL_DOMAIN_IDS.map((domainId) => ({
    id: `healthcheck-${domainId}`,
    category: 'Health check' as const,
    title: PREVIEW_DOMAIN_CONFIGS[domainId].heading,
    description: PREVIEW_DOMAIN_CONFIGS[domainId].subheading,
    practiceName: DEMO_PRACTICE_NAME,
    params: {
      type: 'healthcheck',
    },
  })),
  ...(sources.screeningTemplates || Object.values(SCREENING_TEMPLATES)).map((sourceTemplate) => {
    const template = withScreeningTemplateDefaults(sourceTemplate);
    return ({
    id: `screening-${template.id}`,
    category: 'Screening' as const,
    title: template.label,
    description: template.headline,
    practiceName: DEMO_PRACTICE_NAME,
    params: {
      type: 'screening',
      screen: template.code,
    },
  });
  }),
  ...(sources.immunisationTemplates || Object.values(IMMUNISATION_TEMPLATES)).map((sourceTemplate) => {
    const template = withImmunisationTemplateDefaults(sourceTemplate);
    return ({
    id: `immunisation-${template.id}`,
    category: 'Immunisation' as const,
    title: template.label,
    description: template.headline,
    practiceName: DEMO_PRACTICE_NAME,
    params: {
      type: 'imms',
      vaccine: template.code || template.id,
    },
  });
  }),
  ...(sources.ltcTemplates || Object.values(LONG_TERM_CONDITION_TEMPLATES)).map((sourceTemplate) => {
    const template = withLongTermConditionTemplateDefaults(sourceTemplate);
    return ({
    id: `ltc-${template.id}`,
    category: 'Long term condition' as const,
    title: template.label,
    description: template.headline,
    practiceName: DEMO_PRACTICE_NAME,
    params: {
      type: 'ltc',
      ltc: template.code || template.id,
    },
  });
  }),
];

export const DEMO_SAMPLES: DemoSample[] = buildDemoSamples();

export const getRandomDemoSample = (): DemoSample => {
  const samples = buildDemoSamples();
  const index = Math.floor(Math.random() * samples.length);
  return samples[index];
};

export const getRandomDemoSampleForType = (type: DemoType): DemoSample => {
  const samples = buildDemoSamples();
  const filtered = samples.filter((sample) => {
    if (type === 'medication') return sample.category === 'Medication';
    if (type === 'healthcheck') return sample.category === 'Health check';
    if (type === 'screening') return sample.category === 'Screening';
    if (type === 'immunisation') return sample.category === 'Immunisation';
    return sample.category === 'Long term condition';
  });

  const index = Math.floor(Math.random() * filtered.length);
  return filtered[index] ?? samples[0];
};

export const buildDemoPatientUrl = (sample: DemoSample) => {
  const params = new URLSearchParams({
    org: sample.practiceName,
    demo: '1',
    exactDemo: '1',
    ...sample.params,
  });

  if (sample.category === 'Health check') {
    const healthCheckParams = buildRandomHealthCheckParams();
    healthCheckParams.forEach((value, key) => {
      params.set(key, value);
    });
  }

  return `/patient?${params.toString()}`;
};

export const buildDemoPatientUrlForType = (type: DemoType) =>
  buildDemoPatientUrl(getRandomDemoSampleForType(type));

export const getDemoNoticeText = () =>
  'This is dummy information only and should not be used for clinical decisions.';
