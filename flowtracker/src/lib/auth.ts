import { supabase } from './supabase';
import { createClient } from '@supabase/supabase-js';

// Secret Admin connection that prevents login bugs
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const adminSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export const authService = {
  signUp: async (formData: any) => {
    await supabase.auth.signOut(); // Wipes stuck sessions so it never crashes
    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: { data: { name: formData.name, phone: formData.phone || "N/A", department: formData.department || "Unassigned" } }
    });
    if (error) throw error;
    return data;
  },

  signIn: async (email: string, password: string) => {
    await supabase.auth.signOut(); // Wipes stuck sessions so switching accounts works
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) throw authError;

    const { data: profileData, error: profileError } = await supabase.from('profiles').select('role').eq('id', authData.user.id).single();
    if (profileError || !profileData) return { user: authData.user, role: 'employee' };
    return { user: authData.user, role: profileData.role };
  },

  adminCreateUser: async (formData: any) => {
    // Admin creates users without logging themselves out
    const { data, error } = await adminSupabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: { data: { name: formData.name, phone: formData.phone || "N/A", department: formData.department || "Unassigned" } }
    });
    if (error) throw error;
    if (data.user && formData.role) {
      await supabase.from('profiles').update({ role: formData.role }).eq('id', data.user.id);
    }
    return data;
  },

  signOut: async () => {
    await supabase.auth.signOut();
  }
};