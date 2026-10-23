import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey || url.includes('your-project-id') || serviceKey.includes('...')) {
    return null;
  }

  if (!cachedAdmin) {
    cachedAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedAdmin;
}
