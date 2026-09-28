import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Loader2, KeyRound, CheckCircle2, AlertCircle, ArrowRight, ShieldCheck, Mail } from "lucide-react";

export default function EmployeeActivation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const urlToken = searchParams.get("token") || "";
  const [token, setToken] = useState(urlToken);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailInput, setEmailInput] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [activatedEmail, setActivatedEmail] = useState("");
  const [lookupMessage, setLookupMessage] = useState("");

  useEffect(() => {
    if (urlToken) {
      setToken(urlToken);
      // Security: Scrub sensitive token credential from URL address bar and history to prevent referrer/history leakage
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [urlToken]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!token.trim()) {
      setErrorMsg("Activation token is missing. Please use the link provided in your welcome email.");
      return;
    }

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match. Please verify.");
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("activate-employee", {
        body: {
          token: token.trim(),
          password
        }
      });

      if (error) {
        throw new Error(error.message || "Failed to activate employee account.");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setIsSuccess(true);
      setActivatedEmail(data?.email || "");

      toast({
        title: "Account Activated!",
        description: "Your corporate account is ready. Signing you in...",
      });

      // Attempt automatic sign-in if email was returned
      if (data?.email) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password
        });

        if (!signInError) {
          setTimeout(() => {
            navigate("/dashboard");
          }, 1500);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred during activation.");
      toast({
        title: "Activation Error",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;

    setIsLoading(true);
    setLookupMessage("");

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, role, employment_status")
        .eq("email", emailInput.trim().toLowerCase())
        .maybeSingle();

      if (profile) {
        if (profile.employment_status === "active") {
          setLookupMessage(`Account for ${profile.name} is already active. Please proceed to the login page.`);
        } else {
          setLookupMessage(`Invitation found for ${profile.name} (${profile.role}). Please check your inbox for your official activation link or contact HR if the link has expired.`);
        }
      } else {
        setLookupMessage("No profile found for this email. Please ensure your HR department has issued an offer.");
      }
    } catch (err: any) {
      setLookupMessage("Error checking status: " + (err.message || "Network error."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/30 p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <img src="/fwc-logo.png" alt="FWC Logo" className="h-12 w-auto drop-shadow-[0_2px_8px_rgba(99,102,241,0.35)]" />
            <div>
              <h1 className="text-2xl font-extrabold text-foreground tracking-wider">FWC</h1>
              <p className="text-sm text-muted-foreground font-medium">Enterprise Employee Activation</p>
            </div>
          </div>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-xl font-bold text-center">
              {isSuccess ? "Activation Complete!" : "Set Corporate Credentials"}
            </CardTitle>
            <CardDescription className="text-center">
              {isSuccess
                ? "Your corporate credentials have been verified and secured."
                : "Configure your secure password to complete account activation."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {isSuccess ? (
              <div className="space-y-4 text-center">
                <div className="p-4 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-800 text-sm flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  <p className="font-semibold">Account successfully activated!</p>
                  {activatedEmail && (
                    <p className="text-xs text-muted-foreground font-mono">{activatedEmail}</p>
                  )}
                </div>
                <Button onClick={() => navigate("/login")} className="w-full h-11 gradient-primary text-white gap-2 font-medium">
                  Proceed to Sign In <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            ) : token ? (
              <form onSubmit={handleActivate} className="space-y-4">
                {errorMsg && (
                  <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20 flex gap-2 items-start">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="password">Corporate Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="h-11"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 gradient-primary text-white gap-2 font-medium"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Activating Account...
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      Complete Activation
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-sm rounded-lg border border-amber-200 dark:border-amber-800 flex gap-2 items-start">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span>No activation token detected. Please use the link sent to your personal email address.</span>
                </div>

                <form onSubmit={handleCheckEmail} className="space-y-3 pt-2">
                  <Label htmlFor="checkEmail">Check Activation Status</Label>
                  <div className="flex gap-2">
                    <Input
                      id="checkEmail"
                      type="email"
                      placeholder="work-email@company.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      required
                      className="h-10"
                    />
                    <Button type="submit" disabled={isLoading} variant="outline" className="shrink-0">
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    </Button>
                  </div>
                </form>

                {lookupMessage && (
                  <p className="text-xs text-muted-foreground bg-muted p-3 rounded-lg border">
                    {lookupMessage}
                  </p>
                )}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-2 pt-2">
            <p className="text-center text-sm text-muted-foreground">
              Already have an active account?{" "}
              <Link to="/login" className="text-primary font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
