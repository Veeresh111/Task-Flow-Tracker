import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Send, AlertCircle, Clock, CheckCircle2, Eye } from "lucide-react";

export default function TeamLeadComplaints() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [formData, setFormData] = useState({ title: "", description: "" });
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchUserDataAndComplaints();
  }, []);

  const fetchUserDataAndComplaints = async () => {
    setFetching(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      setUserId(user.id);
      const { data, error } = await supabase
        .from('complaints')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
        
      if (!error && data) {
        setComplaints(data);
      }
    }
    setFetching(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setLoading(true);

    try {
      const { error } = await supabase.from('complaints').insert([{
        user_id: userId,
        title: formData.title,
        description: formData.description,
        status: 'Open'
      }]);

      if (error) throw error;
      toast({ title: "Issue Submitted", description: "The admin team has been notified." });
      setFormData({ title: "", description: "" });
      fetchUserDataAndComplaints();
    } catch (err: any) {
      toast({ title: "Submission Failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });
  };

  const calculateSLA = (start: string, end: string) => {
    const diffMs = new Date(end).getTime() - new Date(start).getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHrs > 24) return `${Math.floor(diffHrs / 24)}d ${diffHrs % 24}h`;
    return `${diffHrs}h ${diffMins}m`;
  };

  return (
    <DashboardLayout role="team_lead">
      <div className="space-y-8 max-w-4xl mx-auto animate-fade-in pb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Support & Escalations</h1>
          <p className="text-muted-foreground">Submit managerial issues and track their resolution status in real-time.</p>
        </div>

        {/* 1. SUBMISSION FORM */}
        <Card className="shadow-md border-purple-100">
          <CardHeader className="bg-purple-50/50 border-b pb-4 mb-4">
            <CardTitle className="text-lg flex items-center gap-2 text-purple-800">
              <AlertCircle className="w-5 h-5" /> Raise an Administrative Issue
            </CardTitle>
            <CardDescription>Detailed reports help Admins resolve issues faster.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input required placeholder="e.g. Resource request, Team conflict" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Full Explanation</Label>
                <textarea 
                  required
                  placeholder="Describe the situation..." 
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  value={formData.description} 
                  onChange={(e) => setFormData({...formData, description: e.target.value})} 
                />
              </div>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Submit Securely
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 2. REAL-TIME TRACKING HISTORY */}
        <div className="space-y-4 pt-4">
          <h2 className="text-xl font-bold tracking-tight border-b pb-2">Your Escalation History</h2>
          {fetching ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-purple-600" /></div>
          ) : complaints.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-200">
              <p className="text-gray-500 font-medium">No escalations submitted.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {complaints.map((c) => (
                <Card key={c.id} className={`overflow-hidden transition-all ${c.status === 'Resolved' ? 'border-green-200 bg-green-50/30' : c.status === 'Viewed' ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'}`}>
                  <CardContent className="p-5">
                    <div className="flex flex-col space-y-3">
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 text-xs font-bold uppercase rounded-full flex items-center gap-1
                          ${c.status === 'Open' ? 'bg-red-100 text-red-700' : c.status === 'Viewed' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                          {c.status === 'Open' && <AlertCircle className="w-3 h-3"/>}
                          {c.status === 'Viewed' && <Eye className="w-3 h-3"/>}
                          {c.status === 'Resolved' && <CheckCircle2 className="w-3 h-3"/>}
                          {c.status}
                        </span>
                        <h3 className="font-bold text-lg text-gray-900">{c.title}</h3>
                      </div>
                      
                      <p className="text-gray-700 whitespace-pre-wrap bg-white p-3 rounded-md border border-gray-100 shadow-sm text-sm">
                        {c.description}
                      </p>

                      <div className="text-xs text-gray-500 flex flex-wrap gap-x-6 gap-y-2 pt-2">
                        <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> <b>Opened:</b> {formatDate(c.created_at)}</div>
                        {c.viewed_at && <div className="flex items-center gap-1 text-amber-600"><Eye className="w-3.5 h-3.5"/> <b>Admin Viewed:</b> {formatDate(c.viewed_at)}</div>}
                        {c.resolved_at && (
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="w-3.5 h-3.5"/> <b>Resolved:</b> {formatDate(c.resolved_at)} 
                            <span className="ml-1 text-gray-400 font-medium">(Time taken: {calculateSLA(c.created_at, c.resolved_at)})</span>
                          </div>
                        )}
                      </div>

                      {c.admin_notes && (
                        <div className="mt-2 bg-white p-3 rounded-md border border-green-200 shadow-sm">
                          <span className="text-xs font-bold text-green-800 uppercase tracking-wider mb-1 block">Response from Admin</span>
                          <p className="text-sm text-gray-800">{c.admin_notes}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}