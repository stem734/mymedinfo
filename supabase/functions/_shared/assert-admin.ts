import { createServiceClient, getAuthUser } from './supabase-client.ts';

export type AdminRecord = {
  uid: string;
  email: string;
  name: string;
  is_active: boolean;
  global_role: 'owner' | 'admin';
  is_gp_ratifier?: boolean;
  created_at: string;
  updated_at: string;
};

export type GlobalCardEditorRecord = Omit<AdminRecord, 'global_role'> & {
  global_role: 'owner' | 'admin' | null;
};

/**
 * Verify the caller is an active admin.
 *
 * As a controlled fallback, the first owner can be seeded when no owner/admin
 * exists yet, but ONLY for an email explicitly allow-listed in the
 * BOOTSTRAP_ADMIN_EMAILS secret. Arbitrary authenticated users are never
 * auto-promoted.
 *
 * Returns the admin record on success; throws on failure.
 */
export async function assertAdmin(authHeader: string | null): Promise<{ admin: AdminRecord; userId: string }> {
  const user = await getAuthUser(authHeader);
  const supabase = createServiceClient();

  // Check if user is already an admin
  const { data: admin } = await supabase
    .from('users')
    .select('*')
    .eq('uid', user.id)
    .in('global_role', ['owner', 'admin'])
    .single();

  if (admin) {
    if (!admin.is_active) {
      throw new Error('Administrator account is inactive');
    }
    return { admin: admin as AdminRecord, userId: user.id };
  }

  // Controlled bootstrap. A user is ONLY ever auto-promoted to owner when BOTH:
  //   1. their email is explicitly listed in the BOOTSTRAP_ADMIN_EMAILS secret, and
  //   2. no owner/admin exists yet.
  // Every Edge Function runs with verify_jwt = false, so this in-code check is
  // the only gate — it must fail closed. Without the allow-list we never silently
  // promote an authenticated user, even if the users table has been emptied.
  // Leave BOOTSTRAP_ADMIN_EMAILS unset in normal operation; set it only to seed
  // or recover the first owner, then unset it again.
  const bootstrapEmails = (Deno.env.get('BOOTSTRAP_ADMIN_EMAILS') || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const callerEmail = (user.email || '').toLowerCase();

  if (bootstrapEmails.length === 0 || !callerEmail || !bootstrapEmails.includes(callerEmail)) {
    throw new Error('Administrator access required');
  }

  const { count } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .in('global_role', ['owner', 'admin']);

  if ((count ?? 0) > 0) {
    throw new Error('Administrator access required');
  }

  const now = new Date().toISOString();
  const bootstrapAdmin: AdminRecord = {
    uid: user.id,
    email: user.email || '',
    name: user.user_metadata?.name || user.email || 'Primary Administrator',
    is_active: true,
    global_role: 'owner',
    is_gp_ratifier: false,
    created_at: now,
    updated_at: now,
  };

  const { error } = await supabase.from('users').insert(bootstrapAdmin);
  if (error) throw new Error(`Failed to bootstrap admin: ${error.message}`);

  return { admin: bootstrapAdmin, userId: user.id };
}

export async function assertAdminOrGpRatifier(authHeader: string | null): Promise<{ admin: GlobalCardEditorRecord; userId: string }> {
  const user = await getAuthUser(authHeader);
  const supabase = createServiceClient();

  const { data: admin } = await supabase
    .from('users')
    .select('*')
    .eq('uid', user.id)
    .single();

  if (!admin) {
    throw new Error('Administrator or GP ratifier access required');
  }

  if (!admin.is_active) {
    throw new Error('Account is inactive');
  }

  if (admin.global_role !== 'owner' && admin.global_role !== 'admin' && admin.is_gp_ratifier !== true) {
    throw new Error('Administrator or GP ratifier access required');
  }

  return { admin: admin as GlobalCardEditorRecord, userId: user.id };
}
