import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { authService } from "@/lib/auth";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [retries, setRetries] = useState(0);
  const [phase, setPhase] = useState<"exchanging" | "profile" | "redirecting">("exchanging");
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  const processSession = async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session?.user) return null;

    setPhase("profile");
    const result = await authService.handleAuthCallback();
    return result;
  };

  const redirectToLogin = () => {
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    let cancelled = false;

    const attempt = async () => {
      try {
        const result = await processSession();
        if (cancelled) return;

        if (result) {
          setPhase("redirecting");
          const path = authService.getRedirectPath(result.role, result.status);
          navigate(path, { replace: true });
        } else {
          // No session yet — subscribe to auth state change
          setPhase("exchanging");
          const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
            if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && s?.user) {
              subscription.unsubscribe();
              if (!cancelled) {
                const r = await authService.handleAuthCallback();
                if (r) {
                  const p = authService.getRedirectPath(r.role, r.status);
                  navigate(p, { replace: true });
                }
              }
            }
          });
          subscriptionRef.current = subscription;
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Authentication failed. Please try again.");
        }
      }
    };

    attempt();

    return () => {
      cancelled = true;
      subscriptionRef.current?.unsubscribe();
    };
  }, [navigate, retries]);

  const handleRetry = () => {
    setError(null);
    setPhase("exchanging");
    setRetries((r) => r + 1);
  };

  if (error) {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950">
        <div className="absolute inset-0">
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-red-600/15 blur-[120px] animate-pulse" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-red-600/10 blur-[120px] animate-pulse" style={{ animationDelay: "2s" }} />
        </div>
        <div className="relative bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-white/[0.08] p-8 max-w-md w-full mx-4 text-center shadow-2xl">
          <div className="flex flex-col items-center gap-3 mb-6">
            <div className="relative group">
              <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-2xl" />
              <div className="relative w-16 h-16 shadow-lg">
                <img src="/fwc-logo.png" alt="FWC" className="w-full h-full brightness-0 invert" />
              </div>
              <h1 className="text-xl font-bold text-white">FWC</h1>
            </div>
          </div>
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-400 text-2xl font-bold">!</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Authentication Failed</h2>
          <p className="text-slate-400 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={handleRetry} className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-medium hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg">
              Try Again
            </button>
            <button onClick={redirectToLogin} className="px-6 py-3 border border-white/[0.1] text-slate-300 rounded-xl font-medium hover:bg-white/[0.05] transition-all">
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  const phaseMessages: Record<string, string> = {
    exchanging: "Completing authentication with your provider...",
    profile: "Setting up your account...",
    redirecting: "Redirecting to your dashboard...",
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950">
      <div className="absolute inset-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-600/20 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-violet-600/15 blur-[120px] animate-pulse" style={{ animationDelay: "2s" }} />
      </div>
      <div className="relative text-center">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="relative group">
            <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-2xl" />
            <div className="relative w-20 h-20 shadow-lg">
              <img src="/fwc-logo.png" alt="FWC" className="w-full h-full brightness-0 invert" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">FWC</h1>
        </div>
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-300 font-medium">{phaseMessages[phase]}</p>
      </div>
    </div>
  );
}
