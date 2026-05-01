import { createClient } from '@supabase/supabase-js';

// In Vite, we use import.meta.env to read the .env file (instead of process.env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail fast (otherwise auth/data calls can appear to "hang" on an invalid URL).
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables. Check flowtracker/.env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).");
}

const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_SUPABASE_TIMEOUT_MS) || 8000;

function withTimeout(timeoutMs: number, signal?: AbortSignal) {
  const controller = new AbortController();

  // If an upstream signal aborts, propagate it.
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeoutId) };
}

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const { signal, clear } = withTimeout(DEFAULT_TIMEOUT_MS, init?.signal);
  try {
    return await fetch(input, { ...init, signal });
  } finally {
    clear();
  }
};

// Create and export the database connection.
// In dev, Vite HMR can re-evaluate modules and create multiple clients, which can cause auth lock races.
// Cache the client on globalThis to keep a true singleton.
type SupabaseClientType = ReturnType<typeof createClient>;
const globalKey = "__workflow_supabase__";
const cached = (globalThis as any)[globalKey] as SupabaseClientType | undefined;

const client =
  cached ??
  createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Avoid "steal" lock races when network is slow or when HMR has reloaded modules.
    // Increase this so auth doesn't aggressively steal locks mid-operation.
    lockAcquireTimeout: Number(import.meta.env.VITE_SUPABASE_LOCK_TIMEOUT_MS) || 60000,
    // Workaround for auth-js lock races in dev/HMR: disable background refresh locally.
    // Sessions still persist; users can re-login if the token expires during local dev.
    autoRefreshToken: import.meta.env.DEV ? false : true,
  },
  global: {
    // Prevent the UI from being stuck forever if the network/DNS is blocked.
    fetch: fetchWithTimeout,
  },
});

if (import.meta.env.DEV) {
  (globalThis as any)[globalKey] = client;
}

export const supabase = client;
