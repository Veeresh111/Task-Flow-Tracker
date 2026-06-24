import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

const ELEVATED_ROLES = ['admin', 'hr', 'team_lead', 'payroll', 'manager'];

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const location = useLocation();
  const escalationCheckDone = useRef(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUser(user);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      let profileRole = profile?.role || null;

      if (profileRole && !escalationCheckDone.current) {
        const registeredRole = user.user_metadata?.registered_role;
        if (registeredRole === 'candidate' && ELEVATED_ROLES.includes(profileRole)) {
          console.warn(
            `[SECURITY] ProtectedRoute detected role escalation for user ${user.id}: ` +
            `registered_role=${registeredRole}, profile_role=${profileRole}. Resetting.`
          );
          const { error } = await supabase.from('profiles').update({ role: 'candidate' }).eq('id', user.id);
          if (error) {
            console.warn(`[SECURITY] Could not persist role reset to DB: ${error.message}. Using local-only reset.`);
          }
          profileRole = 'candidate';
          escalationCheckDone.current = true;
        }
      }

      setRole(profileRole);
      setLoading(false);
    };
    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    const roleMap: Record<string, string> = {
      admin: '/admin',
      hr: '/hr',
      team_lead: '/team-lead',
      tl: '/team-lead',
      employee: '/employee',
      candidate: '/candidate',
    };
    const redirect = roleMap[role] || '/login';
    return <Navigate to={redirect} replace />;
  }

  return <>{children}</>;
}
