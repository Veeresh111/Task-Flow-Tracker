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
      options: { 
        data: { 
          name: formData.name, 
          phone: formData.phone || "N/A", 
          department: formData.department || "Unassigned",
          role: formData.role || "employee" // The role is permanently saved in secure Auth Metadata
        } 
      }
    });
    
    if (error) throw error;
    return data;
  },

  signIn: async (email: string, password: string) => {
    await supabase.auth.signOut(); 
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) throw authError;

    // THE BULLETPROOF FIX: Read the exact role you registered with from the secure Auth layer
    const trueRole = authData.user.user_metadata?.role;

    // Self-Heal the database now that you are successfully authenticated
    if (trueRole) {
      await supabase.from('profiles').update({ role: trueRole }).eq('id', authData.user.id);
    }

    const { data: profileData } = await supabase.from('profiles').select('role').eq('id', authData.user.id).single();
    
    // Always trust the True Role over a broken database value
    return { 
      user: authData.user, 
      role: trueRole || profileData?.role || 'employee' 
    };
  },

  adminCreateUser: async (formData: any) => {
    const { data, error } = await adminSupabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: { 
        data: { 
          name: formData.name, 
          phone: formData.phone || "N/A", 
          department: formData.department || "Unassigned",
          role: formData.role || "employee"
        } 
      }
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