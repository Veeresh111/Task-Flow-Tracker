import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, UserPlus, CheckCircle2 } from "lucide-react";
import { authService } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (formData.password !== formData.confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      setIsLoading(false);
      return;
    }
    if (formData.password.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      setIsLoading(false);
      return;
    }

    try {
      const signUpResult = await authService.signUp({
        ...formData,
        role: "candidate",
        department: "",
        teamLeadId: "",
      });

      if (signUpResult?.user) {
        const cleanEmail = formData.email.trim().toLowerCase();
        const { data: existingCandidate } = await supabase
          .from('candidates')
          .select('id')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (existingCandidate) {
          await supabase
            .from('profiles')
            .update({ candidate_id: existingCandidate.id })
            .eq('id', signUpResult.user.id);
        }
      }

      setIsSubmitted(true);
    } catch (error: any) {
      toast({
        title: "Registration Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/30 p-4">
        <div className="w-full max-w-md animate-fade-in">
          <Card className="border-0 shadow-xl">
            <CardContent className="pt-12 pb-8 text-center">
              <div className="w-16 h-16 rounded-full bg-status-completed/20 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8 text-status-completed" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Registration Submitted!</h2>
              <p className="text-muted-foreground mb-2">
                Your account has been created successfully.
              </p>
              <p className="text-sm text-muted-foreground mb-8">
                Please check your email to verify your account before logging in.
              </p>
              <Button onClick={() => navigate("/login")} className="gradient-primary text-white">
                Go to Login
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

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
              <p className="text-sm text-muted-foreground">Management System</p>
            </div>
          </div>
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl font-bold text-center">Create an Account</CardTitle>
            <CardDescription className="text-center">
              Register as a candidate to apply for positions
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" placeholder="John Doe" value={formData.name} onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))} required className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="name@company.com" value={formData.email} onChange={(e) => setFormData(f => ({ ...f, email: e.target.value }))} required className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" type="tel" placeholder="+1 (555) 000-0000" value={formData.phone} onChange={(e) => setFormData(f => ({ ...f, phone: e.target.value }))} required className="h-11" />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm font-medium text-blue-800">Account Type: Candidate / Applicant</p>
                <p className="text-xs text-blue-600 mt-1">
                  You are registering as a candidate. HR administrators will assign additional roles after onboarding.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder="Create a strong password" value={formData.password} onChange={(e) => setFormData(f => ({ ...f, password: e.target.value }))} required className="h-11 pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input id="confirmPassword" type="password" placeholder="Confirm your password" value={formData.confirmPassword} onChange={(e) => setFormData(f => ({ ...f, confirmPassword: e.target.value }))} required className="h-11" />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button
                type="submit"
                className="w-full h-11 gradient-primary text-white font-medium"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Submitting...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4" />
                    Submit Registration
                  </span>
                )}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account? <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>
              </p>
              <p className="text-center text-xs text-muted-foreground">
                Are you an employee? Your HR administrator will send you an invitation link.
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
