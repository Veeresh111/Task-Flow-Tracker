import { supabase } from './supabase';

const ALLOWED_SIGNUP_ROLES = ['candidate'];
const ELEVATED_ROLES = ['admin', 'hr', 'team_lead', 'payroll', 'manager'];

async function verifyAndResetRole(userId: string, profileRole: string): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return profileRole;

    const registeredRole = user.user_metadata?.registered_role;

    if (registeredRole === 'candidate' && ELEVATED_ROLES.includes(profileRole)) {
      console.warn(
        `[SECURITY] Role escalation detected for user ${userId}: ` +
        `registered_role=${registeredRole}, profile_role=${profileRole}. Resetting to candidate.`
      );
      await supabase.from('profiles').update({ role: 'candidate' }).eq('id', userId);
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

function parseUserAgent(ua: string) {
  const browser = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/\S+/)?.[1] || 'Unknown';
  const os = ua.match(/(Windows NT|Mac OS X|Linux|Android|iOS)/)?.[1] || 'Unknown';
  const device = /Mobile/.test(ua) ? 'Mobile' : /Tablet/.test(ua) ? 'Tablet' : 'Desktop';
  return { browser, os, device };
}

async function recordLogin(params: {
  userId: string;
  provider: string;
  success: boolean;
  failureReason?: string;
}) {
  try {
    const ua = navigator.userAgent;
    const info = parseUserAgent(ua);
    await supabase.from('login_history').insert({
      user_id: params.userId,
      provider: params.provider,
      user_agent: ua.slice(0, 500),
      browser: info.browser,
      os: info.os,
      device: info.device,
      success: params.success,
      failure_reason: params.failureReason || null,
      ip_address: null,
    });
  } catch { /* login_history table may not exist yet */ }
}

