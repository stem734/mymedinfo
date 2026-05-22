import React from 'react';

type LoginFormProps = {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  email: string;
  password: string;
  error: string;
  resetSent: boolean;
  loading: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onResetPassword: () => void;
  submitLabel?: string;
  resetLabel?: string;
};

const LoginForm: React.FC<LoginFormProps> = ({
  title,
  subtitle,
  icon,
  email,
  password,
  error,
  resetSent,
  loading,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onResetPassword,
  submitLabel = 'Sign In',
  resetLabel = 'Forgot password? Reset it here',
}) => {
  return (
    <div className="card login-card">
      <div className="login-card__icon">{icon}</div>
      <h1 className="login-card__title">{title}</h1>
      <p className="login-card__subtitle">{subtitle}</p>

      {error && <div className="form-banner form-banner--error" role="alert">{error}</div>}

      {resetSent && <div className="form-banner form-banner--success" role="status">Password reset email sent. Check your inbox.</div>}

      <form onSubmit={onSubmit}>
        <div className="form-field">
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} required />
        </div>
        <div className="form-field">
          <label htmlFor="login-password">Password</label>
          <input id="login-password" type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} required />
        </div>
        <button type="submit" disabled={loading} className="action-button action-button--full">
          {loading ? 'Signing in...' : submitLabel}
        </button>
      </form>

      <button type="button" onClick={onResetPassword} className="login-card__reset-link">
        {resetLabel}
      </button>
    </div>
  );
};

export default LoginForm;
