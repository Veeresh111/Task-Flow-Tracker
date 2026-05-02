import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { authService } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // 1. Authenticate with backend
      const { role } = await authService.signIn(email, password);
      
      // 2. ONLY show success if line above doesn't fail
      toast({ title: "Login Successful", description: "Welcome back to the dashboard!" });
      
      // 3. Route precisely to the correct dashboard (Fixes the 404 flaw)
      if (role === 'admin') navigate("/admin");
      else if (role === 'team_lead') navigate("/team-lead");
      else navigate("/employee");
      
    } catch (error: any) {
      // FIX: Show error popup, NEVER show success popup on fail
      toast({ title: "Login Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: "Email Required", description: "Please enter your email in the box first.", variant: "destructive" });
      return;
    }
    setIsResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      });
      if (error) throw error;
      toast({ title: "Reset Link Sent", description: "Check your email inbox to reset your password." });
    } catch (error: any) {
      toast({ title: "Reset Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl mx-auto flex items-center justify-center mb-4">
             <span className="text-white font-bold text-xl">WM</span>
          </div>
          <CardTitle className="text-2xl font-bold">Sign In</CardTitle>
          <CardDescription>Enter your credentials to access your account</CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Password</Label>
                <button type="button" onClick={handleForgotPassword} disabled={isResetting} className="text-sm text-blue-600 font-medium hover:underline">
                  {isResetting ? "Sending..." : "Forgot password?"}
                </button>
              </div>
              <div className="relative">
                <Input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-gray-500">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11" disabled={isLoading}>
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
            </Button>
            <p className="text-sm text-gray-500">
              Don't have an account? <Link to="/register" className="text-blue-600 font-medium hover:underline">Register here</Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}