async function recordSession(userId: string, provider: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const ua = navigator.userAgent;
    const info = parseUserAgent(ua);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('active_sessions').upsert({
      user_id: userId,
      session_id: session.access_token.slice(-32),
      provider,
      user_agent: ua.slice(0, 500),
      browser: info.browser,
      os: info.os,
      device: info.device,
      last_active_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, { onConflict: 'session_id', ignoreDuplicates: false });
  } catch { /* active_sessions table may not exist yet */ }
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
          registered_role: "candidate",
        },
      },
    });

    if (error) throw error;

    if (data.user) {
      // Auto-classify: Check if user has a job application
      const cleanEmail = formData.email.trim().toLowerCase();
      const { data: existingApp } = await supabase
        .from('job_applications')
        .select('id, status')
        .eq('candidate_email', cleanEmail)
        .maybeSingle();

      // ENTERPRISE RULE: If user has a job application → auto-approve
      // If user has NO application → auto-disapprove (rejected) with reason
      // This prevents unauthorized users from accessing the system
      const hasApplication = !!existingApp;
      const userStatus = hasApplication ? 'active' : 'rejected';

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        email: formData.email,
        name: formData.name,
        role: 'candidate',
        department: 'Unassigned',
        status: userStatus,
      }, { onConflict: 'id', ignoreDuplicates: true });

      if (profileError) {
        console.warn(`[AUTH] Profile upsert failed during signup: ${profileError.message}. User ${data.user.id} has auth record but no profile. Will retry on first login.`);
      }

      // Link to existing candidate record if email matches
      const { data: existingCandidate } = await supabase
        .from("candidates")
        .select("id")
        .eq("email", cleanEmail)
        .maybeSingle();

      if (existingCandidate) {
        await supabase.from("profiles").update({ candidate_id: existingCandidate.id }).eq("id", data.user.id);
      }

      // Notify user about their status
      if (!hasApplication) {
        await supabase.from('candidate_notifications').insert({
          candidate_id: data.user.id,
          title: 'Registration Disapproved',
          message: 'Your registration has been automatically disapproved because no active job application was found associated with your email address. If you believe this is an error, please contact HR.',
          read: false,
        });
      }

      // Notify HR about new registration
      const { data: hrUsers } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['hr', 'admin']);
      if (hrUsers) {
        for (const hr of hrUsers) {
          await supabase.from('notifications').insert({
            user_id: hr.id,
            title: hasApplication ? 'New Candidate Registered' : 'New Registration - Auto-Disapproved',
            message: hasApplication
              ? `New candidate ${formData.name} (${formData.email}) registered with an existing application.`
              : `New user ${formData.name} (${formData.email}) registered without a job application and has been auto-disapproved.`,
            is_read: false,
          });
        }
      }
    }

    return data;
  },

  signIn: async (email: string, password: string) => {
    await supabase.auth.signOut();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      return { error: authError.message };
    }

    let { data: profileData } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', authData.user.id)
      .single();

    // Reject login for users whose access has been revoked
    if (profileData?.status === 'rejected') {
      return { error: 'Your account access has been revoked. Please contact an administrator.' };
    }

    // If no profile exists (e.g. signup profile upsert failed), create one now
    if (!profileData) {
      const name = authData.user.user_metadata?.name || authData.user.email?.split('@')[0] || 'User';
      const registeredRole = authData.user.user_metadata?.registered_role || 'candidate';
      const { error: createError } = await supabase.from('profiles').upsert({
        id: authData.user.id,
        email: authData.user.email || email,
        name,
        role: registeredRole,
        department: 'Unassigned',
        status: 'active',
      }, { onConflict: 'id', ignoreDuplicates: true });

      if (!createError) {
        profileData = { role: registeredRole, status: 'active' };
      } else {
        console.warn(`[AUTH] Could not create missing profile on login: ${createError.message}. Using safe defaults.`);
        profileData = { role: 'candidate', status: 'active' };
      }
    }

    const dbRole = profileData?.role || 'candidate';
    const verifiedRole = await verifyAndResetRole(authData.user.id, dbRole);

    recordLogin({ userId: authData.user.id, provider: 'email', success: true });
    recordSession(authData.user.id, 'email');

    return {
      user: authData.user,
      role: verifiedRole,
      status: profileData?.status || 'active',
    };
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },

  signInWithGoogle: async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) throw error;
    return data;
  },

  signInWithMicrosoft: async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
    return data;
  },

  handleAuthCallback: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const user = session.user;
    const email = user.email || '';

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .single();

    if (!existingProfile) {
      const name = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0];
      
      // Auto-classify: Check if user has a job application
      const { data: existingApp } = await supabase
        .from('job_applications')
        .select('id')
        .eq('candidate_email', email.toLowerCase())
        .maybeSingle();
      
      const hasApplication = !!existingApp;
      const userStatus = hasApplication ? 'active' : 'rejected';

      await supabase.from('profiles').upsert({
        id: user.id,
        email,
        name,
        role: 'candidate',
        department: 'Unassigned',
        status: userStatus,
      }, { onConflict: 'id', ignoreDuplicates: true });

      // Notify user about auto-disapproval
      if (!hasApplication) {
        await supabase.from('candidate_notifications').insert({
          candidate_id: user.id,
          title: 'Registration Disapproved',
          message: 'Your OAuth registration has been automatically disapproved because no active job application was found. If you believe this is an error, please contact HR.',
          read: false,
        });
      }

      // Notify HR about new registration
      const { data: hrUsers } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['hr', 'admin']);
      if (hrUsers) {
        for (const hr of hrUsers) {
          await supabase.from('notifications').insert({
            user_id: hr.id,
            title: hasApplication ? 'New OAuth Candidate' : 'New OAuth User - Auto-Disapproved',
            message: hasApplication
              ? `New candidate ${name} (${email}) registered via OAuth with an existing application.`
              : `New user ${name} (${email}) registered via OAuth without a job application and has been auto-disapproved.`,
            is_read: false,
          });
        }
      }

      recordLogin({ userId: user.id, provider: 'google', success: true });
      recordSession(user.id, 'google');

      return { user, role: 'candidate', status: userStatus, isNew: true };
    }

    recordLogin({ userId: user.id, provider: 'google', success: true });
    recordSession(user.id, 'google');

    return { user, role: existingProfile.role, status: existingProfile.status || 'active', isNew: false };
  },

  getRedirectPath: (role: string, status?: string): string => {
    if (status === 'rejected') {
      return '/login?reason=rejected';
    }
    if (status === 'pending_activation') {
      return '/auth/pending';
    }
    const roleMap: Record<string, string> = {
      admin: '/admin',
      hr: '/hr',
      team_lead: '/team-lead',
      employee: '/employee',
      candidate: '/candidate',
    };
    return roleMap[role] || '/employee';
  },

  getSessions: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data } = await supabase
      .from('active_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('last_active_at', { ascending: false });
    return data || [];
  },

  logoutSession: async (sessionId: string) => {
    await supabase.from('active_sessions').delete().eq('session_id', sessionId);
  },

  logoutAllSessions: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('active_sessions').delete().eq('user_id', user.id);
    await supabase.auth.signOut();
  },

  getLoginHistory: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data } = await supabase
      .from('login_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    return data || [];
  },
};
