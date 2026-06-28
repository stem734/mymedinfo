import { supabase } from './supabase';
import type { CardTemplateBuilderType } from './cardTemplateTypes';

export type PracticeCardTemplateRow<T = unknown> = {
  practice_id: string;
  builder_type: Exclude<CardTemplateBuilderType, 'medication'>;
  template_id: string;
  source_type: 'custom';
  label: string;
  payload: T;
  disclaimer_version: string;
  accepted_at?: string | null;
  accepted_by?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

export type PracticeTemplateBuilderType = PracticeCardTemplateRow['builder_type'];

export async function fetchPracticeCardTemplates<T = unknown>(
  practiceId: string,
  builderType?: PracticeTemplateBuilderType,
): Promise<PracticeCardTemplateRow<T>[]> {
  let query = supabase
    .from('practice_card_templates')
    .select('*')
    .eq('practice_id', practiceId)
    .order('builder_type', { ascending: true })
    .order('template_id', { ascending: true });

  if (builderType) {
    query = query.eq('builder_type', builderType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as PracticeCardTemplateRow<T>[];
}

export async function fetchPatientPracticeCardTemplates<T = unknown>(
  practiceIdentifier: string,
  builderType: PracticeTemplateBuilderType,
  templateIds?: string[],
): Promise<PracticeCardTemplateRow<T>[]> {
  if (!practiceIdentifier.trim()) {
    return [];
  }

  const { data, error } = await supabase.rpc('resolve_practice_card_templates', {
    org_name: practiceIdentifier,
    requested_builder_type: builderType,
    requested_template_ids: templateIds && templateIds.length > 0 ? templateIds : null,
  });

  if (error) throw error;
  return (Array.isArray(data) ? data : []) as PracticeCardTemplateRow<T>[];
}

export async function savePracticeCardTemplate<T = unknown>(params: {
  practiceId: string;
  builderType: PracticeTemplateBuilderType;
  templateId: string;
  label: string;
  payload: T;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();

  const { error } = await supabase.from('practice_card_templates').upsert({
    practice_id: params.practiceId,
    builder_type: params.builderType,
    template_id: params.templateId,
    source_type: 'custom',
    label: params.label,
    payload: params.payload,
    disclaimer_version: 'custom_v1',
    accepted_at: now,
    accepted_by: user?.id || null,
    updated_at: now,
    updated_by: user?.id || null,
  }, { onConflict: 'practice_id,builder_type,template_id' });

  if (error) throw error;
}

export async function clearPracticeCardTemplate(
  practiceId: string,
  builderType: PracticeTemplateBuilderType,
  templateId: string,
): Promise<void> {
  const { error } = await supabase
    .from('practice_card_templates')
    .delete()
    .eq('practice_id', practiceId)
    .eq('builder_type', builderType)
    .eq('template_id', templateId);

  if (error) throw error;
}
