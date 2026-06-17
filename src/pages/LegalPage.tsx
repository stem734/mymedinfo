import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Shield, FileText, Cookie, Eye } from 'lucide-react';

type Tab = 'privacy' | 'terms' | 'cookies' | 'accessibility';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'privacy',       label: 'Privacy Notice',       icon: <Shield size={16} /> },
  { id: 'terms',         label: 'Terms of Use',          icon: <FileText size={16} /> },
  { id: 'cookies',       label: 'Cookies',               icon: <Cookie size={16} /> },
  { id: 'accessibility', label: 'Accessibility',         icon: <Eye size={16} /> },
];

/* ─── shared primitives ──────────────────────────────────────── */
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ marginBottom: '2rem' }}>
    <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#212b32', borderBottom: '2px solid #005eb8', paddingBottom: '0.4rem', marginBottom: '0.75rem' }}>
      {title}
    </h2>
    {children}
  </section>
);

const Sub: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: '1rem' }}>
    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#4c6272', marginBottom: '0.4rem' }}>{title}</h3>
    {children}
  </div>
);

const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p style={{ fontSize: '0.95rem', color: '#212b32', lineHeight: 1.7, marginBottom: '0.6rem' }}>{children}</p>
);

const Ul: React.FC<{ items: string[] }> = ({ items }) => (
  <ul style={{ paddingLeft: '1.5rem', marginBottom: '0.6rem' }}>
    {items.map((item, i) => (
      <li key={i} style={{ fontSize: '0.95rem', color: '#212b32', lineHeight: 1.7, marginBottom: '0.25rem' }}>{item}</li>
    ))}
  </ul>
);

const InfoBox: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ background: '#d6e8f7', border: '1px solid #005eb8', borderRadius: '8px', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
    <p style={{ fontWeight: 700, color: '#005eb8', marginBottom: '0.35rem', fontSize: '0.95rem' }}>{title}</p>
    <div style={{ fontSize: '0.95rem', color: '#212b32', lineHeight: 1.6 }}>{children}</div>
  </div>
);

