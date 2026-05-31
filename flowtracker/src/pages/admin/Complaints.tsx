import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, AlertCircle, CheckCircle2, MessageSquare, Bot, Send, Flame, ShieldAlert, Info } from "lucide-react";

export default function AdminComplaints() {
  const { toast } = useToast();
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // AI Assistant States
  const [aiInput, setAiInput] = useState("");
  const [aiChat, setAiChat] = useState<{role: string, text: string}[]>([
    { role: 'ai', text: 'Hello Admin. I am scanning the database. How can I assist you with HR resolutions or analytics today?' }
  ]);

  useEffect(() => { fetchComplaints(); }, []);

  const fetchComplaints = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('complaints')
      .select('*, profiles(name, email)')
      .order('created_at', { ascending: false });
      
    if (!error && data) setComplaints(data);
    setLoading(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('complaints').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
      toast({ title: `Complaint marked as ${newStatus}` });
      fetchComplaints();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setLoading(false);
    }
  };

  const formatDate = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "--";

  // LOCAL ALGORITHM: Assign Priority based on complaint nature
  const getPriority = (text: string) => {
    const t = text.toLowerCase();
    if (t.includes('harassment') || t.includes('illegal') || t.includes('danger') || t.includes('urgent')) {
      return { level: 'CRITICAL', color: 'bg-red-100 text-red-800 border-red-300', icon: Flame };
    }
    if (t.includes('payment') || t.includes('salary') || t.includes('manager') || t.includes('conflict')) {
      return { level: 'HIGH', color: 'bg-orange-100 text-orange-800 border-orange-300', icon: ShieldAlert };
    }
    return { level: 'STANDARD', color: 'bg-blue-100 text-blue-800 border-blue-300', icon: Info };
  };

  // MOCK AI HANDLER (Requires OpenAI API integration for full capability)
  const handleAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;
    
    const userMsg = aiInput;
    setAiChat(prev => [...prev, { role: 'admin', text: userMsg }]);
    setAiInput("");

    // Simulate AI thinking and analyzing local data
    setTimeout(() => {
      let aiResponse = "I have logged your request. To fully integrate deep analytics, meeting invites, and generative suggestions, please connect my module to the OpenAI API endpoint via Supabase Edge Functions.";
      
      if (userMsg.toLowerCase().includes('priority') || userMsg.toLowerCase().includes('urgent')) {
        const criticals = complaints.filter(c => getPriority(c.description).level === 'CRITICAL');
        aiResponse = `I have scanned the database. There are currently ${criticals.length} CRITICAL complaints requiring immediate intervention.`;
      }
      
      setAiChat(prev => [...prev, { role: 'ai', text: aiResponse }]);
    }, 1000);
  };

  return (
    <DashboardLayout role="admin">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12 flex flex-col xl:flex-row gap-6">
        
        {/* LEFT COLUMN: Complaints Table */}
        <div className="flex-1 space-y-6">
          <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <AlertCircle className="w-8 h-8 text-red-600" /> HR Complaints Hub
              </h1>
              <p className="text-slate-500 mt-1">Review and resolve workplace issues with smart priority routing.</p>
            </div>
          </div>

          {loading ? <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div> : (
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-lg text-slate-800 flex items-center gap-2"><MessageSquare className="w-5 h-5 text-slate-500" /> Active Tickets</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="font-bold">Date & Priority</TableHead>
                        <TableHead className="font-bold">Submitted By</TableHead>
                        <TableHead className="font-bold">Issue Description</TableHead>
                        <TableHead className="font-bold">Status</TableHead>
                        <TableHead className="font-bold text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {complaints.map(complaint => {
                        const Priority = getPriority(complaint.description || "");
                        const PIcon = Priority.icon;
                        return (
                          <TableRow key={complaint.id} className="hover:bg-slate-50">
                            <TableCell className="whitespace-nowrap">
                              <div className="text-sm text-slate-600 mb-1">{formatDate(complaint.created_at)}</div>
                              <span className={`flex items-center gap-1 w-max px-2 py-0.5 rounded text-[10px] font-bold border ${Priority.color}`}>
                                <PIcon className="w-3 h-3" /> {Priority.level}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="font-bold text-slate-900">{complaint.profiles?.name || 'Unknown'}</div>
                              <div className="text-xs text-slate-500">{complaint.profiles?.email}</div>
                            </TableCell>
                            <TableCell>
                              <div className="font-bold text-slate-800 mb-1">{complaint.title || 'General Complaint'}</div>
                              <div className="text-sm text-slate-600 line-clamp-2 max-w-md">{complaint.description}</div>
                            </TableCell>
                            <TableCell>
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold tracking-wider ${complaint.status === 'Resolved' ? 'bg-emerald-100 text-emerald-700' : complaint.status === 'Review' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                {complaint.status?.toUpperCase() || 'OPEN'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              {complaint.status !== 'Resolved' && (
                                <div className="flex justify-end gap-2 flex-col sm:flex-row">
                                  <Button onClick={() => updateStatus(complaint.id, 'Review')} variant="outline" className="h-8 text-xs border-amber-200 text-amber-700 hover:bg-amber-50">Mark Review</Button>
                                  <Button onClick={() => updateStatus(complaint.id, 'Resolved')} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"><CheckCircle2 className="w-3 h-3 mr-1" /> Resolve</Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {complaints.length === 0 && <TableRow><TableCell colSpan={5} className="text-center p-8 text-slate-500">No complaints found in the database.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN: AI Assistant Interface */}
        <div className="w-full xl:w-80 flex-shrink-0 flex flex-col h-[600px] xl:h-[calc(100vh-8rem)] sticky top-24">
          <Card className="flex-1 flex flex-col shadow-lg border-indigo-200 overflow-hidden">
            <div className="bg-indigo-600 p-4 text-white flex items-center gap-3">
              <div className="p-2 bg-indigo-500 rounded-full"><Bot className="w-5 h-5" /></div>
              <div>
                <h3 className="font-bold text-sm">System AI Assistant</h3>
                <p className="text-indigo-200 text-xs">Monitoring DB Activity</p>
              </div>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50 custom-scrollbar">
              {aiChat.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'admin' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl p-3 text-sm ${msg.role === 'admin' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-white border-t border-slate-200">
              <form onSubmit={handleAiSubmit} className="flex items-center gap-2">
                <Input 
                  value={aiInput} 
                  onChange={(e) => setAiInput(e.target.value)} 
                  placeholder="Ask about reports, invites, data..." 
                  className="flex-1 h-9 text-sm"
                />
                <Button type="submit" size="sm" className="h-9 w-9 p-0 bg-indigo-600 hover:bg-indigo-700">
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </Card>
        </div>

      </div>
    </DashboardLayout>
  );
}