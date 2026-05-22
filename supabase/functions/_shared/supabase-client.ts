import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Create a Supabase client with the service role key.
 * Used in Edge Functions for admin-level operations that bypass RLS.
 */
export function createServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
      Deno.env.get('SUPABASE_SECRET_KEY') ||
      Deno.env.get('SB_SECRET_KEY')!,
  );
}

/**
 * Create a Supabase client using the caller's JWT token.
 * Used for operations that should respect RLS.
 */
export function createUserClient(authHeader: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SB_PUBLISHABLE_KEY') ||
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
      Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

/**
 * Extract and verify the user ID from the Authorization header.
 * Returns the user object or throws.
 */
export async function getAuthUser(authHeader: string | null) {
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SB_PUBLISHABLE_KEY') ||
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
      Deno.env.get('SUPABASE_ANON_KEY')!,
  );

  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  const email = typeof data?.claims?.email === 'string' ? data.claims.email : undefined;

  if (error || !userId) {
    throw new Error('Invalid or expired token');
  }

  return {
    id: userId,
    email,
    user_metadata: {},
  };
}

/** Standard CORS headers for Edge Functions. */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** JSON response helper. */
export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Error response helper. */
export function errorResponse(message: string, status = 400) {
  if (status >= 500) {
    const safeMessage = message.includes(':') ? message.split(':')[0] : message;
    return jsonResponse({ error: safeMessage }, status);
  }

  return jsonResponse({ error: message }, status);
}
