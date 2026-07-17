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
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let channel: any;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("candidate_id")
        .eq("id", user.id)
        .maybeSingle();

      const cid = profile?.candidate_id || user.id;
      setCandidateId(cid);

      const { data: anns } = await supabase.from('company_announcements').select('*').order('created_at', { ascending: false });
      if (anns) setAnnouncements(anns);

      const { data: msgs } = await supabase.from('candidate_hr_messages').select('*').eq('candidate_id', cid).order('created_at', { ascending: true });
      if (msgs) setMessages(msgs);

      channel = supabase.channel(`candidate-chat-${cid}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'candidate_hr_messages', filter: `candidate_id=eq.${cid}` }, (payload) => {
          setMessages(prev => [...prev, payload.new]);
        })
        .subscribe();
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !candidateId) return;
    setSending(true);

    const { error } = await supabase.from('candidate_hr_messages').insert([{
      candidate_id: candidateId,
      sender_id: candidateId,
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
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 rounded-xl shadow-xl text-white">
          <h1 className="text-2xl font-black flex items-center gap-2"><ShieldCheck className="text-emerald-400 w-6 h-6" /> Corporate Communications Hub</h1>
          <p className="text-sm text-slate-300 mt-1">Secure real-time chat and corporate announcements.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="bg-slate-50 border-b pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2"><Building2 className="w-4 h-4 text-indigo-600" /> Corporate Announcements</CardTitle>
              </CardHeader>
              <CardContent className="p-4 max-h-[400px] overflow-y-auto">
                {announcements.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-8 font-medium">No corporate announcements at this time.</p>
                )}
                {announcements.map((a, i) => (
                  <div key={i} className="border-b border-slate-100 pb-3 mb-3 last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Megaphone className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-xs font-bold text-slate-400 uppercase">{a.type || 'General'}</span>
                    </div>
                    <p className="font-bold text-slate-800 text-sm">{a.title}</p>
                    <p className="text-xs text-slate-500 mt-1">{a.content}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{new Date(a.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="border-slate-200 shadow-sm h-full flex flex-col">
              <CardHeader className="bg-slate-50 border-b pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2"><User className="w-4 h-4 text-indigo-600" /> HR Private Channel</CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex-1 flex flex-col">
                <div className="flex-1 max-h-[300px] overflow-y-auto space-y-3 mb-4">
                  {messages.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-8">No messages yet. Start a conversation with HR.</p>
                  )}
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.sender_id === candidateId ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${msg.sender_id === candidateId ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                        <p>{msg.message}</p>
                        <p className="text-[10px] opacity-70 mt-1">{new Date(msg.created_at).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={sendMessage} className="flex gap-2">
                  <Input placeholder="Type your message..." value={newMessage} onChange={e => setNewMessage(e.target.value)} className="flex-1 text-sm" disabled={sending} />
                  <Button type="submit" size="sm" disabled={sending || !newMessage.trim()} className="bg-indigo-600 hover:bg-indigo-700">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
