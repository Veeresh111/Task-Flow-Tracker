import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Send } from "lucide-react";

export default function TeamLeadComplaints() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ subject: "", message: "" });
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        setUserProfile(data);
      }
    };
    fetchUser();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setLoading(true);

    try {
      const { error } = await supabase.from('complaints').insert([{
        user_id: userProfile.id,
        subject: formData.subject,
        message: formData.message,
        status: 'Pending'
      }]);

      if (error) throw error;
      toast({ title: "Complaint Submitted", description: "The admin team has been notified." });
      setFormData({ subject: "", message: "" });
    } catch (err: any) {
      toast({ title: "Submission Failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout role="team_lead">
      <div className="space-y-6 max-w-3xl mx-auto animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">File a Complaint</h1>
          <p className="text-muted-foreground">Submit an issue directly to the administrative team.</p>
        </div>

        <Card className="shadow-lg border-0">
          <CardHeader>
            <CardTitle>Complaint Details</CardTitle>
            <CardDescription>Please be as detailed as possible so we can resolve your issue quickly.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Subject / Issue Topic</Label>
                <Input required placeholder="e.g. Broken hardware, HR issue" value={formData.subject} onChange={(e) => setFormData({...formData, subject: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Full Explanation</Label>
                <textarea 
                  required
                  placeholder="Describe the problem you are facing..." 
                  className="flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.message} 
                  onChange={(e) => setFormData({...formData, message: e.target.value})} 
                />
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Submit Complaint Securely
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}