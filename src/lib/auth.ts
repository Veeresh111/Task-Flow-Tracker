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
    
    // CORPORATE FIX: Safely route Candidate data to prevent Database Trigger 500 Errors
    const safeDepartment = formData.role === 'candidate' ? 'Candidate Pool' : (formData.department || "Unassigned");

    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: { 
        data: { 
          name: formData.name, 
          phone: formData.phone || "N/A", 
          department: safeDepartment,
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

    // 1. Live Database Query Check - This is the absolute corporate source of truth
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();

    // 2. Read the registered metadata fallback parameter value
    const metadataRole = authData.user.user_metadata?.role;
    
    // 3. Resolve the corporate role accurately
    // If the database has an assigned profile role, prioritize it (resolving the candidate layout trap)
    const finalCalculatedRole = profileData?.role || metadataRole || 'employee';

    // 4. Securely keep metadata synchronized ONLY if the database row doesn't have an asset record yet
    if (!profileData && metadataRole) {
      await supabase.from('profiles').insert([{ id: authData.user.id, role: metadataRole }]);
    }

    return { 
      user: authData.user, 
      role: finalCalculatedRole 
    };
  },

  adminCreateUser: async (formData: any) => {
    const safeDepartment = formData.role === 'candidate' ? 'Candidate Pool' : (formData.department || "Unassigned");

    const { data, error } = await adminSupabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: { 
        data: { 
          name: formData.name, 
          phone: formData.phone || "N/A", 
          department: safeDepartment,
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