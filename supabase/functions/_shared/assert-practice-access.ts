import { createServiceClient, createUserClient, getAuthUser } from './supabase-client.ts';

export type PracticeUserRole = 'admin' | 'gp' | 'editor';

export async function assertPracticeAccess(authHeader: string | null, practiceId: string) {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }

  const user = await getAuthUser(authHeader);
  const userClient = createUserClient(authHeader!);

  const { data: membership, error: membershipError } = await userClient
    .from('practice_memberships')
    .select('practice_id, role, is_gp')
    .eq('practice_id', practiceId)
    .eq('user_uid', user.id)
    .single();

  if (membershipError || !membership) {
    throw new Error('Practice access required');
  }

  const supabase = createServiceClient();
  const { data: practiceUser, error: practiceUserError } = await supabase
    .from('users')
    .select('uid, is_active')
    .eq('uid', user.id)
    .single();

  if (practiceUserError || !practiceUser) {
    throw new Error('User account not found');
  }

  if (!practiceUser.is_active) {
    throw new Error('User account is inactive');
  }

  return {
    userId: user.id,
    role: membership.role as PracticeUserRole,
    isGp: membership.is_gp === true || membership.role === 'gp',
  };
}

export async function assertClinicalRatifier(authHeader: string | null, practiceId: string) {
  const access = await assertPracticeAccess(authHeader, practiceId);

  if (!access.isGp) {
    throw new Error('A GP role is required to clinically ratify patient cards');
  }

  return access;
}
