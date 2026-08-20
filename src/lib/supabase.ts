import { createClient } from '@supabase/supabase-js';

const envUrl = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_URL : undefined;
const envKey = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_ANON_KEY : undefined;

const nodeUrl = typeof process !== 'undefined' && process.env ? process.env.VITE_SUPABASE_URL : undefined;
const nodeKey = typeof process !== 'undefined' && process.env ? process.env.VITE_SUPABASE_ANON_KEY : undefined;

const supabaseUrl = envUrl || nodeUrl || 'https://txwxtsdsbuddqfrtllsf.supabase.co';
const supabaseAnonKey = envKey || nodeKey || 'sb_publishable_ahamP8gR3qcYvJx0ulaMvw_yRn42OWB';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables! Check your .env file.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// NOTE: Service-role-level operations must use Edge Functions,
// which have SUPABASE_SERVICE_ROLE_KEY injected at runtime.
// Do NOT add an admin client here — it would expose the key to the client bundle.