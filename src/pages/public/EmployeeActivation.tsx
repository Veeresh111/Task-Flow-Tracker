import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, CheckCircle2, AlertCircle, UserPlus } from "lucide-react";

export default function EmployeeActivation() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"check" | "registered" | "complete">("check");
  const [invite, setInvite] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const checkInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, email, role, department, employment_status")
      .eq("email", email.trim().toLowerCase())
      .eq("employment_status", "invited")
      .maybeSingle();

    if (profiles) {
      setInvite(profiles);
      setMessage(`An invitation was found for ${profiles.name} as ${profiles.role}. Please register as a candidate first, then contact your admin to activate your role.`);
      setStep("registered");
    } else {
      setMessage("No pending invitation found for this email. Please check with your HR administrator or register as a candidate.");
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/30 p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shadow-lg">
              <span className="text-xl font-bold text-white">WM</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">WorkFlow</h1>
              <p className="text-sm text-muted-foreground">Employee Activation</p>
            </div>
          </div>
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-center">Activate Your Account</CardTitle>
            <CardDescription className="text-center">
              If your HR administrator has invited you, enter your email below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "check" && (
              <form onSubmit={checkInvitation} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Work Email</Label>
                  <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required className="h-11" />
                </div>
                <Button type="submit" disabled={isLoading} className="w-full h-11 gradient-primary text-white gap-2">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Check Invitation
                </Button>
              </form>
            )}

            {message && (
              <div className={`p-4 rounded-lg flex gap-3 items-start text-sm ${invite ? "bg-green-50 text-green-800 border border-green-200" : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
                {invite ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
                <div>
                  <p>{message}</p>
                  {invite && (
                    <div className="mt-3 space-y-2">
                      <Link to="/register">
                        <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2">
                          <UserPlus className="w-4 h-4" /> Register as Candidate
                        </Button>
                      </Link>
                      <p className="text-xs text-slate-500 mt-2">
                        After registering, ask your admin to update your role in the Employee Directory.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <p className="text-center text-sm text-muted-foreground">
              Already have an account? <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>
            </p>
            <p className="text-center text-xs text-muted-foreground">
              New here? <Link to="/register" className="text-primary hover:underline">Register as candidate</Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
