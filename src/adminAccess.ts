import { supabase } from './supabase';

export type GlobalAdminRole = 'owner' | 'admin';

export type CurrentAdminProfile = {
  globalRole: GlobalAdminRole | null;
  isGpRatifier: boolean;
};

export const isGlobalAdminRole = (value: unknown): value is GlobalAdminRole =>
  value === 'owner' || value === 'admin';

export const getCurrentUserAdminProfile = async (uid: string): Promise<CurrentAdminProfile | null> => {
  const { data, error } = await supabase
    .from('users')
    .select('global_role, is_gp_ratifier')
    .eq('uid', uid)
    .maybeSingle();

  if (error) {
    console.error('Unable to verify administrator access:', error);
    return null;
  }

  const globalRole = isGlobalAdminRole(data?.global_role) ? data.global_role : null;
  const isGpRatifier = data?.is_gp_ratifier === true;

  if (!globalRole && !isGpRatifier) return null;

  return {
    globalRole,
    isGpRatifier,
  };
};

export const getCurrentUserAdminRole = async (uid: string): Promise<GlobalAdminRole | null> =>
  (await getCurrentUserAdminProfile(uid))?.globalRole ?? null;
