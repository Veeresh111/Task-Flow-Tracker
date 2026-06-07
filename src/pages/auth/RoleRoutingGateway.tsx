import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RoleRoutingGateway() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    evaluateEnterpriseAccess();
  }, []);

  const evaluateEnterpriseAccess = async () => {
    try {
      // 1. CRITICAL ENTERPRISE STEP: Force a programmatic refresh of the active JWT session token
      // This pulls the updated database role metadata from auth.users and clears candidate caches
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      
      let currentSession = refreshData?.session;

      if (refreshError || !currentSession) {
        // Fallback catch if token refresh fails due to deep socket state delays
        const { data: fallbackSession } = await supabase.auth.getSession();
        currentSession = fallbackSession?.session;
      }

      if (!currentSession) {
        navigate("/login");
        return;
      }

      const userId = currentSession.user.id;

      // 2. Direct real-time fetch from database profiles table bypassing local memory states
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role, department, team_name")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile) {
        setErrorMessage("Profile synchronization configuration anomaly. Missing directory row target.");
        setLoading(false);
        return;
      }

      // 3. Normalize role parameter value explicitly
      const targetRole = String(profile.role || "candidate").toLowerCase().trim();

      // 4. Force reset local application variables
      localStorage.clear();
      localStorage.setItem("user_corporate_role", targetRole);
      localStorage.setItem("user_department", profile.department || "Internal Operations");
      localStorage.setItem("user_team_name", profile.team_name || "Global Enterprise Group");

      console.log(`Routing Engine Redirection active context successfully verified: [${targetRole}]`);

      // 5. Explicit navigation trees matching App.tsx routes directly
      if (targetRole === "employee") {
        navigate("/employee", { replace: true });
        window.location.href = "/employee"; // Hard trigger layout context paint reset
        return;
      } 
      
      if (targetRole === "team_lead" || targetRole === "manager") {
        navigate("/team-lead", { replace: true });
        window.location.href = "/team-lead";
        return;
      } 
      
      if (targetRole === "hr") {
        navigate("/hr", { replace: true });
        window.location.href = "/hr";
        return;
      } 
      
      if (targetRole === "admin") {
        navigate("/admin", { replace: true });
        window.location.href = "/admin";
        return;
      } 
      
      if (targetRole === "candidate") {
        navigate("/candidate", { replace: true });
        return;
      }

      // Safe fallback route
      navigate("/login", { replace: true });

    } catch (err: any) {
      console.error("Critical routing matrix failure handled:", err);
      setErrorMessage(`Authentication Core Pipeline Error: ${err.message || "Unknown State Variant"}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-6">
        <div className="space-y-4 text-center max-w-sm">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto" />
          <h2 className="text-xl font-bold text-slate-800">Refreshing Enterprise Token</h2>
          <p className="text-sm text-slate-500 animate-pulse">
            Bypassing edge cache locks, downloading updated system permissions and updating role assignments...
          </p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md w-full border-red-200 shadow-xl bg-white">
          <CardHeader className="bg-red-50 border-b border-red-100">
            <CardTitle className="text-red-700 flex items-center gap-2 text-lg">
              <ShieldAlert className="w-5 h-5 flex-shrink-0" /> Enterprise Gateway Failure
            </CardTitle>
            <CardDescription className="text-red-600">
              Your login credentials could not be linked to your security clearance role.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="p-3 bg-slate-100 rounded border text-xs font-mono text-slate-700 break-words">
              {errorMessage}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => evaluateEnterpriseAccess()}
                className="w-full text-xs font-bold py-2 bg-slate-800 text-white rounded hover:bg-slate-900 transition-colors"
              >
                Retry Token Direct Link
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}