export type PatientResourceLink = {
  title: string;
  url: string;
  description: string;
};

export type ScreeningTemplate = {
  id: string;
  code: string;
  label: string;
  headline: string;
  explanation: string;
  guidance: string[];
  dontGuidance?: string[];
  nhsLinks: PatientResourceLink[];
  videoUrl?: string;
  videoTitle?: string;
  reviewMonths?: number;
  contentReviewDate?: string;
  linkExpiryValue?: number;
  linkExpiryUnit?: 'weeks' | 'months';
};

export type ImmunisationTemplate = {
  id: string;
  label: string;
  headline: string;
  explanation: string;
  guidance: string[];
  nhsLinks: PatientResourceLink[];
  videoUrl?: string;
  videoTitle?: string;
  reviewMonths?: number;
  contentReviewDate?: string;
  linkExpiryValue?: number;
  linkExpiryUnit?: 'weeks' | 'months';
};

export type LongTermConditionTemplate = {
  id: string;
  label: string;
  headline: string;
  explanation: string;
  guidance: string[];
  reviewMonths?: number;
  contentReviewDate?: string;
  importantMessage?: string;
  zones?: Array<{
    color: 'green' | 'amber' | 'red';
    title: string;
    when: string[];
    actions: string[];
  }>;
  additionalSections?: Array<{
    title: string;
    points: string[];
  }>;
  nhsLinks: PatientResourceLink[];
  videoUrl?: string;
  videoTitle?: string;
  linkExpiryValue?: number;
  linkExpiryUnit?: 'weeks' | 'months';
};

