import { createClient } from '@supabase/supabase-js';

// In Vite, we use import.meta.env to read the .env file (instead of process.env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Verify that the variables are actually loaded
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables! Check your .env file.");
}

// Create and export the database connection
export const supabase = createClient(supabaseUrl, supabaseAnonKey);