import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { resolvePath } from '../subdomainUtils';

type PlatformConfig = {
  service_medication_enabled: boolean;
  service_healthcheck_enabled: boolean;
  service_screening_enabled: boolean;
  service_immunisation_enabled: boolean;
  service_ltc_enabled: boolean;
};

const normaliseAuthError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('invalid login credentials')) {
    return 'Invalid email or password';
  }

  if (message.includes('email not confirmed')) {
    return 'Your account email is not confirmed yet. Please use the invite link from your administrator.';
  }

  return 'Unable to sign in right now. Please try again in a moment.';
};

const PracticeLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from('platform_config').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (data) setPlatformConfig(data as PlatformConfig);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled && session?.user) {
        navigate(resolvePath('/practice/dashboard'), { replace: true });
      }
    };

    void hydrate();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        navigate(resolvePath('/practice/dashboard'), { replace: true });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) throw signInError;

      try {
        await supabase.functions.invoke('record-login-audit', {
          body: { portal: 'practice', userAgent: navigator.userAgent },
        });
      } catch (auditError) {
        console.warn('Login audit failed:', auditError);
      }
      navigate(resolvePath('/practice/dashboard'));
    } catch (authError) {
      console.error('Practice sign-in failed:', authError);
      setError(normaliseAuthError(authError));
    }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError('Enter your email address first');
      return;
    }
    try {
      const { error: resetError } = await supabase.functions.invoke('send-password-reset', {
        body: { email: email.trim().toLowerCase(), portal: 'practice' },
      });
      if (resetError) throw resetError;
      setResetSent(true);
      setError('');
    } catch {
      setError('Unable to send reset email. Please try again.');
    }
  };

  return (
    <div className="practice-login-split">
      {/* Left: brand panel */}
      <div className="practice-login-brand">
        <div className="practice-login-brand__logo">
          MyMed<span>Info</span>
        </div>
        <h1 className="practice-login-brand__headline">
          Your Practice Workspace
        </h1>
        <p className="practice-login-brand__sub">
          Sign in to access your practice's clinical content and patient-facing materials.
        </p>
        <div className="practice-login-brand__features">
          {(!platformConfig || platformConfig.service_medication_enabled) && (
            <div className="practice-login-brand__feat">
              <span className="practice-login-brand__dot" />
              Your practice medication card library
            </div>
          )}
          {(!platformConfig || platformConfig.service_healthcheck_enabled || platformConfig.service_screening_enabled) && (
            <div className="practice-login-brand__feat">
              <span className="practice-login-brand__dot" />
              Patient health check &amp; screening content
            </div>
          )}
          {(!platformConfig || platformConfig.service_immunisation_enabled || platformConfig.service_ltc_enabled) && (
            <div className="practice-login-brand__feat">
              <span className="practice-login-brand__dot" />
              Immunisation &amp; LTC care pathway resources
            </div>
          )}
          <div className="practice-login-brand__feat">
            <span className="practice-login-brand__dot" />
            Practice settings &amp; team management
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
          <h2 className="practice-login-form__title">Sign in</h2>
          <p className="practice-login-form__sub">Access your practice workspace</p>

          {error && (
            <div className="practice-login-form__alert practice-login-form__alert--error" role="alert">
              {error}
            </div>
          )}
          {resetSent && (
            <div className="practice-login-form__alert practice-login-form__alert--success" role="status">
              If an account exists for that email, a reset link has been sent. Check your inbox.
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="practice-login-form__group">
              <label className="practice-login-form__label" htmlFor="pl-email">
                Email address
              </label>
              <input
                id="pl-email"
                className="practice-login-form__input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="practice-login-form__group">
              <label className="practice-login-form__label" htmlFor="pl-password">
                Password
              </label>
              <input
                id="pl-password"
                className="practice-login-form__input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <button
              type="button"
              className="practice-login-form__forgot"
              onClick={handleResetPassword}
            >
              Forgot password?
            </button>
            <button
              type="submit"
              className="practice-login-form__submit"
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="practice-login-form__footer">
            NHS-hosted · Data processed in UK · SOC 2 compliant
            <br />
            For account issues contact your PCN administrator
          </div>
        </div>
      </div>
    </div>
  );
};

export default PracticeLogin;
