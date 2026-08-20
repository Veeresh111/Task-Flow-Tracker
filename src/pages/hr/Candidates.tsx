import { useState, useEffect, useRef } from "react";
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

    (atsCandidates || []).forEach(ats => {
      if (ats.email && !profileEmails.has(ats.email.toLowerCase())) {
        mergedList.push({
          id: ats.id,
          name: ats.full_name || "Applicant",
          email: ats.email,
          phone: ats.phone || "—",
          created_at: ats.created_at,
          is_ats_only: true
        });
      }
    });

    setCandidates(mergedList);
    setLoading(false);
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    try {
      // Broadcast to registered candidates via candidate_notifications
      const targetCandidates = candidates.filter(c => !c.is_ats_only);
      if (targetCandidates.length > 0) {
        const notificationsPayload = targetCandidates.map(c => ({
          candidate_id: c.id,
          title: `[${type}] ${title}`,
          message: content,
          read: false
        }));
        const { error } = await supabase.from('candidate_notifications').insert(notificationsPayload);
        if (error) throw error;
      }

      toast({
        title: "Broadcast Dispatched",
        description: `Notification successfully sent to ${targetCandidates.length} registered candidate accounts.`
      });
      setTitle("");
      setContent("");
    } catch (err: any) {
      toast({ title: "Broadcast Failed", description: err.message, variant: "destructive" });
    }
  };

  // Open realtime chat drawer with candidate
  const openChatWithCandidate = async (cand: any) => {
    setActiveChatCandidate(cand);
    setChatMessages([]);

    if (chatChannelRef.current) {
      supabase.removeChannel(chatChannelRef.current);
    }

    if (!currentUserId) return;

    // Load initial direct chat messages between HR and this candidate
    const { data: history } = await supabase
      .from('candidate_direct_chats')
      .select('*')
      .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${cand.id}),and(sender_id.eq.${cand.id},recipient_id.eq.${currentUserId})`)
      .order('created_at', { ascending: true });

    setChatMessages(history || []);

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`direct_chat_${cand.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'candidate_direct_chats' },
        (payload) => {
          const newMsg = payload.new;
          if (
            (newMsg.sender_id === currentUserId && newMsg.recipient_id === cand.id) ||
            (newMsg.sender_id === cand.id && newMsg.recipient_id === currentUserId)
          ) {
            setChatMessages(prev => [...prev, newMsg]);
          }
        }
      )
      .subscribe();

    chatChannelRef.current = channel;
  };

  const closeChat = () => {
    if (chatChannelRef.current) {
      supabase.removeChannel(chatChannelRef.current);
      chatChannelRef.current = null;
    }
    setActiveChatCandidate(null);
    setChatMessages([]);
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatMessage.trim() || !activeChatCandidate || !currentUserId) return;

    setSendingChat(true);
    const { error } = await supabase.from('candidate_direct_chats').insert({
      sender_id: currentUserId,
      recipient_id: activeChatCandidate.id,
      message: newChatMessage.trim(),
      read: false
    });

    if (error) {
      toast({ title: "Send Failed", description: error.message, variant: "destructive" });
    } else {
      setNewChatMessage("");
    }
    setSendingChat(false);
  };

  return (
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
            <form onSubmit={handleBroadcast} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Post Type</label>
                <select className="w-full p-2 border border-slate-200 rounded-md text-sm outline-none bg-white" value={type} onChange={e => setType(e.target.value)}>
                  <option value="Announcement">Announcement</option>
                  <option value="Job Alert">Job Alert</option>
                  <option value="Interview Update">Interview Update</option>
                  <option value="System Notification">System Notification</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Title</label>
                <Input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. New Engineering Roles Open" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Message Content</label>
                <Textarea required value={content} onChange={e=>setContent(e.target.value)} rows={4} placeholder="Type your broadcast message to candidates..." />
              </div>
              <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                Broadcast Message
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-sm border-slate-200">
          <CardHeader className="bg-slate-50 border-b flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2"><Users className="w-5 h-5 text-blue-600"/> Registered & Talent Pool Candidates</CardTitle>
            <span className="text-xs font-semibold bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full">{candidates.length} Total</span>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600"/></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold">Candidate Name</TableHead>
                    <TableHead className="font-bold">Contact Email</TableHead>
                    <TableHead className="font-bold">Account Type</TableHead>
                    <TableHead className="font-bold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((cand) => (
                    <TableRow key={cand.id}>
                      <TableCell className="font-bold text-slate-800">{cand.name || cand.full_name}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">{cand.email}</TableCell>
                      <TableCell>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${cand.is_ats_only ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                          {cand.is_ats_only ? 'Applicant' : 'Registered User'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openChatWithCandidate(cand)} className="gap-1 text-xs border-slate-300">
                          <MessageSquare className="w-3.5 h-3.5 text-indigo-600" /> Direct Chat
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {candidates.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center p-8 text-slate-500">No candidates registered yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* REALTIME DIRECT CHAT SLIDE-OVER DRAWER */}
      {activeChatCandidate && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-200">
          <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="font-bold text-sm">Chat: {activeChatCandidate.name || activeChatCandidate.full_name}</h3>
                <p className="text-[10px] text-slate-400">Secure Pre-Hire Communication</p>
              </div>
            </div>
            <button onClick={closeChat} className="text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
            {chatMessages.length === 0 && <p className="text-center text-xs text-slate-400 p-8 border-2 border-dashed rounded-xl">No prior communication with {activeChatCandidate.name || activeChatCandidate.full_name}. Send a message below.</p>}
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
            <Input value={newChatMessage} onChange={(e) => setNewChatMessage(e.target.value)} placeholder={`Message ${activeChatCandidate.name || activeChatCandidate.full_name}...`} className="flex-1 text-sm bg-slate-50" disabled={sendingChat} />
            <Button type="submit" size="icon" disabled={!newChatMessage.trim() || sendingChat} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shrink-0">
              {sendingChat ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}