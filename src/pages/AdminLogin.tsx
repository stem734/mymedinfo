import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { resolvePath } from '../subdomainUtils';
import { getCurrentUserAdminRole } from '../adminAccess';

const normaliseAuthError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('invalid login credentials')) return 'Invalid email or password';
  if (message.includes('email not confirmed')) return 'Your account email is not confirmed.';
  return 'Unable to sign in right now. Please try again.';
};

const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled && session?.user) {
        const adminRole = await getCurrentUserAdminRole(session.user.id);
        if (!cancelled && adminRole) {
          navigate(resolvePath('/admin/dashboard'), { replace: true });
        }
      }
    };
    void hydrate();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) return;
      void (async () => {
        const adminRole = await getCurrentUserAdminRole(session.user.id);
        if (adminRole) navigate(resolvePath('/admin/dashboard'), { replace: true });
      })();
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (signInError) throw signInError;
      const { data: { session } } = await supabase.auth.getSession();
      const adminRole = session?.user ? await getCurrentUserAdminRole(session.user.id) : null;
      if (!adminRole) {
        await supabase.auth.signOut();
        setError('Administrator access required');
        setLoading(false);
        return;
      }
      try {
        await supabase.functions.invoke('record-login-audit', {
          body: { portal: 'admin', userAgent: navigator.userAgent },
        });
      } catch (auditError) {
        console.warn('Login audit failed:', auditError);
      }
      navigate(resolvePath('/admin/dashboard'));
    } catch (authError) {
      setError(normaliseAuthError(authError));
    }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    if (!email) { setError('Enter your email address first'); return; }
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setResetSent(true);
      setError('');
    } catch {
      setError('Unable to send reset email. Check the address and try again.');
    }
  };

  return (
    <div className="portal-login-split portal-login-split--admin">
      {/* Left: brand panel */}
      <div className="portal-login-brand portal-login-brand--admin">
        <div className="portal-login-brand__logo">
          MyMed<span>Info</span>
        </div>
        <h1 className="portal-login-brand__headline">
          Administration &amp; Management Portal
        </h1>
        <p className="portal-login-brand__sub">
          Manage GP practices, configure services, and oversee the MyMedInfo platform for Nottingham West PCN.
        </p>
        <div className="portal-login-brand__features">
          <div className="portal-login-brand__feat">
            <span className="portal-login-brand__dot" />
            Practice onboarding &amp; service activation
          </div>
          <div className="portal-login-brand__feat">
            <span className="portal-login-brand__dot" />
            Global medication card &amp; template management
          </div>
          <div className="portal-login-brand__feat">
            <span className="portal-login-brand__dot" />
            User access control &amp; audit logging
          </div>
          <div className="portal-login-brand__feat">
            <span className="portal-login-brand__dot" />
            System configuration &amp; demo access
          </div>
        </div>
        <p className="portal-login-brand__pcn">
          Restricted to authorised MyMedInfo administrators only
        </p>
      </div>

      {/* Right: form panel */}
      <div className="portal-login-form-panel">
        <div className="portal-login-form-inner">
          <p className="portal-login-form__eyebrow portal-login-form__eyebrow--admin">Admin Portal</p>
          <h2 className="portal-login-form__title">Sign in</h2>
          <p className="portal-login-form__sub">Access the administration dashboard</p>

          {error && (
            <div className="portal-login-form__alert portal-login-form__alert--error" role="alert">{error}</div>
          )}
          {resetSent && (
            <div className="portal-login-form__alert portal-login-form__alert--success" role="status">
              Password reset email sent. Check your inbox.
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="portal-login-form__group">
              <label className="portal-login-form__label" htmlFor="al-email">Email address</label>
              <input
                id="al-email"
                className="portal-login-form__input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="portal-login-form__group">
              <label className="portal-login-form__label" htmlFor="al-password">Password</label>
              <input
                id="al-password"
                className="portal-login-form__input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <button type="button" className="portal-login-form__forgot" onClick={handleResetPassword}>
              Forgot password?
            </button>
            <button type="submit" className="portal-login-form__submit portal-login-form__submit--admin" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="portal-login-form__footer">
            Restricted access · Authorised personnel only
            <br />
            For access issues contact the system owner
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
