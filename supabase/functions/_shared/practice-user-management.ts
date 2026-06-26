import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const normaliseEmail = (value: string) => value.trim().toLowerCase();

export const PRACTICE_USER_ROLES = ['admin', 'editor'] as const;
export type PracticeUserRole = typeof PRACTICE_USER_ROLES[number];

export const normalisePracticeRole = (value: unknown): PracticeUserRole =>
  value === 'editor' ? 'editor' : 'admin';

export const uniquePracticeIds = (practiceIds: string[]) =>
  Array.from(new Set(practiceIds.map((practiceId) => practiceId.trim()).filter(Boolean)));

type PracticeIdRow = {
  id: string;
};

type AppUserRow = {
  uid: string;
  email: string;
  name: string;
  is_active: boolean;
  global_role?: 'owner' | 'admin' | null;
  is_gp_ratifier?: boolean | null;
};

type PracticeMembershipRow = {
  practice_id: string;
  is_default?: boolean;
};

export async function assertPracticeIdsExist(supabase: SupabaseClient, practiceIds: string[]) {
  const ids = uniquePracticeIds(practiceIds);

  if (ids.length === 0) {
    throw new Error('At least one practice must be assigned');
  }

  const { data, error } = await supabase
    .from('practices')
    .select('id')
    .in('id', ids);

  if (error) {
    throw new Error(`Failed to validate practices: ${error.message}`);
  }

  if ((((data || []) as unknown) as PracticeIdRow[]).length !== ids.length) {
    throw new Error('One or more selected practices do not exist');
  }

  return ids;
}

export async function assertNoOtherUserWithEmail(
  supabase: SupabaseClient,
  email: string,
  ignoreUid?: string,
) {
  let query = supabase
    .from('users')
    .select('uid, email')
    .ilike('email', email)
    .limit(1);

  if (ignoreUid) {
    query = query.neq('uid', ignoreUid);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Failed to validate user email: ${error.message}`);
  }

  if ((data as AppUserRow | null)?.uid) {
    throw new Error('This email address already belongs to another user');
  }
}

export async function loadUserByEmail(supabase: SupabaseClient, email: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load user: ${error.message}`);
  }

  return ((data as unknown) as AppUserRow | null);
}

export async function loadUserByUid(supabase: SupabaseClient, uid: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('uid', uid)
    .single();

  if (error) {
    throw new Error(`Failed to load user: ${error.message}`);
  }

  return data as AppUserRow;
}

function resolveDefaultPracticeId(
  practiceIds: string[],
  requestedDefaultPracticeId?: string,
  fallbackDefaultPracticeId?: string,
) {
  if (requestedDefaultPracticeId && practiceIds.includes(requestedDefaultPracticeId)) {
    return requestedDefaultPracticeId;
  }

  if (fallbackDefaultPracticeId && practiceIds.includes(fallbackDefaultPracticeId)) {
    return fallbackDefaultPracticeId;
  }

  return practiceIds[0];
}

export async function addPracticeMemberships(
  supabase: SupabaseClient,
  userUid: string,
  practiceIds: string[],
  defaultPracticeId?: string,
  role: PracticeUserRole = 'admin',
) {
  const ids = uniquePracticeIds(practiceIds);
  const now = new Date().toISOString();

  const { data: existingMemberships, error: existingError } = await supabase
    .from('practice_memberships')
    .select('practice_id, is_default')
    .eq('user_uid', userUid);

  if (existingError) {
    throw new Error(`Failed to load existing memberships: ${existingError.message}`);
  }

  const membershipRows = ((existingMemberships || []) as unknown) as PracticeMembershipRow[];
  const mergedIds = Array.from(new Set([...membershipRows.map((membership) => membership.practice_id), ...ids]));
  const currentDefaultPracticeId = membershipRows.find((membership) => membership.is_default)?.practice_id;
  const resolvedDefaultPracticeId = resolveDefaultPracticeId(mergedIds, defaultPracticeId, currentDefaultPracticeId);

  const { error: clearDefaultError } = await supabase
    .from('practice_memberships')
    .update({ is_default: false, updated_at: now })
    .eq('user_uid', userUid)
    .eq('is_default', true);

  if (clearDefaultError) {
    throw new Error(`Failed to clear existing default practice: ${clearDefaultError.message}`);
  }

  const payload = mergedIds.map((practiceId) => ({
    practice_id: practiceId,
    user_uid: userUid,
    role,
    is_default: practiceId === resolvedDefaultPracticeId,
    updated_at: now,
  }));

  const { error: membershipError } = await supabase
    .from('practice_memberships')
    .upsert(payload, { onConflict: 'practice_id,user_uid' });

  if (membershipError) {
    throw new Error(`Failed to upsert memberships: ${membershipError.message}`);
  }
}

export async function replacePracticeMemberships(
  supabase: SupabaseClient,
  userUid: string,
  practiceIds: string[],
  defaultPracticeId?: string,
  role: PracticeUserRole = 'admin',
) {
  const ids = uniquePracticeIds(practiceIds);
  const now = new Date().toISOString();
  const resolvedDefaultPracticeId = resolveDefaultPracticeId(ids, defaultPracticeId);

  const { data: existingMemberships, error: existingError } = await supabase
    .from('practice_memberships')
    .select('practice_id')
    .eq('user_uid', userUid);

  if (existingError) {
    throw new Error(`Failed to load memberships: ${existingError.message}`);
  }

  const existingIds = (((existingMemberships || []) as unknown) as PracticeMembershipRow[])
    .map((membership) => membership.practice_id);
  const idsToDelete = existingIds.filter((practiceId: string) => !ids.includes(practiceId));

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('practice_memberships')
      .delete()
      .eq('user_uid', userUid)
      .in('practice_id', idsToDelete);

    if (deleteError) {
      throw new Error(`Failed to remove memberships: ${deleteError.message}`);
    }
  }

  const { error: clearDefaultError } = await supabase
    .from('practice_memberships')
    .update({ is_default: false, updated_at: now })
    .eq('user_uid', userUid);

  if (clearDefaultError) {
    throw new Error(`Failed to clear default membership: ${clearDefaultError.message}`);
  }

  if (ids.length === 0) {
    return;
  }

  const payload = ids.map((practiceId) => ({
    practice_id: practiceId,
    user_uid: userUid,
    role,
    is_default: practiceId === resolvedDefaultPracticeId,
    updated_at: now,
  }));

  const { error: membershipError } = await supabase
    .from('practice_memberships')
    .upsert(payload, { onConflict: 'practice_id,user_uid' });

  if (membershipError) {
    throw new Error(`Failed to save memberships: ${membershipError.message}`);
  }
}
