import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Real Supabase Connection to update password
      const { error } = await supabase.auth.updateUser({ password: password });
      if (error) throw error;
      
      toast({ title: "Password Updated!", description: "You can now log in with your new password." });
      navigate("/login");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-4">
      <Card className="w-full max-w-md shadow-xl dark:bg-slate-900 dark:border-slate-700">
        <CardHeader className="text-center">
          <div className="flex flex-col items-center gap-3 mb-4">
            <img src="/fwc-logo.png" alt="FWC Logo" className="h-12 w-auto drop-shadow-[0_2px_8px_rgba(99,102,241,0.35)]" />
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-wider">FWC</h1>
          </div>
          <CardTitle className="text-2xl font-bold dark:text-white">Create New Password</CardTitle>
          <CardDescription>Enter a strong new password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full bg-blue-600 text-white" disabled={loading}>
              {loading ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}