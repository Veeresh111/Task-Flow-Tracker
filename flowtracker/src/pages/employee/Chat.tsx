import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Send, User } from "lucide-react";

export default function EmployeeChat() {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
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

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('*, profiles(name, role)')
        .order('created_at', { ascending: true });
      if (data) setMessages(data);
    };
    fetchMessages();
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userProfile) return;

    const messageToSend = newMessage;
    setNewMessage("");

    await supabase.from('chat_messages').insert([
      { sender_id: userProfile.id, message: messageToSend }
    ]);
    
    setMessages(prev => [...prev, {
      id: Math.random(),
      message: messageToSend,
      profiles: { name: userProfile.name, role: userProfile.role },
      sender_id: userProfile.id
    }]);
  };

  return (
    <DashboardLayout role="employee">
      <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Company Chat</h1>
          <p className="text-muted-foreground">Real-time communication with the entire startup.</p>
        </div>

        <Card className="flex-1 flex flex-col shadow-lg border-0 overflow-hidden">
          <CardHeader className="border-b bg-gray-50 pb-4">
            <CardTitle className="text-lg">Global Channel</CardTitle>
          </CardHeader>
          
          <CardContent className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
            {messages.length === 0 ? (
              <div className="text-center text-gray-400 mt-12">No messages yet. Be the first to say hello!</div>
            ) : (
              messages.map((msg, index) => {
                const isMe = msg.sender_id === userProfile?.id;
                return (
                  <div key={index} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] flex gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isMe ? 'bg-blue-600' : 'bg-gray-300'}`}>
                        <User className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className={`text-xs mb-1 ${isMe ? 'text-right text-blue-600' : 'text-left text-gray-500'}`}>
                          {msg.profiles?.name || 'Unknown'} <span className="uppercase text-[10px]">({msg.profiles?.role})</span>
                        </div>
                        <div className={`p-3 rounded-2xl ${isMe ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white border rounded-tl-sm shadow-sm'}`}>
                          {msg.message}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>

          <div className="p-4 bg-white border-t">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <Input 
                value={newMessage} 
                onChange={(e) => setNewMessage(e.target.value)} 
                placeholder="Type your message here..." 
                className="flex-1 h-12 rounded-full px-6 bg-gray-50"
              />
              <Button type="submit" className="h-12 w-12 rounded-full bg-blue-600 hover:bg-blue-700 p-0">
                <Send className="w-5 h-5 ml-1" />
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}