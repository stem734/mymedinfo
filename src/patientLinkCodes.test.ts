import { describe, expect, it } from 'vitest';
import { parsePatientLinkCodes } from './patientLinkCodes';

describe('parsePatientLinkCodes', () => {
  it('splits mixed medication and screening identifiers from a shared codes param', () => {
    expect(parsePatientLinkCodes('102,101,302,201,CS1,BR1')).toEqual({
      medicationCodes: ['102', '101', '302', '201'],
      screeningIdentifiers: ['CS1', 'BR1'],
      immunisationIdentifiers: [],
      longTermConditionIdentifiers: [],
      unknownIdentifiers: [],
    });
  });

  it('recognises immunisation and long term condition identifiers', () => {
    // Unrecognised letter-based tokens (UNKNOWN) are intentionally routed to
    // immunisationIdentifiers so editor-defined codes can resolve against
    // fetched template data later; only non-letter tokens fall through to
    // unknownIdentifiers.
    expect(parsePatientLinkCodes('IM1,LC1,UNKNOWN')).toEqual({
      medicationCodes: [],
      screeningIdentifiers: [],
      immunisationIdentifiers: ['IM1', 'UNKNOWN'],
      longTermConditionIdentifiers: ['LC1'],
      unknownIdentifiers: [],
    });
  });

  it('keeps editor-defined immunisation codes so fetched templates can resolve them later', () => {
    expect(parsePatientLinkCodes('PN1,RSV1,SHINGOA')).toEqual({
      medicationCodes: [],
      screeningIdentifiers: [],
      immunisationIdentifiers: ['PN1', 'RSV1', 'SHINGOA'],
      longTermConditionIdentifiers: [],
      unknownIdentifiers: [],
    });
  });

  it('strips appended timestamp placeholders from the final code token', () => {
    expect(parsePatientLinkCodes('CS1,PN1@URLDT')).toEqual({
      medicationCodes: [],
      screeningIdentifiers: ['CS1'],
      immunisationIdentifiers: ['PN1'],
      longTermConditionIdentifiers: [],
      unknownIdentifiers: [],
    });
  });
});
