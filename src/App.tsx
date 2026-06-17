import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import type { AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getSubdomain } from './subdomainUtils';
import HeaderNav from './components/HeaderNav';

declare const __APP_COMMIT_HASH__: string;
declare const __APP_BUILD_STAMP__: string;

const AdminLogin = React.lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const PracticeSignup = React.lazy(() => import('./pages/PracticeSignup'));
const PracticeLogin = React.lazy(() => import('./pages/PracticeLogin'));
const PracticeDashboard = React.lazy(() => import('./pages/PracticeDashboard'));
const Landing = React.lazy(() => import('./pages/Landing'));
const Demo = React.lazy(() => import('./pages/Demo'));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'));
const PatientRouter = React.lazy(() => import('./pages/PatientRouter'));
const LegalPage = React.lazy(() => import('./pages/LegalPage'));

const ClinicianDemo: React.FC<{ show?: boolean }> = ({ show = true }) => {
  if (!show) return null;

  return null;
};

const PageFallback: React.FC = () => (
  <div className="loading-state">
    <p>Loading...</p>
  </div>
);

const SubdomainRoutes: React.FC = () => {
  const subdomain = getSubdomain();

  if (subdomain === 'admin') {
    return (
      <Routes>
        <Route path="/" element={<AdminLogin />} />
        <Route path="/dashboard" element={<AdminDashboard />} />
        <Route path="/drug-builder" element={<AdminDashboard />} />
        <Route path="/card-builder" element={<AdminDashboard />} />
        <Route path="/patient" element={<PatientRouter />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    );
  }

  if (subdomain === 'practice') {
    return (
      <Routes>
        <Route path="/" element={<PracticeLogin />} />
        <Route path="/dashboard" element={<PracticeDashboard />} />
        <Route path="/signup" element={<PracticeSignup />} />
        <Route path="/patient" element={<PatientRouter />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    );
  }

  // Default: main domain (www.mymedinfo.info / localhost)
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/demo" element={<Demo />} />
      <Route path="/patient" element={<PatientRouter />} />
      <Route path="/legal" element={<LegalPage />} />
      <Route path="/admin" element={<AdminLogin />} />
      <Route path="/admin/dashboard" element={<AdminDashboard />} />
      <Route path="/signup" element={<PracticeSignup />} />
      <Route path="/admin/drug-builder" element={<AdminDashboard />} />
      <Route path="/admin/card-builder" element={<AdminDashboard />} />
      <Route path="/practice" element={<PracticeLogin />} />
      <Route path="/practice/signup" element={<PracticeSignup />} />
      <Route path="/practice/dashboard" element={<PracticeDashboard />} />
      <Route path="/reset-password" element={<ResetPassword />} />
    </Routes>
  );
};

const AppContent: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const subdomain = getSubdomain();
  const showClinicianDemo = location.pathname === '/patient' || location.pathname === '/demo';
  const isPatientRoute = location.pathname === '/patient';
  const isLandingRoute = location.pathname === '/';
  const isAdminDashboardRoute =
    (subdomain === 'admin' && location.pathname === '/dashboard') ||
    (subdomain === 'admin' && ['/card-builder', '/drug-builder'].includes(location.pathname)) ||
    ['/admin/dashboard', '/admin/card-builder', '/admin/drug-builder'].includes(location.pathname);
  const isPracticeDashboardRoute =
    (subdomain === 'practice' && location.pathname === '/dashboard') ||
    location.pathname === '/practice/dashboard';
  const isPracticeLoginRoute =
    (subdomain === 'practice' && location.pathname === '/') ||
    location.pathname === '/practice';
  const isAdminLoginRoute =
    (subdomain === 'admin' && location.pathname === '/') ||
    location.pathname === '/admin';
  const isPracticeSignupRoute =
    (subdomain === 'practice' && location.pathname === '/signup') ||
    location.pathname === '/practice/signup' ||
    location.pathname === '/signup';
  const useEmbeddedPortalShell = isAdminDashboardRoute || isPracticeDashboardRoute || isPracticeLoginRoute || isAdminLoginRoute || isLandingRoute || isPracticeSignupRoute;
  const mainClassName = [
    'app-main',
    isLandingRoute ? 'app-main--landing' : '',
    isPatientRoute ? 'app-main--patient' : '',
    useEmbeddedPortalShell ? 'app-main--portal' : '',
  ].filter(Boolean).join(' ');
  const buildLabel = new Date(__APP_BUILD_STAMP__).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const gitRefLabel = __APP_COMMIT_HASH__;

  // Detect implicit-flow Supabase auth recovery tokens in the URL hash
  // and redirect to /reset-password. The PKCE ?code= flow is NOT handled
  // here — the reset email links directly to /reset-password?code=... so
  // no redirect is needed, and intercepting it here would cause a re-render
  // that re-initialises the Supabase client and consumes the one-time code.
  useEffect(() => {
    if (location.pathname === '/reset-password') return;

    const hash = window.location.hash;
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1));
      if (hashParams.get('type') === 'recovery' || hashParams.get('error_code') === 'otp_expired') {
        navigate('/reset-password' + window.location.hash, { replace: true });
      }
    }
  }, [location, navigate]);

  // Listen for PASSWORD_RECOVERY event and redirect
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'PASSWORD_RECOVERY' && location.pathname !== '/reset-password') {
        navigate('/reset-password', { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [location, navigate]);

  return (
    <div className="app-container">
      <a href="#main-content" className="sr-only">Skip to content</a>
      {!isPatientRoute && !isLandingRoute && !useEmbeddedPortalShell && (
        <header className="site-header">
          <div className="site-header__inner">
            <a className="site-header__logo-link" href="/" aria-label="MyMedInfo home">
              <span className="mymedinfo-wordmark site-header__wordmark" aria-hidden="true">
                MyMed<span>Info</span>
              </span>
            </a>
            <HeaderNav />
          </div>
        </header>
      )}
      <main id="main-content" className={mainClassName}>
        <Suspense fallback={<PageFallback />}>
          <SubdomainRoutes />
        </Suspense>
      </main>

      {!useEmbeddedPortalShell && (
        <footer className="footer">
          <span className="footer__border" aria-hidden="true" />
          <div className="footer__container">
            <div className="footer__meta">
              <p className="footer__copyright">
                © {new Date().getFullYear()} <a href="https://www.nottinghamwestpcn.co.uk/" target="_blank" rel="noopener noreferrer">Nottingham West Primary Care Network</a> - MyMedInfo
              </p>
              <p className="footer__version" title={`Commit ${__APP_COMMIT_HASH__}`}>
                <span className="footer__beta">Beta</span>
                <span>GitHub ref {gitRefLabel}</span>
                <span className="footer__build-stamp">{buildLabel}</span>
              </p>
            </div>
            <div className="footer__links">
              <a href="/legal">Legal &amp; Compliance</a>
            </div>
          </div>
        </footer>
      )}

      <ClinicianDemo show={showClinicianDemo} />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
};

export default App;
