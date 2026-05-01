import { supabase } from './supabase';

export const authService = {
  signUp: async (formData: any) => {
    // Create the auth user. The DB trigger (`handle_new_user`) creates the `profiles` row.
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          name: formData.name || "",
          phone: formData.phone || "",
          department: formData.department || "",
          team_lead_id: formData.teamLeadId || "",
        },
      },
    });
    if (authError) throw authError;
    if (!authData.user) throw new Error("Sign up failed.");

    return authData;
  },

  signIn: async (email: string, password: string) => {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) throw authError;

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('role, approval_status')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profileData) throw new Error("Profile not found in database.");

    if (profileData.approval_status !== 'approved' && profileData.role !== 'admin') {
      await supabase.auth.signOut();
      throw new Error("Your account is pending approval by your team lead/admin.");
    }

    return { user: authData.user, role: profileData.role, approvalStatus: profileData.approval_status };
  },

  signOut: async () => {
    await supabase.auth.signOut();
  }
};