export const SCREENING_TEMPLATES: Record<string, ScreeningTemplate> = {
  cervical: {
    id: 'cervical',
    code: 'CS1',
    label: 'Cervical screening',
    headline: 'Cervical screening helps prevent cervical cancer.',
    explanation:
      'Cervical screening checks for HPV and cell changes that could lead to cancer in the future. It does not test for cancer itself.',
    guidance: [
      'Book your appointment when invited, even if you feel well.',
      'Most people have normal results and are invited again later.',
      'If follow-up is needed, your GP practice will explain the next step.',
    ],
    dontGuidance: [
      'Do not ignore your invitation because you feel well.',
      'Do not wait for your next routine contact if you have symptoms or concerns.',
    ],
    nhsLinks: [
      {
        title: 'NHS cervical screening overview',
        url: 'https://www.nhs.uk/conditions/cervical-screening/',
        description: 'What cervical screening is, who it is for, and what your results mean.',
      },
      {
        title: 'How cervical screening is done',
        url: 'https://www.nhs.uk/conditions/cervical-screening/what-happens/',
        description: 'Step-by-step guide to the appointment and what to expect.',
      },
    ],
  },
  bowel: {
    id: 'bowel',
    code: 'BS1',
    label: 'Bowel screening',
    headline: 'Bowel screening checks for signs that may need further tests.',
    explanation:
      'The NHS bowel screening programme uses a home test kit to look for hidden blood in your stool.',
    guidance: [
      'Complete and return your kit as soon as possible after it arrives.',
      'A positive result does not mean you have cancer, but more checks are needed.',
      'If symptoms change, contact your GP without waiting for routine screening.',
    ],
    dontGuidance: [
      'Do not delay returning your kit once it arrives.',
      'Do not ignore symptoms while waiting for screening or results.',
    ],
    nhsLinks: [
      {
        title: 'NHS bowel cancer screening',
        url: 'https://www.nhs.uk/conditions/bowel-cancer-screening/',
        description: 'Who is invited, how to use the kit, and understanding results.',
      },
      {
        title: 'Bowel cancer symptoms',
        url: 'https://www.nhs.uk/conditions/bowel-cancer/',
        description: 'Symptoms to watch for and when to seek urgent advice.',
      },
    ],
  },
  breast: {
    id: 'breast',
    code: 'BR1',
    label: 'Breast screening',
    headline: 'Breast screening uses X-rays (mammograms) to find changes early.',
    explanation:
      'Screening can detect breast cancer before symptoms appear, when treatment may be more effective.',
    guidance: [
      'Attend your mammogram appointment when invited.',
      'You may be asked to return for extra images, which is common.',
      'Continue to check your breasts and report new changes to your GP.',
    ],
    dontGuidance: [
      'Do not wait for your next screening invite if you notice a new breast change.',
      'Do not assume a recall for extra images means cancer has been found.',
    ],
    nhsLinks: [
      {
        title: 'NHS breast screening',
        url: 'https://www.nhs.uk/conditions/breast-screening-mammogram/',
        description: 'How mammograms work and what happens next.',
      },
      {
        title: 'Breast cancer symptoms',
        url: 'https://www.nhs.uk/conditions/breast-cancer/',
        description: 'Common symptoms and when to contact your GP.',
      },
    ],
  },
  aaa: {
    id: 'aaa',
    code: 'AA1',
    label: 'AAA screening',
    headline: 'AAA screening checks for swelling in the main blood vessel in your abdomen.',
    explanation:
      'Abdominal aortic aneurysm screening is usually offered to men at age 65 to detect aneurysms early.',
    guidance: [
      'Attend your scan appointment even if you have no symptoms.',
      'Most people have a normal result and need no further scans.',
      'If monitoring is needed, follow-up scans are arranged by the NHS programme.',
    ],
    dontGuidance: [
      'Do not skip your scan because you feel well.',
      'Do not ignore new severe abdominal or back pain while waiting for follow-up.',
    ],
    nhsLinks: [
      {
        title: 'NHS AAA screening programme',
        url: 'https://www.nhs.uk/conditions/abdominal-aortic-aneurysm-screening/',
        description: 'Who is invited, scan process, and result pathways.',
      },
      {
        title: 'Abdominal aortic aneurysm information',
        url: 'https://www.nhs.uk/conditions/abdominal-aortic-aneurysm/',
        description: 'Symptoms, treatment, and when to seek urgent care.',
      },
    ],
  },
  diabetic_eye: {
    id: 'diabetic_eye',
    code: 'DE1',
    label: 'Diabetic eye screening',
    headline: 'Diabetic eye screening checks for changes caused by diabetes.',
    explanation:
      'The screening test looks for diabetic retinopathy, which can damage sight if not treated early.',
    guidance: [
      'Attend annual eye screening when invited.',
      'Bring sunglasses as drops can blur vision for a few hours.',
      'Keep blood sugar, blood pressure, and cholesterol controlled to protect your eyes.',
    ],
    dontGuidance: [
      'Do not drive until your vision is clear after the eye drops.',
      'Do not skip screening because your sight seems normal.',
    ],
    nhsLinks: [
      {
        title: 'NHS diabetic eye screening',
        url: 'https://www.nhs.uk/conditions/diabetic-eye-screening/',
        description: 'What happens during screening and what the results mean.',
      },
      {
        title: 'Diabetic retinopathy',
        url: 'https://www.nhs.uk/conditions/diabetic-retinopathy/',
        description: 'How diabetes can affect your eyes and treatment options.',
      },
    ],
  },
};

export const getDefaultScreeningCode = (templateId: string) => {
  if (SCREENING_TEMPLATES[templateId]?.code) {
    return SCREENING_TEMPLATES[templateId].code;
  }

  const compact = templateId
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 3);

  return `${compact || 'SC'}1`;
};

export const withScreeningTemplateDefaults = (template: ScreeningTemplate): ScreeningTemplate => ({
  ...template,
  code: template.code?.trim() || getDefaultScreeningCode(template.id),
});

export const hydrateScreeningTemplate = (template: ScreeningTemplate): ScreeningTemplate => {
  return withScreeningTemplateDefaults(template);
};

const normalizeScreeningIdentifier = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

