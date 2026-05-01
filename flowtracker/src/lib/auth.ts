import { supabase } from './supabase';

function normalizeAuthError(error: any) {
  const message = error?.message || String(error);

  // Fetch abort/timeouts can show as AbortError in browsers.
  if (error?.name === "AbortError" || /aborted/i.test(message)) {
    return new Error("Network timeout while contacting Supabase. Check internet, VPN/firewall, and your VITE_SUPABASE_URL/KEY.");
  }

  return error instanceof Error ? error : new Error(message);
}

export const authService = {
  signUp: async (formData: any) => {
    // Create the auth user. The DB trigger (`handle_new_user`) creates the `profiles` row.
    try {
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
    } catch (e: any) {
      throw normalizeAuthError(e);
    }
  },

  signIn: async (email: string, password: string) => {
    try {
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
    } catch (e: any) {
      throw normalizeAuthError(e);
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
  }
};
