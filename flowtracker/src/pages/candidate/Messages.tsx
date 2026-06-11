import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, ShieldAlert } from "lucide-react";

export default function CandidateMessages() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [resolvedCandidateId, setResolvedCandidateId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    resolveCandidateIdentity();
  }, []);

  useEffect(() => {
    if (!resolvedCandidateId) return;
    const channel = supabase
      .channel(`candidate-stream-${resolvedCandidateId}`)
      .on(
        "postgres_changes",
        { 
          event: "INSERT", 
          schema: "public", 
          table: "candidate_hr_messages", 
          filter: `candidate_id=eq.${resolvedCandidateId}` 
        }, 
        () => fetchChannelHistory(resolvedCandidateId)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [resolvedCandidateId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // FIXED: Use profiles.id as the universal candidate identity
  const resolveCandidateIdentity = async () => {
    try {
      setIsLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;

      setAuthUid(user.id);

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, name, email")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      if (!profile) {
        throw new Error("Profile record not found. Please complete your profile.");
      }

      setResolvedCandidateId(profile.id);
      await fetchChannelHistory(profile.id);

    } catch (err: any) {
      toast({
        title: "Identification Error",
        description: err.message || "Could not resolve your candidate identity.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchChannelHistory = async (candidateId: string) => {
    const { data, error } = await supabase
      .from("candidate_hr_messages")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setMessages(data);
    }
  };

  const handleDispatchMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !resolvedCandidateId || !authUid) return;

    try {
      const { error } = await supabase.from("candidate_hr_messages").insert([
        {
          candidate_id: resolvedCandidateId,
          sender_id: authUid,
          message: newMessage.trim()
        }
      ]);

      if (error) throw error;

      setNewMessage("");
      await fetchChannelHistory(resolvedCandidateId);
    } catch (err: any) {
      toast({ 
        title: "Transmission Failed", 
        description: err.message, 
        variant: "destructive" 
      });
    }
  };

  return (
    <div className="p-6 h-[calc(100vh-80px)] flex flex-col max-w-4xl mx-auto space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">HR Relations Desktop</h1>
        <p className="text-gray-500 font-normal">Direct point-to-point text verified channel connection with corporate HR recruitment leads.</p>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden border border-gray-200 shadow-md rounded-xl">
        <CardHeader className="bg-gray-50/50 border-b border-gray-100 px-4 py-3 flex flex-row items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-blue-600" />
          <CardTitle className="text-sm font-semibold tracking-wide uppercase text-gray-600">Enterprise Audited Interaction Log</CardTitle>
        </CardHeader>
       
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50/10">
              {messages.length === 0 ? (
                <p className="text-xs text-center text-gray-400 p-8">
                  No conversation tracking metrics discovered. Post an inquiry to alert HR desks.
                </p>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.sender_id === authUid ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] p-3 text-sm rounded-xl shadow-sm ${msg.sender_id === authUid ? "bg-blue-600 text-white rounded-br-none" : "bg-white border border-gray-100 text-gray-900 rounded-bl-none"}`}>
                      {msg.message}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleDispatchMessage} className="p-3 border-t border-gray-100 bg-white flex gap-2">
              <Input 
                value={newMessage} 
                onChange={(e) => setNewMessage(e.target.value)} 
                placeholder="Type communication request data stream..." 
                className="flex-1" 
              />
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}