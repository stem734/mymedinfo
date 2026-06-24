import {
  IMMUNISATION_TEMPLATES,
  LONG_TERM_CONDITION_TEMPLATES,
  SCREENING_TEMPLATES,
  findImmunisationTemplateByIdentifier,
  findLongTermConditionTemplateByIdentifier,
  findScreeningTemplateByIdentifier,
  withImmunisationTemplateDefaults,
  withLongTermConditionTemplateDefaults,
  withScreeningTemplateDefaults,
} from './patientTemplateCatalog';

const screeningTemplates = Object.values(SCREENING_TEMPLATES).map(withScreeningTemplateDefaults);
const immunisationTemplates = Object.values(IMMUNISATION_TEMPLATES).map(withImmunisationTemplateDefaults);
const longTermConditionTemplates = Object.values(LONG_TERM_CONDITION_TEMPLATES).map(withLongTermConditionTemplateDefaults);

export type ParsedPatientLinkCodes = {
  medicationCodes: string[];
  screeningIdentifiers: string[];
  immunisationIdentifiers: string[];
  longTermConditionIdentifiers: string[];
  unknownIdentifiers: string[];
};

const stripLinkCodeSuffix = (token: string) => token.split('@')[0]?.trim() || '';

export const splitPatientLinkCodes = (codesParam: string): string[] =>
  codesParam
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const parsePatientLinkCodes = (codesParam: string): ParsedPatientLinkCodes => {
  const result: ParsedPatientLinkCodes = {
    medicationCodes: [],
    screeningIdentifiers: [],
    immunisationIdentifiers: [],
    longTermConditionIdentifiers: [],
    unknownIdentifiers: [],
  };

  splitPatientLinkCodes(codesParam).forEach((rawToken) => {
    const token = stripLinkCodeSuffix(rawToken);
    if (!token) {
      return;
    }

    if (/^\d{3}$/.test(token)) {
      result.medicationCodes.push(token);
      return;
    }

    if (findScreeningTemplateByIdentifier(token, screeningTemplates)) {
      result.screeningIdentifiers.push(token);
      return;
    }

    if (findImmunisationTemplateByIdentifier(token, immunisationTemplates)) {
      result.immunisationIdentifiers.push(token);
      return;
    }

    if (findLongTermConditionTemplateByIdentifier(token, longTermConditionTemplates)) {
      result.longTermConditionIdentifiers.push(token);
      return;
    }

    // Immunisation templates are editor-driven, so new codes may exist in
    // stored templates before the client bundle knows about them. Keep any
    // letter-based code for later template resolution instead of dropping it.
    if (/^(?=.*[a-z])[a-z0-9]+$/i.test(token)) {
      result.immunisationIdentifiers.push(token);
      return;
    }

    result.unknownIdentifiers.push(rawToken);
  });

  return result;
};
