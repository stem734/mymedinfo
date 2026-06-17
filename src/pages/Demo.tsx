import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, ClipboardList, Monitor, Search, ShieldPlus, Shuffle, Tablets } from 'lucide-react';
import { buildDemoPatientUrl, buildDemoSamples, getRandomDemoSample, type DemoSample } from '../demoHelpers';
import { useMedicationCatalog } from '../medicationCatalog';
import { fetchCardTemplates } from '../cardTemplateStore';
import {
  type ImmunisationTemplate,
  type LongTermConditionTemplate,
  type ScreeningTemplate,
} from '../patientTemplateCatalog';

const CARD_CATEGORY_ORDER: DemoSample['category'][] = [
  'Medication',
  'Health check',
  'Screening',
  'Immunisation',
  'Long term condition',
];

const CATEGORY_ICONS: Record<DemoSample['category'], React.ElementType> = {
  Medication: Tablets,
  'Health check': Activity,
  Screening: Search,
  Immunisation: ShieldPlus,
  'Long term condition': ClipboardList,
};

const demoSectionId = (category: DemoSample['category']) => `demo-${category.toLowerCase().replace(/\s+/g, '-')}`;

const Demo: React.FC = () => {
  const navigate = useNavigate();
  const { medications } = useMedicationCatalog();
  const [screeningTemplates, setScreeningTemplates] = React.useState<ScreeningTemplate[]>([]);
  const [immunisationTemplates, setImmunisationTemplates] = React.useState<ImmunisationTemplate[]>([]);
  const [ltcTemplates, setLtcTemplates] = React.useState<LongTermConditionTemplate[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    const loadTemplates = async () => {
      try {
        const [screeningRows, immunisationRows, ltcRows] = await Promise.all([
          fetchCardTemplates<ScreeningTemplate>('screening'),
          fetchCardTemplates<ImmunisationTemplate>('immunisation'),
          fetchCardTemplates<LongTermConditionTemplate>('ltc'),
        ]);

        if (cancelled) return;

        setScreeningTemplates(screeningRows.map((row) => row.payload));
        setImmunisationTemplates(immunisationRows.map((row) => row.payload));
        setLtcTemplates(ltcRows.map((row) => row.payload));
      } catch (error) {
        console.error('Failed to load demo template catalogue', error);
        if (cancelled) return;
        setScreeningTemplates([]);
        setImmunisationTemplates([]);
        setLtcTemplates([]);
      }
    };

    void loadTemplates();

    return () => {
      cancelled = true;
    };
  }, []);

  const demoSamples = React.useMemo(
    () => buildDemoSamples(medications, { screeningTemplates, immunisationTemplates, ltcTemplates }),
    [immunisationTemplates, ltcTemplates, medications, screeningTemplates],
  );

  const openDemo = (index: number) => {
    navigate(buildDemoPatientUrl(demoSamples[index]));
  };

  const openRandomDemo = () => {
    const medicationSamples = demoSamples.filter((sample) => sample.category === 'Medication');
    const samples = medicationSamples.length > 0
      ? demoSamples
      : buildDemoSamples(medications, { screeningTemplates, immunisationTemplates, ltcTemplates });
    const index = Math.floor(Math.random() * samples.length);
    navigate(buildDemoPatientUrl(samples[index] || getRandomDemoSample()));
  };

  const samplesByCategory = CARD_CATEGORY_ORDER.map((category) => ({
    category,
    samples: demoSamples.filter((sample) => sample.category === category),
  })).filter(({ samples }) => samples.length > 0);

  return (
    <div className="demo-page">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="demo-page__back-button"
      >
        <ArrowLeft size={16} /> Back
      </button>

      <header className="demo-page__header">
        <div>
          <p className="demo-page__eyebrow">Demo Access</p>
          <h1 className="demo-page__title">MyMedInfo Demo</h1>
        </div>
        <p className="demo-page__subtitle">
          Pick an example card view or load a random one. Demo links do not include patient names or NHS numbers.
        </p>
      </header>

      <div className="patient-demo-banner demo-page__notice">
        This is dummy information for demonstration purposes only.
      </div>

      <div className="demo-page__actions">
        <button
          type="button"
          onClick={openRandomDemo}
          className="action-button demo-page__random-button"
        >
          <Shuffle size={18} /> Random demo
        </button>
      </div>

      <div className="demo-page__sections">
        {samplesByCategory.map(({ category, samples }) => {
          const CategoryIcon = CATEGORY_ICONS[category];
          const sectionId = demoSectionId(category);

          return (
            <section key={category} className="demo-page__section" aria-labelledby={sectionId}>
              <div className="demo-page__section-header">
                <span className="demo-page__section-icon" aria-hidden="true">
                  <CategoryIcon size={20} />
                </span>
                <h2 id={sectionId} className="demo-page__section-title">{category}</h2>
                <span className="demo-page__count">{samples.length} sample{samples.length === 1 ? '' : 's'}</span>
              </div>

              <div className="demo-page__sample-grid">
                {samples.map((sample) => {
                  const sampleIndex = demoSamples.findIndex((item) => item.id === sample.id);

                  return (
                    <button
                      type="button"
                      key={sample.id}
                      onClick={() => openDemo(sampleIndex)}
                      className="demo-page__sample-card"
                    >
                      <div className="demo-page__sample-meta">
                        <Monitor size={22} />
                        <strong>{sample.category}</strong>
                      </div>
                      <div className="demo-page__sample-title">
                        {sample.title}
                      </div>
                      <div className="demo-page__sample-description">
                        {sample.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default Demo;
