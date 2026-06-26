export type CardTemplateBuilderType = 'healthcheck' | 'screening' | 'immunisation' | 'ltc' | 'medication';

export type HealthCheckBuilderLink = {
  title: string;
  showTitleOnCard?: boolean;
  phone?: string;
  phoneLabel?: string;
  email?: string;
  emailLabel?: string;
  website?: string;
  websiteLabel?: string;
  city?: string;
  county_area?: string;
};

export type HealthCheckBuilderVariant = {
  resultCode: string;
  resultsMessage: string;
  importantText: string;
  whatIsTitle: string;
  whatIsText: string;
  nextStepsTitle: string;
  nextStepsText: string;
  links: HealthCheckBuilderLink[];
};

export type HealthCheckTemplatePayload = {
  variants: Record<string, HealthCheckBuilderVariant>;
  reviewMonths?: number;
  contentReviewDate?: string;
  linkExpiryValue?: number;
  linkExpiryUnit?: 'weeks' | 'months';
};

export type CardTemplateRecord<T = unknown> = {
  template_key: string;
  builder_type: CardTemplateBuilderType;
  template_id: string;
  label: string;
  payload: T;
  version: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  is_gp_ratified?: boolean;
  gp_ratified_at?: string | null;
  gp_ratified_by?: string | null;
};

export type CardTemplateRevisionRecord<T = unknown> = {
  id: string;
  template_key: string;
  builder_type: CardTemplateBuilderType;
  template_id: string;
  label: string;
  version: number;
  action: 'created' | 'updated' | 'restored' | 'deleted';
  payload: T;
  restored_from_revision_id: string | null;
  created_at: string;
  created_by: string | null;
};
