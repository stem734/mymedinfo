import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Shield, Stethoscope, Zap } from 'lucide-react';
import { adminUrl, practiceUrl } from '../subdomainUtils';

type LandingAction = {
  title: string;
  description: string;
  label: string;
  tone: 'admin' | 'practice' | 'demo';
  icon: React.ReactNode;
  onClick: () => void;
};

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const navigateToUrl = (url: string) => {
    if (url.startsWith('http')) {
      window.location.href = url;
      return;
    }

    navigate(url);
  };

  const actions: LandingAction[] = [
    {
      title: 'Admin',
      description: 'Manage medications, templates, and system settings',
      label: 'Open admin',
      tone: 'admin',
      icon: <Shield size={28} aria-hidden="true" />,
      onClick: () => navigateToUrl(adminUrl()),
    },
    {
      title: 'Practice',
      description: 'Manage practice medications and patient content',
      label: 'Open practice',
      tone: 'practice',
      icon: <Stethoscope size={28} aria-hidden="true" />,
      onClick: () => navigateToUrl(practiceUrl()),
    },
    {
      title: 'Demo',
      description: 'Try the patient information experience',
      label: 'Launch demo',
      tone: 'demo',
      icon: <Zap size={28} aria-hidden="true" />,
      onClick: () => navigate('/demo'),
    },
  ];

  return (
    <div className="landing-screen">
      <section className="landing-hero" aria-labelledby="landing-title">
        <img className="landing-hero__logo" src="/MyMedInfo-logo.png" alt="MyMedInfo" />
        <h1 id="landing-title" className="landing-hero__title">MyMedInfo</h1>
        <p className="landing-hero__subtitle">Clear, trusted medication and patient information</p>
      </section>

      <div className="landing-actions" aria-label="Choose a MyMedInfo area">
        {actions.map((action) => (
          <button
            key={action.title}
            type="button"
            className={`landing-action-card landing-action-card--${action.tone}`}
            onClick={action.onClick}
          >
            <span className="landing-action-card__icon">{action.icon}</span>
            <span className="landing-action-card__body">
              <span className="landing-action-card__title">{action.title}</span>
              <span className="landing-action-card__description">{action.description}</span>
            </span>
            <span className="landing-action-card__cta">
              {action.label}
              <ArrowRight size={17} aria-hidden="true" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Landing;
