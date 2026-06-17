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
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}>
      <button
        onClick={() => navigate('/')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          background: '#005eb8',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          marginBottom: '2rem',
          fontSize: '0.9rem',
          fontWeight: '600'
        }}
      >
        <ArrowLeft size={16} /> Back
      </button>

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '2rem', color: '#212b32', marginBottom: '0.5rem' }}>MyMedInfo Demo</h1>
        <p style={{ fontSize: '1rem', color: '#4c6272', margin: 0 }}>
          Pick an example card view or load a random one. Demo links do not include patient names or NHS numbers.
        </p>
      </div>

      <div className="patient-demo-banner" style={{ marginBottom: '1.5rem' }}>
        This is dummy information for demonstration purposes only.
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <button
          onClick={openRandomDemo}
          className="action-button"
          style={{ backgroundColor: '#212b32', color: 'white', justifyContent: 'center' }}
        >
          <Shuffle size={18} /> Random demo
        </button>
      </div>

      <div style={{ display: 'grid', gap: '2rem' }}>
        {samplesByCategory.map(({ category, samples }) => {
          const CategoryIcon = CATEGORY_ICONS[category];

          return (
            <section key={category} aria-labelledby={`demo-${category}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
                <CategoryIcon size={22} color="#005eb8" />
                <h2 id={`demo-${category}`} style={{ margin: 0, fontSize: '1.25rem', color: '#212b32' }}>{category}</h2>
                <span style={{ color: '#4c6272', fontSize: '0.9rem' }}>{samples.length} sample{samples.length === 1 ? '' : 's'}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                {samples.map((sample) => {
                  const sampleIndex = demoSamples.findIndex((item) => item.id === sample.id);

                  return (
                    <button
                      key={sample.id}
                      onClick={() => openDemo(sampleIndex)}
                      className="resource-card"
                      style={{
                        textAlign: 'left',
                        padding: '1.25rem',
                        background: 'white',
                        borderRadius: '8px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        border: '1px solid #d8dde0',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', color: '#005eb8' }}>
                        <Monitor size={22} />
                        <strong>{sample.category}</strong>
                      </div>
                      <div style={{ fontWeight: 700, color: '#212b32', marginBottom: '0.35rem' }}>
                        {sample.title}
                      </div>
                      <div style={{ color: '#4c6272', fontSize: '0.92rem', lineHeight: 1.45 }}>
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
