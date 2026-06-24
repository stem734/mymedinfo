import React, { useState, useEffect } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { resolvePath } from '../subdomainUtils';

const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [linkExpired, setLinkExpired] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendSent, setResendSent] = useState(false);
  // SafeLinks defence: user must click a button before we exchange the code
  const [codeExchangeStarted, setCodeExchangeStarted] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const urlHasExpiredLink = (() => {
    const hash = window.location.hash;
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1));
      if (hashParams.get('error_code') === 'otp_expired') {
        return true;
      }
    }
    return searchParams.get('error_code') === 'otp_expired';
  })();

  const code = searchParams.get('code');

  useEffect(() => {
    if (urlHasExpiredLink) {
      return;
    }

    // PKCE flow: wait for user to click "Continue" before exchanging the code.
    // This prevents NHS Outlook SafeLinks from consuming the one-time code
    // by pre-fetching the URL before the real user arrives.
    if (code) {
      if (!codeExchangeStarted) {
        return; // show the landing screen, do nothing yet
      }

      let cancelled = false;
      void supabase.auth.exchangeCodeForSession(code).then((result) => {
        if (cancelled) return;
        const exchangeError = result.error;
        if (exchangeError) {
          console.error('Code exchange failed:', exchangeError.message);
          setLinkExpired(true);
        } else {
          setSessionReady(true);
        }
      });
      return () => { cancelled = true; };
    }

    // Implicit flow: admin.generateLink() produces hash-based recovery tokens
    // (e.g. #access_token=...&refresh_token=...&type=recovery).
    // detectSessionInUrl is false so the Supabase client won't process these
    // automatically — parse and set the session manually instead.
    let cancelled = false;
    const hash = window.location.hash;
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');

      if (accessToken && type === 'recovery') {
        void supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || '',
        }).then(({ error }) => {
          if (cancelled) return;
          if (error) {
            setLinkExpired(true);
          } else {
            setSessionReady(true);
          }
        });
        return () => { cancelled = true; };
      }
    }

    // Fallback: listen for PASSWORD_RECOVERY in case the session was already
    // established elsewhere (e.g. deep-link on mobile that sets the session
    // before this component mounts).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });

    void supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      const { session } = data;
      if (!cancelled && session) setSessionReady(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [searchParams, urlHasExpiredLink, codeExchangeStarted, code]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  // ── Success ──────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={{ maxWidth: '400px', margin: '2rem auto' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <ShieldCheck size={48} color="#007f3b" style={{ marginBottom: '1rem' }} />
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Password Updated</h1>
          <p style={{ color: '#4c6272', marginBottom: '1.5rem' }}>
            Your password has been set successfully. You can now sign in.
          </p>
          <button
            className="action-button"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => navigate(resolvePath('/admin'))}
          >
            Go to Admin Login
          </button>
          <button
            className="action-button"
            style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem', background: '#4c6272' }}
            onClick={() => navigate(resolvePath('/practice'))}
          >
            Go to Practice Login
          </button>
        </div>
      </div>
    );
  }

  // ── Expired link ─────────────────────────────────────────────────────────
  if (urlHasExpiredLink || linkExpired) {
    const handleResend = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      const { error: resendError } = await supabase.functions.invoke('send-password-reset', {
        body: { email: resendEmail.trim().toLowerCase() },
      });
      if (resendError) {
        setError('Unable to send a new link right now. Please try again.');
      } else {
        setResendSent(true);
      }
    };

    return (
      <div style={{ maxWidth: '400px', margin: '2rem auto' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <ShieldCheck size={48} color="#d5281b" style={{ marginBottom: '1rem' }} />
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Link Expired</h1>
          <p style={{ color: '#4c6272', marginBottom: '1.5rem' }}>
            This password reset link has expired. Enter your email below to receive a new one.
          </p>

          {resendSent ? (
            <div style={{ padding: '0.75rem', background: '#e8f5e9', color: '#007f3b', borderRadius: '8px', fontSize: '0.9rem' }}>
              A new reset link has been sent to {resendEmail}. Please check your inbox.
            </div>
          ) : (
            <form onSubmit={handleResend}>
              {error && (
                <div style={{ padding: '0.75rem', background: '#fde8e8', color: '#d5281b', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                  {error}
                </div>
              )}
              <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', fontSize: '0.9rem' }}>Email</label>
                <input
                  type="email"
                  value={resendEmail}
                  onChange={e => setResendEmail(e.target.value)}
                  required
                  style={{
                    width: '100%', padding: '0.75rem', border: '2px solid #d8dde0',
                    borderRadius: '8px', fontSize: '1rem', boxSizing: 'border-box'
                  }}
                />
              </div>
              <button
                type="submit"
                className="action-button"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Send New Reset Link
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ── SafeLinks landing screen ──────────────────────────────────────────────
  // Show this when a ?code= is present but the user hasn't clicked yet.
  // Email scanners (NHS Outlook SafeLinks) load the page but never click,
  // so the one-time code is preserved for the real user.
  if (code && !codeExchangeStarted) {
    return (
      <div style={{ maxWidth: '400px', margin: '2rem auto' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <ShieldCheck size={48} color="#005eb8" style={{ marginBottom: '1rem' }} />
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Reset Your Password</h1>
          <p style={{ color: '#4c6272', marginBottom: '2rem' }}>
            Click the button below to continue to the password reset form.
          </p>
          <button
            className="action-button"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => setCodeExchangeStarted(true)}
          >
            Continue to Password Reset
          </button>
        </div>
      </div>
    );
  }

  // ── Exchanging code (brief spinner) ──────────────────────────────────────
  if (!sessionReady) {
    return (
      <div style={{ maxWidth: '400px', margin: '2rem auto' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <ShieldCheck size={48} color="#005eb8" style={{ marginBottom: '1rem' }} />
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Set Your Password</h1>
          <p style={{ color: '#4c6272' }}>
            Verifying your reset link...
          </p>
        </div>
      </div>
    );
  }

  // ── Password form ─────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: '400px', margin: '2rem auto' }}>
      <div className="card" style={{ textAlign: 'center' }}>
        <ShieldCheck size={48} color="#005eb8" style={{ marginBottom: '1rem' }} />
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Set Your Password</h1>
        <p style={{ color: '#4c6272', marginBottom: '2rem' }}>MyMedInfo</p>

        {error && (
          <div style={{ padding: '0.75rem', background: '#fde8e8', color: '#d5281b', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleReset}>
          <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', fontSize: '0.9rem' }}>New Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              style={{
                width: '100%', padding: '0.75rem', border: '2px solid #d8dde0',
                borderRadius: '8px', fontSize: '1rem', boxSizing: 'border-box'
              }}
            />
          </div>
          <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', fontSize: '0.9rem' }}>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              style={{
                width: '100%', padding: '0.75rem', border: '2px solid #d8dde0',
                borderRadius: '8px', fontSize: '1rem', boxSizing: 'border-box'
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="action-button"
            style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Updating...' : 'Set Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
