import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authService } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, ArrowRight, Sparkles, AlertTriangle } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const rejectedReason = searchParams.get("reason") === "rejected";
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        setMousePos({
          x: ((e.clientX - rect.left) / rect.width) * 100,
          y: ((e.clientY - rect.top) / rect.height) * 100,
        });
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const result = await authService.signIn(email, password);
      if ("error" in result) {
        toast({
          title: "Sign In Failed",
          description: result.error || "Please check your credentials.",
          variant: "destructive",
        });
        return;
      }
      const role = result?.role;
      const status = result?.status;

      toast({
        title: "Welcome back",
        description: "Redirecting to your dashboard...",
      });

      const path = authService.getRedirectPath(role, status);
      navigate(path);
    } catch {
      toast({
        title: "Sign In Failed",
        description: "Could not sign in. Please check your credentials.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      await authService.signInWithGoogle();
    } catch (err: any) {
      const message = err?.message || "";
      if (message.includes("provider is not enabled")) {
        toast({
          title: "Google Sign-In Unavailable",
          description:
            "Google authentication is not yet configured. Contact your administrator or use email sign-in.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "OAuth Failed",
          description: "Could not initiate Google sign-in. Please try again.",
          variant: "destructive",
        });
      }
      setIsGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({
        title: "Email Required",
        description: "Please enter your email first.",
        variant: "destructive",
      });
      return;
    }
    setIsResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (error) throw error;
      toast({
        title: "Reset Link Sent",
        description: "Check your email inbox to reset your password.",
      });
    } catch {
      toast({
        title: "Reset Failed",
        description: "Could not send a reset link. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950">
      {/* Animated gradient background */}
      <div className="absolute inset-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-600/20 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-violet-600/15 blur-[120px] animate-pulse" style={{ animationDelay: "2s" }} />
        <div className="absolute top-[40%] right-[20%] w-[30%] h-[30%] rounded-full bg-blue-500/10 blur-[100px] animate-pulse" style={{ animationDelay: "4s" }} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/40 via-slate-950 to-slate-950" />
      </div>

      {/* Grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

      {/* Floating orbs */}
      <div className="absolute top-20 left-[15%] w-3 h-3 rounded-full bg-indigo-400/40 blur-[4px] animate-float" />
      <div className="absolute top-40 right-[20%] w-2 h-2 rounded-full bg-violet-400/30 blur-[3px] animate-float" style={{ animationDelay: "1.5s", animationDuration: "7s" }} />
      <div className="absolute bottom-40 left-[25%] w-4 h-4 rounded-full bg-blue-400/20 blur-[6px] animate-float" style={{ animationDelay: "3s", animationDuration: "9s" }} />
      <div className="absolute bottom-60 right-[15%] w-2.5 h-2.5 rounded-full bg-indigo-300/25 blur-[5px] animate-float" style={{ animationDelay: "4.5s", animationDuration: "8s" }} />

      {/* Main card */}
      <div
        ref={cardRef}
        className="relative w-full max-w-[420px] mx-4"
      >
        <div
          className="relative rounded-2xl border border-white/[0.08] bg-slate-900/80 backdrop-blur-xl p-8 shadow-2xl transition-all duration-300"
          style={{
            background: `radial-gradient(600px circle at ${mousePos.x}% ${mousePos.y}%, rgba(99,102,241,0.06), transparent 60%)`,
          }}
        >
          {/* Logo */}
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-cyan-500 to-purple-500 rounded-2xl blur-lg opacity-40 group-hover:opacity-80 transition duration-500"></div>
              <div className="relative px-4 py-3 bg-slate-900/90 rounded-2xl border border-indigo-500/30">
                <img
                  src="/fwc-logo.png"
                  alt="FWC Logo"
                  className="h-16 w-auto drop-shadow-[0_2px_8px_rgba(99,102,241,0.35)]"
                />
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-extrabold tracking-wider text-white">
                FWC
              </h1>
              <p className="text-sm text-slate-400 mt-0.5 font-medium">
                Enterprise Access
              </p>
            </div>
          </div>

          {/* Rejected Banner */}
          {rejectedReason && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-300">Account Access Revoked</p>
                <p className="text-xs text-red-400/80 mt-1">
                  Your account has been automatically disapproved because no active job application was found associated with your email. If you believe this is an error, please contact HR.
                </p>
              </div>
            </div>
          )}

          {/* Google Sign-In */}
          <button
            onClick={handleGoogleLogin}
            disabled={isGoogleLoading}
            className="relative w-full group mb-4 overflow-hidden rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] transition-all duration-300 disabled:opacity-50"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/5 to-violet-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-center justify-center gap-3 px-6 py-3">
              {isGoogleLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              ) : (
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              <span className="text-sm font-medium text-slate-200">
                Continue with Google
              </span>
            </div>
          </button>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.06]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-slate-900 px-3 text-[11px] font-medium uppercase tracking-widest text-slate-500">
                Or sign in with email
              </span>
            </div>
          </div>

          {/* Email Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className={`text-xs font-medium transition-colors duration-200 ${
                  activeField === "email"
                    ? "text-indigo-400"
                    : "text-slate-400"
                }`}
              >
                Email
              </label>
              <div
                className={`relative rounded-xl border transition-all duration-200 ${
                  activeField === "email"
                    ? "border-indigo-500/50 bg-slate-800/80 shadow-[0_0_15px_rgba(99,102,241,0.08)]"
                    : "border-white/[0.08] bg-slate-800/40 hover:border-white/[0.15]"
                }`}
              >
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setActiveField("email")}
                  onBlur={() => setActiveField(null)}
                  placeholder="you@company.com"
                  className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder-slate-500 outline-none"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className={`text-xs font-medium transition-colors duration-200 ${
                    activeField === "password"
                      ? "text-indigo-400"
                      : "text-slate-400"
                  }`}
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isResetting}
                  className="text-[11px] font-medium text-slate-500 hover:text-indigo-400 transition-colors"
                >
                  {isResetting ? "Sending..." : "Forgot?"}
                </button>
              </div>
              <div
                className={`relative rounded-xl border transition-all duration-200 ${
                  activeField === "password"
                    ? "border-indigo-500/50 bg-slate-800/80 shadow-[0_0_15px_rgba(99,102,241,0.08)]"
                    : "border-white/[0.08] bg-slate-800/40 hover:border-white/[0.15]"
                }`}
              >
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setActiveField("password")}
                  onBlur={() => setActiveField(null)}
                  placeholder="Enter your password"
                  className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder-slate-500 outline-none pr-12"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="relative w-full group overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60 transition-all duration-300 shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30"
            >
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_50%,transparent_75%)] bg-[length:250%_250%] group-hover:bg-[position:100%_100%] transition-all duration-700" />
              <div className="relative flex items-center justify-center gap-2 px-6 py-3.5">
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm font-semibold text-white">
                      Signing in...
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-semibold text-white">
                      Sign In
                    </span>
                    <ArrowRight className="w-4 h-4 text-white/70 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </div>
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500">
              New to FWC?{" "}
              <Link
                to="/register"
                className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Create account
              </Link>
            </p>
          </div>
        </div>

        {/* Decorative card border glow */}
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 blur-sm" />
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); opacity: 0.4; }
          50% { transform: translateY(-20px) scale(1.1); opacity: 0.8; }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
