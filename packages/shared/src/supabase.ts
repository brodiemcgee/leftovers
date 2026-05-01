import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';
import { env } from './env.js';

export type LeftoversSupabaseClient = SupabaseClient<Database>;

/**
 * Service-role client. Bypasses RLS — only use from trusted server-side code
 * (Vercel Edge Functions, sync workers). Never ship the service role key to a
 * client.
 */
export function createServiceClient(): LeftoversSupabaseClient {
  return createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-leftovers-context': 'service' } },
  });
}

/**
 * User-scoped client. Pass the user's access token; RLS enforces row visibility.
 */
export function createUserClient(accessToken: string): LeftoversSupabaseClient {
  return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-leftovers-context': 'user',
      },
    },
  });
}
