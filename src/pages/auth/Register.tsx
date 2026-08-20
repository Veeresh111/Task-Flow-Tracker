import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authService } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, CheckCircle2, Sparkles, ArrowRight } from "lucide-react";

export default function Register() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (formData.password !== formData.confirmPassword) {
      toast({ title: "Validation Error", description: "Passwords do not match", variant: "destructive" });
      setIsLoading(false);
      return;
    }
    if (formData.password.length < 6) {
      toast({ title: "Validation Error", description: "Password must be at least 6 characters", variant: "destructive" });
      setIsLoading(false);
      return;
    }

    try {
      const signUpResult = await authService.signUp({ ...formData, role: "candidate", department: "", teamLeadId: "" });

      if (signUpResult?.user) {
        const cleanEmail = formData.email.trim().toLowerCase();
        const { data: existingCandidate } = await supabase
          .from("candidates")
          .select("id")
          .eq("email", cleanEmail)
          .maybeSingle();

        if (existingCandidate) {
          await supabase.from("profiles").update({ candidate_id: existingCandidate.id }).eq("id", signUpResult.user.id);
        }
      }

      setIsSubmitted(true);
    } catch (error: any) {
      toast({ title: "Registration Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950">
        <div className="absolute inset-0">
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-600/20 blur-[120px] animate-pulse" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-violet-600/15 blur-[120px] animate-pulse" style={{ animationDelay: "2s" }} />
        </div>
        <div className="relative w-full max-w-md mx-4">
          <div className="rounded-2xl border border-white/[0.08] bg-slate-900/80 backdrop-blur-xl p-8 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/20">
              <CheckCircle2 className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Registration Submitted!</h2>
            <p className="text-slate-400 mb-2">Your account has been created successfully.</p>
            <p className="text-sm text-slate-500 mb-8">Please check your email to verify your account before logging in.</p>
            <button
              onClick={() => navigate("/login")}
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20"
            >
              Go to Login <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950">
      {/* Animated background */}
      <div className="absolute inset-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-600/20 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-violet-600/15 blur-[120px] animate-pulse" style={{ animationDelay: "2s" }} />
        <div className="absolute top-[40%] right-[20%] w-[30%] h-[30%] rounded-full bg-blue-500/10 blur-[100px] animate-pulse" style={{ animationDelay: "4s" }} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/40 via-slate-950 to-slate-950" />
      </div>

      {/* Grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

      {/* Floating orbs */}
      <div className="absolute top-20 left-[15%] w-3 h-3 rounded-full bg-indigo-400/40 blur-[4px] animate-float-reg" />
      <div className="absolute top-40 right-[20%] w-2 h-2 rounded-full bg-violet-400/30 blur-[3px] animate-float-reg" style={{ animationDelay: "1.5s", animationDuration: "7s" }} />
      <div className="absolute bottom-40 left-[25%] w-4 h-4 rounded-full bg-blue-400/20 blur-[6px] animate-float-reg" style={{ animationDelay: "3s", animationDuration: "9s" }} />

      <div ref={cardRef} className="relative w-full max-w-[420px] mx-4">
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
              <h1 className="text-2xl font-extrabold tracking-wider text-white">FWC</h1>
              <p className="text-sm text-slate-400 mt-0.5">Create Account</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className={`text-xs font-medium transition-colors duration-200 ${activeField === "name" ? "text-indigo-400" : "text-slate-400"}`}>Full Name</label>
              <div className={`relative rounded-xl border transition-all duration-200 ${activeField === "name" ? "border-indigo-500/50 bg-slate-800/80 shadow-[0_0_15px_rgba(99,102,241,0.08)]" : "border-white/[0.08] bg-slate-800/40 hover:border-white/[0.15]"}`}>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  onFocus={() => setActiveField("name")}
                  onBlur={() => setActiveField(null)}
                  placeholder="John Doe"
                  className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder-slate-500 outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={`text-xs font-medium transition-colors duration-200 ${activeField === "email" ? "text-indigo-400" : "text-slate-400"}`}>Email</label>
              <div className={`relative rounded-xl border transition-all duration-200 ${activeField === "email" ? "border-indigo-500/50 bg-slate-800/80 shadow-[0_0_15px_rgba(99,102,241,0.08)]" : "border-white/[0.08] bg-slate-800/40 hover:border-white/[0.15]"}`}>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                  onFocus={() => setActiveField("email")}
                  onBlur={() => setActiveField(null)}
                  placeholder="name@company.com"
                  className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder-slate-500 outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={`text-xs font-medium transition-colors duration-200 ${activeField === "phone" ? "text-indigo-400" : "text-slate-400"}`}>Phone Number</label>
              <div className={`relative rounded-xl border transition-all duration-200 ${activeField === "phone" ? "border-indigo-500/50 bg-slate-800/80 shadow-[0_0_15px_rgba(99,102,241,0.08)]" : "border-white/[0.08] bg-slate-800/40 hover:border-white/[0.15]"}`}>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                  onFocus={() => setActiveField("phone")}
                  onBlur={() => setActiveField(null)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder-slate-500 outline-none"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5">
              <p className="text-sm font-medium text-indigo-300">Candidate Registration</p>
              <p className="text-xs text-indigo-400/70 mt-1">HR administrators will assign roles after onboarding.</p>
            </div>

            <div className="space-y-1.5">
              <label className={`text-xs font-medium transition-colors duration-200 ${activeField === "password" ? "text-indigo-400" : "text-slate-400"}`}>Password</label>
              <div className={`relative rounded-xl border transition-all duration-200 ${activeField === "password" ? "border-indigo-500/50 bg-slate-800/80 shadow-[0_0_15px_rgba(99,102,241,0.08)]" : "border-white/[0.08] bg-slate-800/40 hover:border-white/[0.15]"}`}>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={formData.password}
                  onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))}
                  onFocus={() => setActiveField("password")}
                  onBlur={() => setActiveField(null)}
                  placeholder="Create a strong password"
                  className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder-slate-500 outline-none pr-12"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Confirm Password</label>
              <div className="rounded-xl border border-white/[0.08] bg-slate-800/40 hover:border-white/[0.15] transition-all duration-200">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData((f) => ({ ...f, confirmPassword: e.target.value }))}
                  placeholder="Confirm your password"
                  className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder-slate-500 outline-none"
                />
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
                    <span className="text-sm font-semibold text-white">Creating account...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-white/70" />
                    <span className="text-sm font-semibold text-white">Create Account</span>
                  </>
                )}
              </div>
            </button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <p className="text-xs text-slate-500">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
                Sign in
              </Link>
            </p>
            <p className="text-xs text-slate-500">
              Are you an employee? Your HR administrator will send you an invitation link.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes float-reg {
          0%, 100% { transform: translateY(0px) scale(1); opacity: 0.4; }
          50% { transform: translateY(-20px) scale(1.1); opacity: 0.8; }
        }
        .animate-float-reg {
          animation: float-reg 6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
