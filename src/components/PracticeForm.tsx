import React from 'react';
import { validatePracticeContactEmail } from '../practiceValidation';

type PracticeFormValues = {
  name: string;
  odsCode: string;
  contactName: string;
  contactEmail: string;
};

type PracticeFormProps = {
  values: PracticeFormValues;
  error: string;
  loading: boolean;
  submitLabel: string;
  onSubmit: (event: React.FormEvent) => void;
  onChange: (field: keyof PracticeFormValues, value: string) => void;
  showContactName?: boolean;
  showImportantNotice?: boolean;
  contactNameRequired?: boolean;
};

const PracticeForm: React.FC<PracticeFormProps> = ({
  values,
  error,
  loading,
  submitLabel,
  onSubmit,
  onChange,
  showContactName = true,
  showImportantNotice = true,
  contactNameRequired = true,
}) => {
  const emailError = validatePracticeContactEmail(values.contactEmail);
  const contactLabel = contactNameRequired ? 'Contact Name *' : 'Contact Name';

  return (
    <form onSubmit={onSubmit} className="practice-form">
      <div className="form-field">
        <label htmlFor="practice-name">Organisation Name *</label>
        <p id="practice-name-help" className="form-field__help">Enter the exact name as it appears in SystmOne</p>
        <input
          id="practice-name"
          type="text"
          value={values.name}
          onChange={(event) => onChange('name', event.target.value)}
          required
          placeholder="e.g. Riverside Medical Centre"
          aria-describedby="practice-name-help"
        />
      </div>

      <div className="practice-form__grid">
        <div className="form-field">
          <label htmlFor="practice-ods">ODS Code *</label>
          <input
            id="practice-ods"
            type="text"
            value={values.odsCode}
            onChange={(event) => onChange('odsCode', event.target.value)}
            required
            placeholder="e.g. C84001"
          />
        </div>
        {showContactName && (
          <div className="form-field">
            <label htmlFor="practice-contact-name">{contactLabel}</label>
            <input
              id="practice-contact-name"
              type="text"
              value={values.contactName}
              onChange={(event) => onChange('contactName', event.target.value)}
              required={contactNameRequired}
              placeholder="e.g. Dr Sarah Jones"
            />
          </div>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="practice-contact-email">Contact Email *</label>
        <input
          id="practice-contact-email"
          type="email"
          value={values.contactEmail}
          onChange={(event) => onChange('contactEmail', event.target.value)}
          required
          placeholder="e.g. sarah.jones@nhs.net"
          aria-describedby={!emailError ? "practice-contact-email-help" : undefined}
        />
        {!emailError && (
          <p id="practice-contact-email-help" className="form-field__help">
            We will use this address for application updates.
          </p>
        )}
      </div>

      {showImportantNotice && (
        <div className="form-callout" role="note">
          <strong>Important:</strong> The Organisation Name must match exactly what appears in SystmOne.
          This is how the system identifies your practice when patients access medication information.
        </div>
      )}

      {error && <div className="form-banner form-banner--error" role="alert">{error}</div>}

      <button type="submit" disabled={loading} className="action-button action-button--full">
        {loading ? 'Submitting...' : submitLabel}
      </button>
    </form>
  );
};

export default PracticeForm;