const MetaTable: React.FC<{ rows: [string, string][] }> = ({ rows }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
    <tbody>
      {rows.map(([label, value], i) => (
        <tr key={i} style={{ background: i % 2 === 0 ? '#f0f4f8' : '#ffffff' }}>
          <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#4c6272', width: '35%', border: '1px solid #d8e0e8' }}>{label}</td>
          <td style={{ padding: '0.5rem 0.75rem', color: '#212b32', border: '1px solid #d8e0e8' }}>{value}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

/* ─── Privacy Notice ─────────────────────────────────────────── */
const PrivacyNotice: React.FC = () => (
  <div>
    <MetaTable rows={[
      ['Data Controller',    'The GP practice that sent you this link'],
      ['Service Operator',   'Nottingham West PCN / MyMedInfo'],
      ['Website',            'www.mymedinfo.info'],
      ['Effective date',     'April 2025'],
      ['Review date',        'April 2026'],
    ]} />

    <Section title="1. What is MyMedInfo?">
      <P>MyMedInfo is a web-based patient information tool used by GP practices within Nottingham West Primary Care Network (PCN). When your practice sends you a MyMedInfo link, it generates an information page — for example, guidance on a new prescription, your NHS Health Check results, or vaccination aftercare — directly in your browser.</P>
      <P>This Privacy Notice explains what data is processed when you use MyMedInfo, who is responsible for it, and your rights under UK GDPR and the Data Protection Act 2018.</P>
    </Section>

    <Section title="2. Who is the Data Controller?">
      <P>The GP practice that sent you your link is the Data Controller. Nottingham West PCN and the developers of MyMedInfo act as Data Processors — handling data only on the instruction of the practice. Your first point of contact for any data question is your GP practice.</P>
    </Section>

    <Section title="3. What information does MyMedInfo process?">
      <Sub title="3.1 Information held by your GP practice">
        <P>All of your clinical and personal information remains stored in SystmOne. MyMedInfo does not receive, store, or have access to your medical record.</P>
      </Sub>
      <Sub title="3.2 Information in the link">
        <P>The link you receive contains a short code that includes a practice identifier (which identifies your practice, not you) and the clinical parameters needed to generate the page. It does not contain your name, NHS number, date of birth, or any other information that directly identifies you.</P>
      </Sub>
      <Sub title="3.3 Access logs">
        <P>When you open your link, our hosting infrastructure may record standard server access log data, including:</P>
        <Ul items={['Your IP address', 'The date and time you accessed the link', 'Which practice code was included in the link']} />
        <P>This is the minimum data required to operate a secure web service. It is not used to profile you or make decisions about you.</P>
      </Sub>
      <Sub title="3.4 Satisfaction survey (optional)">
        <P>You may be asked to rate whether you found the information useful. This is entirely voluntary. No name or identifiable information is attached to survey responses.</P>
      </Sub>
    </Section>

    <Section title="4. Lawful basis for processing">
      <Ul items={[
        'Article 6(1)(e) UK GDPR — processing is necessary for a task carried out in the public interest (delivery of NHS primary care services).',
        'Article 9(2)(h) UK GDPR — processing of health-related data is necessary for the provision of health or social care.',
      ]} />
    </Section>

    <Section title="5. How long is data kept?">
      <P>Access log data (IP address, timestamp, practice code) is retained for a maximum of 12 months, then automatically deleted. Survey ratings are retained for up to 24 months for service evaluation. No other personal data is stored by MyMedInfo.</P>
    </Section>

    <Section title="6. Who do we share data with?">
      <P>We do not sell your data or share it for marketing purposes. The following infrastructure providers may process data on our behalf under data processing agreements:</P>
      <Ul items={['Supabase (database and access logging) — EU/UK infrastructure', 'Vercel (web hosting and content delivery) — EU/UK infrastructure']} />
    </Section>

    <Section title="7. Your rights">
      <P>Under UK GDPR you have the right to access, rectify, erase, restrict, object to, or port your personal data. To exercise these rights please contact your GP practice in the first instance. You also have the right to complain to the ICO (www.ico.org.uk, 0303 123 1113).</P>
    </Section>

    <InfoBox title="In summary">
      <p>MyMedInfo shows you information generated from data your practice already holds. No clinical record data enters our systems. The only data we may process is a practice code, your IP address, and an optional anonymous rating. Your GP practice is your Data Controller.</p>
    </InfoBox>
  </div>
);

/* ─── Terms of Use ───────────────────────────────────────────── */
const TermsOfUse: React.FC = () => (
  <div>
    <Section title="1. About these terms">
      <P>These Terms of Use govern your access to and use of MyMedInfo at www.mymedinfo.info, operated on behalf of Nottingham West PCN and its member GP practices. By accessing a MyMedInfo link, you agree to these terms.</P>
    </Section>

    <Section title="2. What MyMedInfo is — and is not">
      <P>MyMedInfo provides general health information tailored to your recent clinical interaction. It is intended to support, not replace, conversations with your clinical team.</P>
      <InfoBox title="Important — not a substitute for clinical advice">
        <p>The information provided through MyMedInfo is for guidance only. It does not constitute medical advice. Always follow the specific advice of your GP or clinical team. In an emergency, call 999. For urgent non-emergency care, call NHS 111.</p>
      </InfoBox>
      <P>MyMedInfo is not:</P>
      <Ul items={[
        'A method of contacting your GP practice',
        'A medical or clinical advice tool',
        'A record of your medical history',
        'A substitute for your prescription or any official clinical document',
      ]} />
    </Section>

    <Section title="3. Access and eligibility">
      <P>MyMedInfo links are generated by GP practices for their registered patients. Links are intended for the personal use of the patient to whom they are addressed. You should not share your link with others, as it contains information specific to your clinical interaction.</P>
    </Section>

    <Section title="4. Accuracy of information">
      <P>We take care to ensure information is accurate and consistent with current NHS guidance. However, clinical guidelines change and individual circumstances vary. Links include a date stamp — information from a link more than 6 months old may be out of date and the service will display a warning. Please contact your practice if you have concerns.</P>
    </Section>

    <Section title="5. Intellectual property">
      <P>The MyMedInfo service, its design, and clinical content are owned by or licensed to Nottingham West PCN. You may print or save content for your own personal, non-commercial use. NHS branding and referenced NHS content remains the property of NHS England.</P>
    </Section>

    <Section title="6. Limitation of liability">
      <P>MyMedInfo and Nottingham West PCN accept no liability for loss arising from misuse of information provided through this service, losses from temporary unavailability, or inaccuracies arising from changes in clinical guidance after publication. Nothing in these terms limits liability for death or personal injury caused by negligence.</P>
    </Section>

    <Section title="7. Governing law">
      <P>These terms are governed by the law of England and Wales. Continued use of the service following any update to these terms constitutes acceptance of the revised version.</P>
    </Section>
  </div>
);

/* ─── Cookie Policy ──────────────────────────────────────────── */
const CookiePolicy: React.FC = () => (
  <div>
    <Section title="1. Our approach">
      <P>MyMedInfo is designed to minimise data collection. We do not use advertising cookies, tracking pixels, or third-party analytics. We do not track you across the internet.</P>
      <InfoBox title="In plain English">
        <p>We do not use Google Analytics, Facebook Pixel, or similar tracking tools. Any storage we use exists solely to make the service work correctly for you.</p>
      </InfoBox>
    </Section>

    <Section title="2. Storage we use">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', marginBottom: '1rem' }}>
        <thead>
          <tr style={{ background: '#005eb8', color: '#ffffff' }}>
            {['Name', 'Type', 'Duration', 'Purpose'].map(h => (
              <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', border: '1px solid #cccccc' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr style={{ background: '#f8fafc' }}>
            <td style={{ padding: '0.5rem 0.75rem', border: '1px solid #cccccc', fontFamily: 'monospace', fontSize: '0.82rem' }}>practice-validation:[org]</td>
            <td style={{ padding: '0.5rem 0.75rem', border: '1px solid #cccccc' }}>Session storage</td>
            <td style={{ padding: '0.5rem 0.75rem', border: '1px solid #cccccc' }}>5 minutes</td>
            <td style={{ padding: '0.5rem 0.75rem', border: '1px solid #cccccc' }}>Caches GP practice registration status to avoid repeat database lookups. Contains only a validity flag and expiry timestamp — no personal data.</td>
          </tr>
          <tr>
            <td style={{ padding: '0.5rem 0.75rem', border: '1px solid #cccccc', fontFamily: 'monospace', fontSize: '0.82rem' }}>supabase-auth-token</td>
            <td style={{ padding: '0.5rem 0.75rem', border: '1px solid #cccccc' }}>Local storage</td>
            <td style={{ padding: '0.5rem 0.75rem', border: '1px solid #cccccc' }}>Session</td>
            <td style={{ padding: '0.5rem 0.75rem', border: '1px solid #cccccc' }}>Used only by practice staff logging into the practice portal. Not present for patients viewing an information page.</td>
          </tr>
        </tbody>
      </table>
    </Section>

    <Section title="3. What we do not use">
      <Ul items={[
        'Advertising or marketing cookies',
        'Cross-site tracking technologies',
        'Google Analytics or similar third-party analytics',
        'Social media tracking pixels',
        'Fingerprinting technologies',
      ]} />
    </Section>

    <Section title="4. Managing storage">
      <P>You can clear browser storage through your browser settings at any time. This will not affect your ability to use the service. For guidance visit <a href="https://www.aboutcookies.org" target="_blank" rel="noopener noreferrer" style={{ color: '#005eb8' }}>www.aboutcookies.org</a>.</P>
    </Section>
  </div>
);

/* ─── Accessibility Statement ────────────────────────────────── */
const AccessibilityStatement: React.FC = () => (
  <div>
    <Section title="1. Our commitment">
      <P>MyMedInfo is committed to making its service accessible to as many people as possible, including those with disabilities or other access needs. We aim to meet WCAG 2.1 Level AA.</P>
    </Section>

    <Section title="2. How accessible is this service?">
      <Ul items={[
        'Semantic HTML with appropriate ARIA roles and live regions for dynamic content',
        'Skip-to-content link at the top of each page for keyboard users',
        'All interactive elements are accessible by keyboard',
        'Colour contrast ratios meet or exceed WCAG 2.1 AA requirements',
        'Text can be resized up to 200% without loss of content or functionality',
        'Screen reader announcements for loading and authentication states',
        'Print stylesheet provided for accessible offline use',
        'No content relies solely on colour to convey information',
      ]} />
    </Section>

    <Section title="3. Known issues">
      <Ul items={[
        'The NHS Health Check results view is in early development and full screen reader testing has not yet been completed.',
        'Some third-party resources we link to (NHS.uk, TREND Diabetes) are outside our control and may not fully meet accessibility standards.',
      ]} />
    </Section>

    <Section title="4. Requesting accessible formats">
      <P>If you need information in a different format — such as large print, Easy Read, audio, or a different language — please contact your GP practice. They will be able to arrange an alternative.</P>
    </Section>

    <Section title="5. Reporting accessibility problems">
      <P>We welcome feedback on accessibility. If you experience a problem, please report it to your GP practice or PCN coordinator. We aim to acknowledge reports within 5 working days.</P>
      <P>If you are not satisfied with our response, you may contact the Equality Advisory and Support Service (EASS) at <a href="https://www.equalityadvisoryservice.com" target="_blank" rel="noopener noreferrer" style={{ color: '#005eb8' }}>www.equalityadvisoryservice.com</a>.</P>
    </Section>

    <Section title="6. Review">
      <P>This statement was prepared in April 2025. It will be reviewed annually or whenever the service undergoes significant changes.</P>
    </Section>
  </div>
);

/* ─── Tab content map ────────────────────────────────────────── */
const TAB_CONTENT: Record<Tab, React.ReactNode> = {
  privacy:       <PrivacyNotice />,
  terms:         <TermsOfUse />,
  cookies:       <CookiePolicy />,
  accessibility: <AccessibilityStatement />,
};

/* ─── Main page ──────────────────────────────────────────────── */
const LegalPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') as Tab | null;
  const activeTab: Tab = rawTab && TABS.find(t => t.id === rawTab) ? rawTab : 'privacy';

  const selectTab = (id: Tab) => setSearchParams({ tab: id }, { replace: true });

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to="/" style={{ color: '#005eb8', fontSize: '0.9rem', textDecoration: 'none' }}>← Back to home</Link>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#212b32', marginTop: '0.75rem', marginBottom: '0.25rem' }}>
          Legal &amp; Compliance
        </h1>
        <p style={{ color: '#4c6272', fontSize: '0.95rem', marginBottom: 0 }}>
          MyMedInfo  ·  Nottingham West PCN  ·  Version 1.0, April 2025
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '2px solid #d8e0e8', paddingBottom: '0' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.55rem 1rem',
              border: 'none',
              borderBottom: activeTab === tab.id ? '3px solid #005eb8' : '3px solid transparent',
              background: 'none',
              color: activeTab === tab.id ? '#005eb8' : '#4c6272',
              fontWeight: activeTab === tab.id ? 700 : 400,
              fontSize: '0.9rem',
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: 'color 0.15s',
            }}
            aria-selected={activeTab === tab.id}
            role="tab"
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div role="tabpanel" style={{ minHeight: '40vh' }}>
        {TAB_CONTENT[activeTab]}
      </div>

      {/* Footer note */}
      <div style={{ marginTop: '3rem', paddingTop: '1rem', borderTop: '1px solid #d8e0e8', fontSize: '0.82rem', color: '#768692' }}>
        <p>These documents are maintained by Nottingham West PCN on behalf of member GP practices. For questions, contact your GP practice or the PCN coordinator. Status: <strong>DRAFT — Pending DPO approval</strong>.</p>
      </div>
    </div>
  );
};

export default LegalPage;