export const findScreeningTemplateByIdentifier = (
  identifier: string,
  templates: ScreeningTemplate[],
): ScreeningTemplate | null => {
  const normalized = normalizeScreeningIdentifier(identifier);
  if (!normalized) return null;

  return templates.find((template) => {
    const hydrated = withScreeningTemplateDefaults(template);
    return (
      normalizeScreeningIdentifier(hydrated.id) === normalized ||
      normalizeScreeningIdentifier(hydrated.code) === normalized
    );
  }) || null;
};

export const IMMUNISATION_TEMPLATES: Record<string, ImmunisationTemplate> = {
  flu: {
    id: 'flu',
    label: 'Flu vaccine',
    headline: 'The flu vaccine lowers your risk of serious flu illness.',
    explanation:
      'Flu strains change each year, so the vaccine is updated and usually offered every autumn/winter.',
    guidance: [
      'A sore arm and mild temperature are common and usually settle quickly.',
      'Seek urgent help for severe allergic symptoms such as breathing difficulty.',
      'Continue good hand hygiene and stay home if unwell.',
    ],
    nhsLinks: [
      {
        title: 'NHS flu vaccine',
        url: 'https://www.nhs.uk/vaccinations/flu-vaccine/',
        description: 'Eligibility, side effects, and how to book.',
      },
    ],
  },
  covid: {
    id: 'covid',
    label: 'COVID-19 vaccine',
    headline: 'COVID-19 vaccination helps protect against severe illness.',
    explanation:
      'Protection can reduce over time, so seasonal booster programmes target people at higher risk.',
    guidance: [
      'Common side effects include tiredness, headache, and arm pain.',
      'Most symptoms improve within 1 to 2 days.',
      'Follow public health advice if you develop respiratory symptoms.',
    ],
    nhsLinks: [
      {
        title: 'NHS COVID-19 vaccine',
        url: 'https://www.nhs.uk/vaccinations/covid-19-vaccine/',
        description: 'Current eligibility, booking, and side effect guidance.',
      },
    ],
  },
  shingles: {
    id: 'shingles',
    label: 'Shingles vaccine',
    headline: 'Shingles vaccination reduces your chance of shingles and complications.',
    explanation:
      'Shingles can cause long-lasting nerve pain. Vaccination is offered to older adults and eligible risk groups.',
    guidance: [
      'Mild side effects are common and usually short-lived.',
      'Contact your GP if you develop a painful blistering rash.',
      'Pain persisting after shingles should be reviewed promptly.',
    ],
    nhsLinks: [
      {
        title: 'NHS shingles vaccine',
        url: 'https://www.nhs.uk/vaccinations/shingles-vaccine/',
        description: 'Who can have it, how it works, and side effects.',
      },
    ],
  },
  pneumo: {
    id: 'pneumo',
    label: 'Pneumococcal vaccine',
    headline: 'Pneumococcal vaccination helps protect against serious infections.',
    explanation:
      'It protects against illnesses such as pneumonia, meningitis, and bloodstream infection caused by pneumococcal bacteria.',
    guidance: [
      'A sore arm and mild fever can happen after vaccination.',
      'Speak to your GP if you are unsure whether you need a booster.',
      'Seek urgent care if you feel very unwell after vaccination.',
    ],
    nhsLinks: [
      {
        title: 'NHS pneumococcal vaccine',
        url: 'https://www.nhs.uk/vaccinations/pneumococcal-vaccine/',
        description: 'Eligibility, schedules, and aftercare advice.',
      },
    ],
  },
  pertussis: {
    id: 'pertussis',
    label: 'Whooping cough vaccine (pregnancy)',
    headline: 'Pertussis vaccination in pregnancy protects newborn babies.',
    explanation:
      'Vaccination in pregnancy helps pass antibodies to your baby before birth.',
    guidance: [
      'The vaccine is usually offered from around 16 weeks in pregnancy.',
      'A sore arm is common after injection.',
      'Contact your maternity team with any concerns after vaccination.',
    ],
    nhsLinks: [
      {
        title: 'NHS whooping cough vaccine in pregnancy',
        url: 'https://www.nhs.uk/pregnancy/keeping-well/whooping-cough-vaccination/',
        description: 'When to have it and how it protects your baby.',
      },
    ],
  },
  mmr: {
    id: 'mmr',
    label: 'MMR vaccine',
    headline: 'MMR protects against measles, mumps and rubella.',
    explanation:
      'Two doses provide strong protection and help prevent outbreaks in the community.',
    guidance: [
      'Mild fever or rash can happen after vaccination.',
      'Check your records if you are unsure whether two doses were given.',
      'Seek medical advice if severe symptoms occur after vaccination.',
    ],
    nhsLinks: [
      {
        title: 'NHS MMR vaccine',
        url: 'https://www.nhs.uk/vaccinations/mmr-vaccine/',
        description: 'Who should get MMR and what side effects to expect.',
      },
    ],
  },
  hpv: {
    id: 'hpv',
    label: 'HPV vaccine',
    headline: 'HPV vaccination helps prevent cancers caused by HPV.',
    explanation:
      'The vaccine protects against types of HPV linked to cervical and other cancers.',
    guidance: [
      'The vaccine works best before exposure to HPV.',
      'Mild side effects such as arm pain are common and short-lived.',
      'Continue cervical screening invitations when eligible, even after vaccination.',
    ],
    nhsLinks: [
      {
        title: 'NHS HPV vaccine',
        url: 'https://www.nhs.uk/vaccinations/hpv-vaccine/',
        description: 'Eligibility, dose schedule, and long-term protection.',
      },
    ],
  },
};

