import { supabase } from './supabase';

export const authService = {
  signUp: async (formData: any) => {
    // 1. Create the secure login
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
    });
    if (authError) throw authError;
    if (!authData.user) throw new Error("Sign up failed.");

    // 2. Check if this is the very first user (The Founder)
    const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const isFirstUser = count === 0;

    // 3. Insert the profile directly from React!
    const { error: profileError } = await supabase.from('profiles').insert([
      {
        id: authData.user.id,
        email: formData.email,
        name: formData.name || "Unknown",
        phone: formData.phone || "Unknown",
        department: formData.department || "Unknown",
        team_lead_id: formData.teamLeadId || null,
        role: isFirstUser ? 'admin' : 'employee'
      }
    ]);
    if (profileError) throw profileError;

    return authData;
  },

  signIn: async (email: string, password: string) => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) throw authError;

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profileData) throw new Error("Profile not found in database.");

    return { user: authData.user, role: profileData.role };
  },

  signOut: async () => {
    await supabase.auth.signOut();
  }
};