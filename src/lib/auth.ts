import { supabase } from './supabase';

const ALLOWED_SIGNUP_ROLES = ['candidate'];

// Roles that require administrative privilege
const ELEVATED_ROLES = ['admin', 'hr', 'team_lead', 'payroll', 'manager'];

/**
 * Application-level role verification.
 * 
 * Mitigation for RLS bypass vulnerability:
 * The DB-level RLS policy `users_update_own_profile` does NOT prevent
 * self-role elevation (confirmed bug). This function provides a
 * second line of defense by verifying role consistency.
 * 
 * If a user's profile.role doesn't match their signup metadata,
 * the role is automatically reset to prevent privilege escalation.
 */
async function verifyAndResetRole(userId: string, profileRole: string): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return profileRole;

    const registeredRole = user.user_metadata?.registered_role;

    // If user signed up as candidate but now has an elevated role, reset it
    if (registeredRole === 'candidate' && ELEVATED_ROLES.includes(profileRole)) {
      console.warn(
        `[SECURITY] Role escalation detected for user ${userId}: ` +
        `registered_role=${registeredRole}, profile_role=${profileRole}. Resetting to candidate.`
      );
      
      // Reset the role back to candidate
      await supabase.from('profiles').update({ role: 'candidate' }).eq('id', userId);
      
      // Attempt to log the security event
      try {
        await supabase.from('notifications').insert({
          user_id: userId,
          title: 'Security Alert: Role Reset',
          message: `Your role was automatically reset from "${profileRole}" to "candidate" because it did not match your registration record. Contact an administrator if you believe this is an error.`,
          is_read: false,
        });
      } catch { /* notification table may not be accessible */ }

      return 'candidate';
    }

    return profileRole;
  } catch {
    return profileRole;
  }
}

export const authService = {
  signUp: async (formData: any) => {
    const requestedRole = formData.role || 'candidate';

    if (!ALLOWED_SIGNUP_ROLES.includes(requestedRole)) {
      throw new Error(`Self-registration as "${requestedRole}" is not allowed. Only candidate registration is permitted.`);
    }

    await supabase.auth.signOut();

    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          name: formData.name,
          phone: formData.phone || "N/A",
          department: "Unassigned",
          registered_role: "candidate"
        }
      }
    });

    if (error) throw error;

    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email: formData.email,
        name: formData.name,
        role: 'candidate',
        department: 'Unassigned'
      }, { onConflict: 'id', ignoreDuplicates: true });
    }

    return data;
  },

  signIn: async (email: string, password: string) => {
    await supabase.auth.signOut();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) throw authError;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    const dbRole = profileData?.role || 'employee';
    
    // Application-level security check: validate role consistency
    const verifiedRole = await verifyAndResetRole(authData.user.id, dbRole);

    return {
      user: authData.user,
      role: verifiedRole
    };
  },

  signOut: async () => {
    await supabase.auth.signOut();
  }
};
