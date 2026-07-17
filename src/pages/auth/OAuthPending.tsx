import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { authService } from "@/lib/auth";
import { Loader2, Clock, LogOut } from "lucide-react";

export default function OAuthPending() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login', { replace: true });
        return;
      }

      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!p) {
        navigate('/login', { replace: true });
        return;
      }

      // If already active, redirect to dashboard
      if (p.status === 'active') {
        const path = authService.getRedirectPath(p.role, p.status);
        navigate(path, { replace: true });
        return;
      }

      setProfile(p);
      setLoading(false);
    };

    check();

    // Poll for status change every 10s
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [navigate]);

  const handleSignOut = async () => {
    await authService.signOut();
    navigate('/login', { replace: true });
  };

  if (loading) {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950">
        <div className="absolute inset-0">
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-600/20 blur-[120px] animate-pulse" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-violet-600/15 blur-[120px] animate-pulse" style={{ animationDelay: "2s" }} />
        </div>
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400 relative" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950 p-4">
      <div className="absolute inset-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-amber-600/15 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-amber-600/10 blur-[120px] animate-pulse" style={{ animationDelay: "2s" }} />
      </div>
      <div className="relative bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-white/[0.08] p-8 max-w-lg w-full text-center shadow-2xl">
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="relative group">
            <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-2xl" />
            <div className="relative w-20 h-20 shadow-lg">
              <img src="/fwc-logo.png" alt="FWC" className="w-full h-full brightness-0 invert" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-white">FWC</h1>
        </div>
        <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">
          Account Pending Activation
        </h1>

        <p className="text-slate-400 mb-6 leading-relaxed">
          Your account has been created but is waiting for administrator approval.
          Once your role is assigned, you'll be able to access the system.
        </p>

        {profile && (
          <div className="bg-white/[0.04] rounded-xl p-4 mb-6 text-left space-y-2 border border-white/[0.06]">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Email</span>
              <span className="text-white font-medium">{profile.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Name</span>
              <span className="text-white font-medium">{profile.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Status</span>
              <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Pending Approval
              </span>
            </div>
          </div>
        )}

        <p className="text-sm text-slate-500 mb-8">
          Contact your system administrator to complete the setup process.
          This page will refresh automatically when your account is activated.
        </p>

        <button
          onClick={handleSignOut}
          className="inline-flex items-center gap-2 px-6 py-3 border border-white/[0.1] text-slate-300 rounded-xl font-medium hover:bg-white/[0.05] transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
