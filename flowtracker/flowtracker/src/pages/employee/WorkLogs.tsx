import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Clock, Calendar, CheckCircle2, Building2, Home as HomeIcon, Sparkles, Wand2, Copy, Send, FileText, Download, Search } from "lucide-react";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default function EmployeeWorkLogs() {
  const [workLogs, setWorkLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const [roughNotes, setRoughNotes] = useState("");
  const [polishedNotes, setPolishedNotes] = useState("");
  const [isPolishing, setIsPolishing] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // NEW: Search Engine State for Employee's Saved Reports
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('work_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (data) setWorkLogs(data);
    }
    setLoading(false);
  };

  const handlePolishNotes = async () => {
    if (!roughNotes.trim()) return;
    setIsPolishing(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "AQ.Ab8RN6KQXzJBhyAkPtzy70H-HJXV0zOvPoV6BjJ-ohgF3Cs_YQ";
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      
      const prompt = `Act as an elite Corporate Communications AI. 
      Take these rough, messy daily work notes and polish them into a highly professional, concise daily stand-up update suitable for a corporate manager. 
      Format it with clear professional bullet points (e.g., 'Completed:', 'In Progress:', 'Blockers:'). Do not use markdown backticks.
      Rough notes: """${roughNotes}"""`;
      
      const result = await model.generateContent(prompt);
      setPolishedNotes(result.response.text());
    } catch (error: any) {
      console.error(error);
      toast({ title: "AI Engine Error", description: "Failed to polish notes. Please try again.", variant: "destructive" });
    }
    setIsPolishing(false);
  };

  const handleSaveAndSend = async () => {
    if (!polishedNotes) return;
    setIsSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication error");

      const { data: profile } = await supabase.from('profiles').select('name, team_lead_id').eq('id', user.id).single();
      
      const { data: latestLogs } = await supabase.from('work_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!latestLogs || latestLogs.length === 0) {
        toast({ title: "No Shift Found", description: "You must clock in first before submitting a daily update.", variant: "destructive" });
        setIsSending(false);
        return;
      }

      const currentLogId = latestLogs[0].id;

      const existingNotes = latestLogs[0].notes ? `${latestLogs[0].notes}\n\n` : "";
      const { error } = await supabase.from('work_logs').update({ 
        notes: `${existingNotes}=== DAILY STAND-UP UPDATE ===\n${polishedNotes}` 
      }).eq('id', currentLogId);

      if (error) throw error;

      if (profile?.team_lead_id) {
        await supabase.from('notifications').insert([{
          user_id: profile.team_lead_id,
          title: "New EOD Update",
          message: `${profile.name} has submitted their Daily Stand-up Report.`,
          is_read: false
        }]);
      }

      toast({ title: "Update Submitted!", description: "Your professional stand-up report has been saved permanently to your records and routed to your Team Lead." });
      setRoughNotes("");
      setPolishedNotes("");
      fetchLogs(); // Instantly refresh to show in the new viewer
    } catch (error: any) {
      toast({ title: "Submission Failed", description: error.message, variant: "destructive" });
    }
    setIsSending(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(polishedNotes);
    toast({ title: "Copied!", description: "Professional update copied to clipboard." });
  };

  // INDESTRUCTIBLE MATH ENGINE
  const calculateHours = (start: string | null, end: string | null) => {
    if (!start) return 0;
    try {
      const startDate = new Date(start);
      const startTime = startDate.getTime();

      let endTime;
      if (end) {
        endTime = new Date(end).getTime();
      } else {
        const now = new Date();
        const eod = new Date(startDate);
        eod.setHours(23, 59, 59, 999); 
        endTime = now.getTime() > eod.getTime() ? eod.getTime() : now.getTime();
      }

      const hours = (endTime - startTime) / 3600000;
      return hours > 24 ? 24 : (hours > 0 ? hours : 0); 
    } catch { return 0; }
  };

  const formatDateString = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : "--";
  const formatTimeStr = (ms: number | null) => ms ? new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : "--";

  const dailySummaries: { [key: string]: any } = {};
  
  workLogs.forEach(log => {
    const startTime = log?.clock_in || log?.created_at;
    if (!startTime) return;
    const dateStr = formatDateString(startTime);
    if (dateStr === "--") return;
    
    const duration = calculateHours(startTime, log?.clock_out);
    const startMs = new Date(startTime).getTime();
    const endMs = log?.clock_out ? new Date(log.clock_out).getTime() : null;
    
    if (!dailySummaries[dateStr]) {
      dailySummaries[dateStr] = { date: dateStr, totalHours: 0, status: 'Completed', sortDate: startMs, firstIn: startMs, lastOut: endMs, location: log.work_location || 'WFO', notes: log.notes || '' };
    } else {
      if (log.notes) dailySummaries[dateStr].notes = `${dailySummaries[dateStr].notes}\n${log.notes}`;
    }
    
    dailySummaries[dateStr].totalHours += duration;
    if (startMs < dailySummaries[dateStr].firstIn) dailySummaries[dateStr].firstIn = startMs;
    if (endMs && (!dailySummaries[dateStr].lastOut || endMs > dailySummaries[dateStr].lastOut)) dailySummaries[dateStr].lastOut = endMs;
    if (log.status === 'Active') { dailySummaries[dateStr].status = 'Active'; dailySummaries[dateStr].lastOut = null; }
  });

  const aggregatedData = Object.values(dailySummaries).sort((a, b) => b.sortDate - a.sortDate);
  const totalLifetimeHours = aggregatedData.reduce((acc, sum) => acc + sum.totalHours, 0);

  // NEW: Extract & Filter Employee's Saved Reports
  const myReports = workLogs.filter(log => log.notes && log.notes.includes('DAILY STAND-UP UPDATE'));
  const filteredMyReports = myReports.filter(r => r.notes.toLowerCase().includes(searchTerm.toLowerCase()));

  const downloadMyReports = () => {
    let csvContent = `data:text/csv;charset=utf-8,DATE,MY STAND-UP REPORT\n`;
    filteredMyReports.forEach(r => {
      const date = new Date(r.created_at).toLocaleString('en-US');
      const cleanReport = r.notes.replace(/"/g, '""').replace(/=== DAILY STAND-UP UPDATE ===/g, '').trim();
      csvContent += `"${date}","${cleanReport}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `My_Saved_Standups.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <DashboardLayout role="employee">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div><h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Calendar className="w-8 h-8 text-blue-600" /> My Timesheet & Logs</h1><p className="text-slate-500 mt-1">Your official daily attendance, work hours, and saved reports.</p></div>
          <div className="bg-blue-50 px-4 py-3 rounded-lg border border-blue-100 flex items-center gap-3"><div className="p-2 bg-blue-100 text-blue-600 rounded-full"><Clock className="w-5 h-5"/></div><div><p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Total Career Hours</p><p className="text-xl font-black text-slate-800">{totalLifetimeHours.toFixed(1)} hrs</p></div></div>
        </div>

        <Card className="shadow-sm border-slate-200 bg-gradient-to-br from-indigo-50 to-white">
          <CardHeader className="border-b border-indigo-100/50 pb-4">
            <CardTitle className="text-lg text-indigo-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" /> AI Stand-up Polisher
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rough Bullet Points</label>
                <textarea 
                  className="w-full h-32 p-3 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none bg-white shadow-sm"
                  placeholder="E.g., fixed login bug, working on ui, stuck on api. need help with token..."
                  value={roughNotes}
                  onChange={(e) => setRoughNotes(e.target.value)}
                />
                <Button onClick={handlePolishNotes} disabled={isPolishing || !roughNotes.trim()} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm">
                  {isPolishing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />} 
                  Polish with AI
                </Button>
              </div>
              <div className="space-y-3 flex flex-col h-full">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex justify-between items-center">
                  Professional Update
                  {polishedNotes && (
                    <button onClick={copyToClipboard} className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-bold transition-colors">
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </button>
                  )}
                </label>
                <div className="flex-1 p-4 border border-indigo-200 rounded-md text-sm bg-white overflow-y-auto whitespace-pre-wrap text-slate-700 shadow-sm leading-relaxed">
                  {polishedNotes ? polishedNotes : <span className="text-slate-400 italic">Your professional corporate update will appear here...</span>}
                </div>
                {polishedNotes && (
                  <Button onClick={handleSaveAndSend} disabled={isSending} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm mt-3">
                    {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} 
                    Save to Logs & Send to Team Lead
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* NEW: MY SAVED REPORTS VIEWER & SEARCH ENGINE */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="border-b bg-slate-50/50 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" /> My Saved Daily Reports
            </CardTitle>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="Search past reports..." className="pl-9 h-9 text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <Button onClick={downloadMyReports} variant="outline" className="h-9 text-xs font-bold whitespace-nowrap">
                <Download className="w-3.5 h-3.5 mr-2"/> Export
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
            ) : filteredMyReports.length === 0 ? (
              <div className="text-center p-8 text-slate-500 italic border border-slate-100 rounded-lg">No saved reports match your search.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {filteredMyReports.map((report, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-4 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 border-b border-slate-200 pb-2">
                      {new Date(report.created_at).toLocaleString()}
                    </p>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap">
                      {report.notes.replace('=== DAILY STAND-UP UPDATE ===\n', '')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {loading ? <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div> : (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b bg-slate-50/50"><CardTitle className="text-lg text-slate-800 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-500" /> Daily Attendance Record</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50"><TableRow><TableHead className="font-bold text-slate-600">Date</TableHead><TableHead className="font-bold text-slate-600">Location</TableHead><TableHead className="font-bold text-slate-600">Clocked In</TableHead><TableHead className="font-bold text-slate-600">Clocked Out</TableHead><TableHead className="font-bold text-slate-600">Daily Total</TableHead><TableHead className="font-bold text-slate-600">Status</TableHead><TableHead className="font-bold text-slate-600">EOD Report</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {aggregatedData.map((summary, idx) => (
                      <TableRow key={idx} className="hover:bg-slate-50 transition-colors">
                        <TableCell className="font-medium text-slate-900">{summary.date}</TableCell>
                        <TableCell>{summary.location === 'WFH' ? <span className="flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-1 rounded w-max"><HomeIcon className="w-3 h-3"/> WFH</span> : <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded w-max"><Building2 className="w-3 h-3"/> WFO</span>}</TableCell>
                        <TableCell className="text-emerald-600 font-medium">{formatTimeStr(summary.firstIn)}</TableCell>
                        <TableCell className="text-red-500 font-medium">{formatTimeStr(summary.lastOut)}</TableCell>
                        <TableCell className="font-bold text-slate-800 text-base">{summary.status === 'Active' ? <span className="text-blue-500 text-sm font-medium">In Progress...</span> : `${summary.totalHours.toFixed(2)} hrs`}</TableCell>
                        <TableCell>{summary.status === 'Active' ? <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider animate-pulse border border-blue-200">On The Clock</span> : <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-slate-200">Shift Ended</span>}</TableCell>
                        <TableCell>
                          {summary.notes && summary.notes.includes("DAILY STAND-UP UPDATE") ? (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded border border-emerald-200">Submitted</span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400">Not Filed</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {aggregatedData.length === 0 && <TableRow><TableCell colSpan={7} className="text-center p-8 text-slate-500">No time recorded yet.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}