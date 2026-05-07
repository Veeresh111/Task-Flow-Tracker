import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, AlertCircle, Clock, CheckCircle2, Eye, User } from "lucide-react";

export default function AdminComplaints() {
  const { toast } = useToast();
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolutionNotes, setResolutionNotes] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    fetchComplaints();
  }, []);

  const fetchComplaints = async () => {
    setLoading(true);
    // Fetch all complaints and join with profiles to get the user's name
    const { data, error } = await supabase
      .from('complaints')
      .select('*, profiles(name, email, role)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setComplaints(data);
      
      // AUTO-VIEW ENGINE: Mark "Open" tickets as "Viewed" instantly
      const unreadTickets = data.filter(c => c.status === 'Open');
      if (unreadTickets.length > 0) {
        const unreadIds = unreadTickets.map(c => c.id);
        
        await supabase
          .from('complaints')
          .update({ status: 'Viewed', viewed_at: new Date().toISOString() })
          .in('id', unreadIds);

        setComplaints(prev => prev.map(c => 
          unreadIds.includes(c.id) 
            ? { ...c, status: 'Viewed', viewed_at: new Date().toISOString() } 
            : c
        ));
      }
    }
    setLoading(false);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });
  };

  const calculateSLA = (start: string, end: string) => {
    const diffMs = new Date(end).getTime() - new Date(start).getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHrs > 24) return `${Math.floor(diffHrs / 24)} days, ${diffHrs % 24} hrs`;
    return `${diffHrs} hrs, ${diffMins} mins`;
  };

  // Mark as Viewed (Manual fallback)
  const markAsViewed = async (id: string) => {
    const { error } = await supabase
      .from('complaints')
      .update({ status: 'Viewed', viewed_at: new Date().toISOString() })
      .eq('id', id);
      
    if (!error) {
      toast({ title: "Ticket Marked as Viewed" });
      fetchComplaints();
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Resolve Ticket
  const resolveComplaint = async (id: string) => {
    const notes = resolutionNotes[id];
    if (!notes || notes.trim() === '') {
      toast({ title: "Wait!", description: "Please add resolution notes for the user.", variant: "destructive" });
      return;
    }

    const { error } = await supabase
      .from('complaints')
      .update({ 
        status: 'Resolved', 
        resolved_at: new Date().toISOString(),
        admin_notes: notes 
      })
      .eq('id', id);

    if (!error) {
      toast({ title: "Ticket Resolved & Closed" });
      fetchComplaints();
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <DashboardLayout role="admin">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SLA Resolution Desk</h1>
          <p className="text-muted-foreground">Monitor, view, and resolve tickets while tracking your response times.</p>
        </div>

        <div className="space-y-6">
          {loading ? (
             <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
          ) : complaints.length === 0 ? (
             <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
               Inbox Zero! No complaints currently in the system.
             </div>
          ) : (
            complaints.map((c) => (
              <Card key={c.id} className={`overflow-hidden transition-all ${c.status === 'Resolved' ? 'border-green-200 bg-green-50/10' : c.status === 'Viewed' ? 'border-amber-200 bg-amber-50/10' : 'border-red-200 shadow-md'}`}>
                <div className="p-5 flex flex-col md:flex-row gap-6">
                  
                  {/* Left Side: Issue Details */}
                  <div className="flex-1 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 text-xs font-bold uppercase rounded-full flex items-center gap-1
                          ${c.status === 'Open' ? 'bg-red-100 text-red-700' : c.status === 'Viewed' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                          {c.status === 'Open' && <AlertCircle className="w-3 h-3"/>}
                          {c.status === 'Viewed' && <Eye className="w-3 h-3"/>}
                          {c.status === 'Resolved' && <CheckCircle2 className="w-3 h-3"/>}
                          {c.status}
                        </span>
                        <h3 className="font-bold text-xl text-gray-900">{c.title}</h3>
                      </div>
                    </div>
                    
                    {/* User Info Badge */}
                    <div className="inline-flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200 text-sm text-slate-700">
                      <User className="w-4 h-4 text-slate-500" />
                      <span className="font-semibold">{c.profiles?.name || 'Unknown User'}</span>
                      <span className="text-slate-400">|</span>
                      <span>{c.profiles?.role || 'Employee'}</span>
                      <span className="text-slate-400">|</span>
                      <span>{c.profiles?.email}</span>
                    </div>
                    
                    <div className="bg-white p-4 rounded-md border shadow-sm mt-2">
                      <p className="text-gray-700 whitespace-pre-wrap">{c.description}</p>
                    </div>

                    {/* Timeline Tracker */}
                    <div className="text-xs text-gray-500 flex flex-wrap gap-4 mt-2">
                      <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> <b>Raised:</b> {formatDate(c.created_at)}</div>
                      {c.viewed_at && <div className="flex items-center gap-1 text-amber-600"><Eye className="w-3.5 h-3.5"/> <b>Viewed:</b> {formatDate(c.viewed_at)}</div>}
                      {c.resolved_at && <div className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3.5 h-3.5"/> <b>Resolved:</b> {formatDate(c.resolved_at)} 
                        <span className="ml-1 text-gray-400 bg-white px-2 py-0.5 rounded border">(SLA: {calculateSLA(c.created_at, c.resolved_at)})</span>
                      </div>}
                    </div>

                    {/* Admin's Previous Notes */}
                    {c.admin_notes && (
                      <div className="mt-4 bg-green-50 p-3 rounded-md border border-green-200">
                        <span className="text-xs font-bold text-green-800 uppercase tracking-wider mb-1 block">Your Resolution Notes</span>
                        <p className="text-sm text-green-900">{c.admin_notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Right Side: Admin Action Panel */}
                  {c.status !== 'Resolved' && (
                    <div className="w-full md:w-72 bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-3 shadow-inner">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider text-center border-b pb-2">Resolution Tools</span>
                      
                      {c.status === 'Open' && (
                        <Button onClick={() => markAsViewed(c.id)} className="w-full bg-amber-500 hover:bg-amber-600 text-white shadow-sm">
                          <Eye className="w-4 h-4 mr-2" /> 1. Mark as Viewed
                        </Button>
                      )}

                      {(c.status === 'Open' || c.status === 'Viewed') && (
                        <div className="space-y-3 mt-2 flex-1 flex flex-col">
                          <Label className="text-xs text-slate-600 font-semibold">2. Provide Feedback to User</Label>
                          <textarea 
                            placeholder="Type resolution notes here. The user will see this..." 
                            className="w-full text-sm p-3 border rounded-lg resize-none flex-1 min-h-[100px] outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 shadow-sm"
                            onChange={(e) => setResolutionNotes({...resolutionNotes, [c.id]: e.target.value})}
                          />
                          <Button onClick={() => resolveComplaint(c.id)} className="w-full bg-green-600 hover:bg-green-700 text-white shadow-sm">
                            <CheckCircle2 className="w-4 h-4 mr-2" /> Close Ticket
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}