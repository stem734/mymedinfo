import { supabase } from './supabase';

export type GlobalAdminRole = 'owner' | 'admin';

export const isGlobalAdminRole = (value: unknown): value is GlobalAdminRole =>
  value === 'owner' || value === 'admin';

export const getCurrentUserAdminRole = async (uid: string): Promise<GlobalAdminRole | null> => {
  const { data, error } = await supabase
    .from('users')
    .select('global_role')
    .eq('uid', uid)
    .maybeSingle();

  if (error) {
    console.error('Unable to verify administrator access:', error);
    return null;
  }

  return isGlobalAdminRole(data?.global_role) ? data.global_role : null;
};