export const LONG_TERM_CONDITION_TEMPLATES: Record<string, LongTermConditionTemplate> = {
  asthma: {
    id: 'asthma',
    label: 'Asthma',
    headline: 'Use your written asthma action plan every day and know what to do if symptoms worsen.',
    explanation:
      'Based on the Adult Asthma Action Plan leaflet, asthma control depends on taking preventer treatment daily, watching for worsening signs early, and acting fast in an attack.',
    guidance: [
      'Book an asthma review at least once a year, and sooner after A&E attendance or oral steroids.',
      'Bring your action plan, inhalers, spacers, peak flow meter, and questions to each review.',
      'If symptoms worsen: restart regular preventer use, use reliever as advised, and seek same-day review if not improving.',
      'In an asthma attack: sit up, stay calm, use 1 puff of blue reliever every 30–60 seconds up to 10 puffs, and call 999 if not improving.',
      'After an attack: contact GP/111 the same day, or arrange review within 48 hours after hospital discharge.',
    ],
    importantMessage:
      'Urgent: if you need your reliever more often than every 4 hours, take emergency action now. Call 999 if symptoms are severe or not improving.',
    zones: [
      {
        color: 'green',
        title: 'Green zone: daily routine (well controlled)',
        when: [
          'No symptoms in day or night and daily activities are not limited.',
          'Using reliever only when needed.',
          'Peak flow at or near personal best.',
        ],
        actions: [
          'Take preventer inhaler every day, even when feeling well.',
          'Keep action plan up to date and bring inhalers/spacer/peak-flow meter to reviews.',
          'Book routine asthma review at least once a year.',
          'If symptom-free and no reliever use for 12 weeks, discuss dose review with clinician.',
        ],
      },
      {
        color: 'amber',
        title: 'Amber zone: asthma getting worse',
        when: [
          'Wheeze, chest tightness, breathlessness, or persistent cough.',
          'Night waking with asthma symptoms.',
          'Symptoms affecting work/exercise or daily activities.',
          'Reliever needed 3 times a week or more.',
          'Peak flow below personal best warning level.',
        ],
        actions: [
          'Restart regular preventer use immediately if it has lapsed.',
          'If already taking preventer, increase to agreed temporary higher dose.',
          'Use reliever as needed, up to stated puffs every 4 hours.',
          'Carry reliever (and spacer if used) whenever out.',
          'See GP or asthma nurse within 24 hours if worsening or not settling.',
          'Seek review if symptoms continue after 7 days.',
        ],
      },
      {
        color: 'red',
        title: 'Red zone: asthma attack (emergency)',
        when: [
          'Reliever is not helping, or effect does not last 4 hours.',
          'Difficulty breathing, speaking, or walking.',
          'Severe wheeze/chest tightness/cough.',
          'Peak flow in attack range.',
        ],
        actions: [
          'Sit up and try to stay calm.',
          'Take 1 puff of blue reliever every 30–60 seconds up to 10 puffs.',
          'If worse at any point, or not better after 10 puffs, call 999 for ambulance.',
          'If no blue reliever available, call 999 immediately.',
          'If ambulance not arrived after 10 minutes and no improvement, repeat 10 puffs.',
          'If still not better, call 999 again immediately.',
          'After any attack: contact GP/111 the same day; if hospital-treated, arrange review within 48 hours of discharge.',
        ],
      },
    ],
    additionalSections: [
      {
        title: 'Triggers and prevention',
        points: [
          'Try to avoid known asthma triggers and keep allergy triggers under control.',
          'Share your action plan with family/friends/workplace so others know how to help.',
          'Keep a copy available at home and a photo on your phone.',
          'Set reminders for medicines and action-plan checks.',
        ],
      },
      {
        title: 'Review and support',
        points: [
          'Book an urgent review after steroid tablets or A&E attendance.',
          'Call 111 when surgery is closed if worried about asthma.',
          'Asthma + Lung UK nurse support line: 0300 222 5800 (Mon–Fri).',
        ],
      },
    ],
    nhsLinks: [
      {
        title: 'NHS asthma',
        url: 'https://www.nhs.uk/conditions/asthma/',
        description: 'Symptoms, treatment, inhalers, and what to do when asthma gets worse.',
      },
      {
        title: 'NHS asthma attack advice',
        url: 'https://www.nhs.uk/conditions/asthma/asthma-attack/',
        description: 'Emergency signs, immediate steps, and when to call 999.',
      },
      {
        title: 'Adult Asthma Action Plan leaflet',
        url: 'https://cdn.shopify.com/s/files/1/0221/4446/files/Adult_Asthma_Plan_A4_trifold_DIGITAL.pdf?v=1707323842',
        description: 'Patient action plan template with daily routine, worsening symptoms, and attack steps.',
      },
    ],
  },
  diabetes: {
    id: 'diabetes',
    label: 'Diabetes',
    headline: 'Diabetes reviews help reduce long-term complications and keep you well.',
    explanation:
      'Regular monitoring of HbA1c, blood pressure, cholesterol, kidneys, feet, and eyes helps detect problems early and supports safer self-management.',
    guidance: [
      'Attend annual diabetes review and make sure all routine checks are completed.',
      'Take medication as prescribed and discuss side effects promptly.',
      'Check glucose as advised and look out for signs of high or low blood sugar.',
      'Seek urgent advice if you are unwell, vomiting, dehydrated, or unable to keep fluids down.',
    ],
    importantMessage:
      'If you feel very unwell, drowsy, confused, or have persistent vomiting, seek urgent medical advice immediately.',
    nhsLinks: [
      {
        title: 'NHS type 2 diabetes',
        url: 'https://www.nhs.uk/conditions/type-2-diabetes/',
        description: 'Managing blood sugar, treatment options, and lifestyle support.',
      },
      {
        title: 'NHS type 1 diabetes',
        url: 'https://www.nhs.uk/conditions/type-1-diabetes/',
        description: 'Insulin treatment, glucose checks, and day-to-day management.',
      },
      {
        title: 'NHS diabetic eye screening',
        url: 'https://www.nhs.uk/conditions/diabetic-eye-screening/',
        description: 'Why annual eye screening matters and what to expect.',
      },
    ],
  },
};
