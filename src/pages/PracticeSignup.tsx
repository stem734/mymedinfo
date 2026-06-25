import React, { useState } from 'react';
import { supabase } from '../supabase';
import { CheckCircle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PracticeForm from '../components/PracticeForm';
import { validatePracticeContactEmail } from '../practiceValidation';
import { getFunctionErrorMessage } from '../supabaseFunctionError';
import { resolvePath } from '../subdomainUtils';

const PracticeSignup: React.FC = () => {
  const [name, setName] = useState('');
  const [odsCode, setOdsCode] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const emailError = validatePracticeContactEmail(contactEmail);
    if (emailError) {
      setError(emailError);
      setLoading(false);
      return;
    }

    if (!contactPhone.trim()) {
      setError('Patient-facing phone number is required');
      setLoading(false);
      return;
    }

    try {
      const { data, error: signupError } = await supabase.functions.invoke('submit-practice-signup', {
        body: {
          name: name.trim(),
          odsCode: odsCode.trim().toUpperCase(),
          contactEmail: contactEmail.trim().toLowerCase(),
          contactName: contactName.trim(),
          contactPhone: contactPhone.trim(),
        },
      });
      if (signupError) throw signupError;
      if (data?.success === false) {
        throw new Error(data.error || 'Registration was not submitted');
      }

      setSubmitted(true);
    } catch (err) {
      console.error('Signup error:', err);
      setError(await getFunctionErrorMessage(err, 'There was a problem submitting your registration. Please try again.'));
    }
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="practice-login-split">
        {/* Left: success branding */}
        <div className="practice-login-brand">
          <div className="practice-login-brand__logo">
            MyMed<span>Info</span>
          </div>
          <h1 className="practice-login-brand__headline">
            Registration Submitted
          </h1>
          <p className="practice-login-brand__sub">
            Thank you for joining MyMedInfo. Your application is now under review.
          </p>
          <div style={{ paddingTop: '2rem' }}>
            <div style={{ padding: '1.25rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 0.75rem 0', fontWeight: 600, color: '#22c55e' }}>What happens next:</p>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.95rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.85)' }}>
                <li>We review your practice details</li>
                <li>You'll receive confirmation at <strong>{contactEmail}</strong></li>
                <li>Access your workspace immediately upon approval</li>
              </ul>
            </div>
          </div>
          <p className="practice-login-brand__pcn">
            Nottingham West Primary Care Network · NHS GP Practice Portal
          </p>
        </div>

        {/* Right: confirmation message */}
        <div className="practice-login-form-panel">
          <div className="practice-login-form-inner">
            <div style={{ textAlign: 'center', paddingTop: '2rem' }}>
              <CheckCircle size={64} style={{ color: '#22c55e', marginBottom: '1.5rem' }} />
              <h2 className="practice-login-form__title">Registration Confirmed</h2>
              <p className="practice-login-form__sub" style={{ marginBottom: '2rem' }}>
                {name} has been registered
              </p>

              <div style={{ padding: '1.5rem', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '8px', marginBottom: '2rem', textAlign: 'left' }}>
                <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>Practice name:</span><br />
                  <strong>{name}</strong>
                </p>
                <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>Contact email:</span><br />
                  <strong>{contactEmail}</strong>
                </p>
              </div>

              <button
                onClick={() => navigate(resolvePath('/practice'))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  margin: '0 auto',
                  padding: '0.75rem 1.5rem',
                  background: 'var(--nhs-blue)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Return to Login <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="practice-login-split">
      {/* Left: brand panel */}
      <div className="practice-login-brand">
        <div className="practice-login-brand__logo">
          MyMed<span>Info</span>
        </div>
        <h1 className="practice-login-brand__headline">
          Register Your Practice
        </h1>
        <p className="practice-login-brand__sub">
          Join MyMedInfo and access clinical resources and patient-facing materials for your practice.
        </p>
        <div className="practice-login-brand__features">
          <div className="practice-login-brand__feat">
            <span className="practice-login-brand__dot" />
            Manage medication card library
          </div>
          <div className="practice-login-brand__feat">
            <span className="practice-login-brand__dot" />
            Control patient-facing content
          </div>
          <div className="practice-login-brand__feat">
            <span className="practice-login-brand__dot" />
            Monitor usage and patient feedback
          </div>
          <div className="practice-login-brand__feat">
            <span className="practice-login-brand__dot" />
            Manage team access and roles
          </div>
        </div>
        <p className="practice-login-brand__pcn">
          Nottingham West Primary Care Network · NHS GP Practice Portal
        </p>
      </div>

      {/* Right: form panel */}
      <div className="practice-login-form-panel">
        <div className="practice-login-form-inner">
          <p className="practice-login-form__eyebrow">Practice Portal</p>
          <h2 className="practice-login-form__title">Register Practice</h2>
          <p className="practice-login-form__sub">Create your MyMedInfo workspace</p>

          {error && (
            <div className="practice-login-form__alert practice-login-form__alert--error" role="alert">
              {error}
            </div>
          )}

          <PracticeForm
            values={{ name, odsCode, contactName, contactEmail, contactPhone }}
            error=""
            loading={loading}
            submitLabel="Register Practice"
            onSubmit={handleSubmit}
            onChange={(field, value) => {
              if (field === 'name') setName(value);
              if (field === 'odsCode') setOdsCode(value);
              if (field === 'contactName') setContactName(value);
              if (field === 'contactEmail') setContactEmail(value);
              if (field === 'contactPhone') setContactPhone(value);
            }}
            showContactName
            showContactPhone
            contactPhoneRequired
          />

          <div className="practice-login-form__footer" style={{ marginTop: '1.5rem' }}>
            Already registered? <button
              onClick={() => navigate(resolvePath('/practice'))}
              style={{ background: 'none', border: 'none', color: 'var(--nhs-blue)', cursor: 'pointer', textDecoration: 'underline', padding: 0, font: 'inherit' }}
            >
              Sign in here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PracticeSignup;
