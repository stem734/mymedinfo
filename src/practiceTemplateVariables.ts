export type PracticeTemplateVariables = {
  practicePhone?: string | null;
};

const interpolateString = (value: string, variables: PracticeTemplateVariables) =>
  value.replaceAll('{{practice_phone}}', variables.practicePhone?.trim() || '');

export const interpolatePracticeTemplateVariables = <T>(value: T, variables: PracticeTemplateVariables): T => {
  if (typeof value === 'string') {
    return interpolateString(value, variables) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolatePracticeTemplateVariables(item, variables)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, interpolatePracticeTemplateVariables(entry, variables)]),
    ) as T;
  }

  return value;
};
