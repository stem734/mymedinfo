import { describe, expect, it } from 'vitest';
import { interpolatePracticeTemplateVariables } from './practiceTemplateVariables';

describe('interpolatePracticeTemplateVariables', () => {
  it('replaces practice phone placeholders in nested template data', () => {
    const value = {
      headline: 'Call us on {{practice_phone}}.',
      guidance: ['Ring {{practice_phone}} to book.'],
      nhsLinks: [{ title: 'Local support', description: 'Phone {{practice_phone}}', url: 'https://example.com' }],
    };

    expect(interpolatePracticeTemplateVariables(value, { practicePhone: '0115 123 4567' })).toEqual({
      headline: 'Call us on 0115 123 4567.',
      guidance: ['Ring 0115 123 4567 to book.'],
      nhsLinks: [{ title: 'Local support', description: 'Phone 0115 123 4567', url: 'https://example.com' }],
    });
  });

  it('falls back to an empty string when the practice phone is missing', () => {
    expect(interpolatePracticeTemplateVariables('Call {{practice_phone}}', { practicePhone: null })).toBe('Call ');
  });
});
