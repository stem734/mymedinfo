import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Stethoscope, Zap, ArrowRight } from 'lucide-react';
import { adminUrl, practiceUrl } from '../subdomainUtils';

const Landing: React.FC = () => {
  const navigate = useNavigate();

  const navigateToUrl = (url: string) => {
    if (url.startsWith('http')) { window.location.href = url; return; }
    navigate(url);
  };

  return (
    <div className="portal-landing">
      <div className="portal-landing__brand">
        <div className="portal-landing__logo">MyMed<span>Info</span></div>
        <p className="portal-landing__tagline">NHS Clinical Decision Support Platform</p>
        <p className="portal-landing__org">Nottingham West Primary Care Network</p>
      </div>

      <div className="portal-landing__cards">
        <button
          type="button"
          className="portal-landing__card portal-landing__card--practice"
          onClick={() => navigateToUrl(practiceUrl())}
        >
          <div className="portal-landing__card-icon">
            <Stethoscope size={28} aria-hidden="true" />
          </div>
          <div className="portal-landing__card-body">
            <div className="portal-landing__card-title">Practice Portal</div>
            <div className="portal-landing__card-desc">
              Manage medication cards, health checks, and patient content for your GP practice
            </div>
          </div>
          <ArrowRight size={18} className="portal-landing__card-arrow" aria-hidden="true" />
        </button>

        <button
          type="button"
          className="portal-landing__card portal-landing__card--admin"
          onClick={() => navigateToUrl(adminUrl())}
        >
          <div className="portal-landing__card-icon">
            <Shield size={28} aria-hidden="true" />
          </div>
          <div className="portal-landing__card-body">
            <div className="portal-landing__card-title">Admin Portal</div>
            <div className="portal-landing__card-desc">
              Configure practices, manage templates, and oversee the platform
            </div>
          </div>
          <ArrowRight size={18} className="portal-landing__card-arrow" aria-hidden="true" />
        </button>

        <button
          type="button"
          className="portal-landing__card portal-landing__card--demo"
          onClick={() => navigate('/demo')}
        >
          <div className="portal-landing__card-icon">
            <Zap size={28} aria-hidden="true" />
          </div>
          <div className="portal-landing__card-body">
            <div className="portal-landing__card-title">Demo Access</div>
            <div className="portal-landing__card-desc">
              Try the patient information experience without an account
            </div>
          </div>
          <ArrowRight size={18} className="portal-landing__card-arrow" aria-hidden="true" />
        </button>
      </div>

      <p className="portal-landing__footer">
        NHS-hosted · Data processed in UK · SOC 2 compliant
      </p>
    </div>
  );
};

export default Landing;
