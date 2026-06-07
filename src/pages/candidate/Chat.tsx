import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Send, Megaphone, User, Building2, ShieldCheck, Loader2 } from "lucide-react";

export default function CandidateChat() {
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    // 1. Fetch Corporate Announcements
    const { data: anns } = await supabase.from('company_announcements').select('*').order('created_at', { ascending: false });
    if (anns) setAnnouncements(anns);

    // 2. Fetch Secure Private Chat with HR
    const { data: msgs } = await supabase.from('candidate_hr_messages').select('*').eq('candidate_id', user.id).order('created_at', { ascending: true });
    if (msgs) setMessages(msgs);

    // 3. Real-time subscription to incoming HR replies
    const channel = supabase.channel('candidate_hr_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'candidate_hr_messages', filter: `candidate_id=eq.${user.id}` }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId) return;
    setSending(true);

    const { error } = await supabase.from('candidate_hr_messages').insert([{
      candidate_id: userId,
      sender_id: userId,
      message: newMessage.trim()
    }]);

    if (error) {
      toast({ title: "Failed to send", description: error.message, variant: "destructive" });
    } else {
      setNewMessage("");
    }
    setSending(false);
  };

  return (
    <DashboardLayout role="candidate">
      <div className="max-w-7xl mx-auto h-[calc(100vh-120px)] flex flex-col md:flex-row gap-6">
        
        {/* LEFT PANEL: Official Corporate Announcements */}
        <div className="w-full md:w-1/3 flex flex-col gap-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Megaphone className="w-6 h-6 text-indigo-600"/> Announcements</h1>
            <p className="text-slate-500 text-sm mt-1">Official FWC updates and job openings.</p>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar">
            {announcements.map((ann, idx) => (
              <Card key={idx} className="shadow-sm border-slate-200">
                <CardHeader className="bg-indigo-50 border-b p-4">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-bold text-indigo-900">{ann.title}</CardTitle>
                    <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">{ann.type}</span>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{ann.content}</p>
                  <p className="text-[10px] text-slate-400 mt-4 text-right">{new Date(ann.created_at).toLocaleString()}</p>
                </CardContent>
              </Card>
            ))}
            {announcements.length === 0 && <div className="text-center p-8 text-slate-400 text-sm font-medium border-2 border-dashed rounded-xl">No active announcements.</div>}
          </div>
        </div>

        {/* RIGHT PANEL: Secure Direct Line to HR */}
        <div className="w-full md:w-2/3 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-900 p-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-500/20 p-2 rounded-lg"><ShieldCheck className="w-5 h-5 text-indigo-400"/></div>
              <div>
                <h3 className="font-bold text-white text-sm">Secure HR Communication</h3>
                <p className="text-[10px] text-slate-400">Direct encrypted line to the Recruitment Team</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3 opacity-50">
                <Building2 className="w-16 h-16"/>
                <p className="text-sm font-medium">Start a secure conversation with HR regarding your application.</p>
              </div>
            )}
            {messages.map((msg, idx) => {
              const isMe = msg.sender_id === userId;
              return (
                <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-end gap-2 mb-1">
                    {!isMe && <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center"><Building2 className="w-3 h-3 text-indigo-700"/></div>}
                    <div className={`max-w-[80%] rounded-2xl p-3 text-sm shadow-sm whitespace-pre-wrap ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'}`}>
                      {msg.message}
                    </div>
                    {isMe && <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center"><User className="w-3 h-3 text-slate-600"/></div>}
                  </div>
                  <span className="text-[9px] text-slate-400 px-8">{new Date(msg.created_at).toLocaleTimeString()}</span>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} className="p-4 bg-white border-t border-slate-200 flex gap-2">
            <Input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type a message to HR securely..." className="flex-1 bg-slate-50 border-slate-200 h-12" disabled={sending} />
            <Button type="submit" disabled={!newMessage.trim() || sending} className="h-12 px-6 bg-indigo-600 hover:bg-indigo-700 font-bold text-white shadow-sm">
              {sending ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Send className="w-4 h-4 mr-2"/> Send</>}
            </Button>
          </form>
        </div>

      </div>
    </DashboardLayout>
  );
}