import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Users, Megaphone, Loader2, MessageSquare, X, Send, User, Building2 } from "lucide-react";

export default function HRCandidates() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("Announcement");
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // HR to Candidate Chat States
  const [activeChatCandidate, setActiveChatCandidate] = useState<any | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newChatMessage, setNewChatMessage] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const fetchData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);

    // Fetch registered candidate profiles
    const { data: profileCandidates } = await supabase.from('profiles').select('*').eq('role', 'candidate');
    
    // Fetch ATS candidates (applied via public job forms)
    const { data: atsCandidates } = await supabase.from('candidates').select('id, full_name, email, phone, created_at');

    // Merge: start with profile candidates, add ATS-only candidates
    const profileEmails = new Set((profileCandidates || []).map(p => p.email?.toLowerCase()));
    const mergedList = [...(profileCandidates || [])];

    (atsCandidates || []).forEach(atsCand => {
      if (!profileEmails.has(atsCand.email?.toLowerCase())) {
        mergedList.push({
          id: atsCand.id,
          name: atsCand.full_name,
          email: atsCand.email,
          phone: atsCand.phone,
          created_at: atsCand.created_at,
          role: 'candidate',
          _source: 'ats'
        });
      }
    });

    setCandidates(mergedList);
    setLoading(false);
  };

  const postAnnouncement = async () => {
    if (!title || !content) return;
    const { error } = await supabase.from('company_announcements').insert([{ title, content, type }]);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Posted", description: `Corporate ${type} published to all Candidate portals.` });
      setTitle(""); setContent("");
    }
  };

  // --- HR CHAT LOGIC ---
  const openChat = async (candidate: any) => {
    if (chatChannelRef.current) {
      supabase.removeChannel(chatChannelRef.current);
      chatChannelRef.current = null;
    }
    setActiveChatCandidate(candidate);
    const { data } = await supabase.from('candidate_hr_messages').select('*').eq('candidate_id', candidate.id).order('created_at', { ascending: true });
    if (data) setChatMessages(data);

    chatChannelRef.current = supabase.channel(`hr_chat_${candidate.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'candidate_hr_messages', filter: `candidate_id=eq.${candidate.id}` }, (payload) => {
        setChatMessages(prev => [...prev, payload.new]);
      }).subscribe();
  };

  const closeChat = () => {
    if (chatChannelRef.current) {
      supabase.removeChannel(chatChannelRef.current);
      chatChannelRef.current = null;
    }
    setActiveChatCandidate(null);
    setChatMessages([]);
  };

  useEffect(() => {
    return () => {
      if (chatChannelRef.current) {
        supabase.removeChannel(chatChannelRef.current);
        chatChannelRef.current = null;
      }
    };
  }, []);

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatMessage.trim() || !activeChatCandidate || !currentUserId) return;
    setSendingChat(true);

    const { error } = await supabase.from('candidate_hr_messages').insert([{
      candidate_id: activeChatCandidate.id,
      sender_id: currentUserId,
      message: newChatMessage.trim()
    }]);

    if (error) {
      toast({ title: "Send Failed", description: error.message, variant: "destructive" });
    } else {
      setNewChatMessage("");
    }
    setSendingChat(false);
  };

  return (
    <DashboardLayout role="hr">
      <div className="max-w-7xl mx-auto space-y-6 pb-12 relative">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Candidates & Communications</h1>
            <p className="text-slate-500 mt-1">Manage external talent, broadcast opportunities, and reply securely.</p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-1 shadow-sm border-slate-200 h-max">
            <CardHeader className="bg-slate-50 border-b">
              <CardTitle className="text-lg flex items-center gap-2"><Megaphone className="w-5 h-5 text-indigo-600"/> Broadcast to Candidates</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Post Type</label>
                <select className="w-full p-2 border rounded-md text-sm outline-none" value={type} onChange={e=>setType(e.target.value)}>
                  <option value="Announcement">General Announcement</option>
                  <option value="Job Opening">Job Opening</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Title</label>
                <Input placeholder="E.g. Mass Hiring Drive 2026" value={title} onChange={e=>setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Message</label>
                <Textarea className="h-32 resize-none" placeholder="Enter details or application link..." value={content} onChange={e=>setContent(e.target.value)} />
              </div>
              <Button onClick={postAnnouncement} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold">Deploy to Portal</Button>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 shadow-sm border-slate-200">
            <CardHeader className="bg-slate-50 border-b">
              <CardTitle className="text-lg flex items-center gap-2"><Users className="w-5 h-5 text-indigo-600"/> Registered Candidates ({candidates.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600"/></div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-bold">Name</TableHead>
                      <TableHead className="font-bold">Email</TableHead>
                      <TableHead className="font-bold">Registered</TableHead>
                      <TableHead className="text-right font-bold">Secure Contact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-bold text-slate-800">{c.name}</TableCell>
                        <TableCell className="text-slate-600">{c.email}</TableCell>
                        <TableCell className="text-slate-500">{new Date(c.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => openChat(c)} className="border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100">
                            <MessageSquare className="w-4 h-4 mr-2"/> Message
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {candidates.length === 0 && <TableRow><TableCell colSpan={4} className="text-center p-8">No registered candidates yet.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* SECURE HR -> CANDIDATE CHAT MODAL */}
        {activeChatCandidate && (
          <div className="fixed bottom-6 right-6 w-[400px] h-[550px] bg-white rounded-2xl shadow-2xl z-50 flex flex-col border border-slate-300 overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300">
            <div className="bg-slate-900 p-4 flex justify-between items-center text-white">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-500/30 p-2 rounded-lg"><Building2 className="w-5 h-5 text-indigo-300"/></div>
                <div>
                  <h3 className="font-bold text-sm">Chat: {activeChatCandidate.name}</h3>
                  <p className="text-[10px] text-slate-400">Secure Pre-Hire Communication</p>
                </div>
              </div>
              <button onClick={closeChat} className="text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {chatMessages.length === 0 && <p className="text-center text-xs text-slate-400 p-8 border-2 border-dashed rounded-xl">No prior communication with {activeChatCandidate.name}. Send a message below.</p>}
              {chatMessages.map((msg, idx) => {
                const isHR = msg.sender_id === currentUserId;
                return (
                  <div key={idx} className={`flex flex-col ${isHR ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-end gap-2 mb-1">
                      {!isHR && <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center"><User className="w-3 h-3 text-slate-600"/></div>}
                      <div className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-sm whitespace-pre-wrap ${isHR ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'}`}>
                        {msg.message}
                      </div>
                      {isHR && <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center"><Building2 className="w-3 h-3 text-indigo-700"/></div>}
                    </div>
                    <span className="text-[9px] text-slate-400 px-8">{new Date(msg.created_at).toLocaleTimeString()}</span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendChatMessage} className="p-3 bg-white border-t border-slate-200 flex gap-2">
              <Input value={newChatMessage} onChange={(e) => setNewChatMessage(e.target.value)} placeholder={`Message ${activeChatCandidate.name}...`} className="flex-1 text-sm bg-slate-50" disabled={sendingChat} />
              <Button type="submit" size="icon" disabled={!newChatMessage.trim() || sendingChat} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shrink-0">
                {sendingChat ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
              </Button>
            </form>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}