import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Send, Loader2, Trash2, Hash, UserCircle, Video, ShieldAlert } from "lucide-react";

export default function EmployeeChat() {
  const [messages, setMessages] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [activeChat, setActiveChat] = useState<string>("GLOBAL"); // 'GLOBAL' or user.id
  const [newMessage, setNewMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initChat();

    // REAL-TIME ENGINE: Listens for new messages AND deleted messages
    const channel = supabase.channel('office-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
        scrollToBottom();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        setMessages(prev => prev.filter(msg => msg.id !== payload.old.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const initChat = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setUserId(user.id);

    // Fetch all users for the Direct Message sidebar
    const { data: profiles } = await supabase.from('profiles').select('id, name, role').neq('id', user?.id || '');
    if (profiles) setUsers(profiles);

    await loadMessages("GLOBAL", user?.id);
  };

  const loadMessages = async (chatId: string, currentUserId: string | null = userId) => {
    setLoading(true);
    let query = supabase.from('messages').select('*').order('created_at', { ascending: true });

    if (chatId === "GLOBAL") {
      query = query.is('receiver_id', null); // Global chat has no specific receiver
    } else {
      // 1-to-1 DM logic: (sender=me AND receiver=them) OR (sender=them AND receiver=me)
      query = query.or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${chatId}),and(sender_id.eq.${chatId},receiver_id.eq.${currentUserId})`);
    }

    const { data } = await query;
    if (data) setMessages(data);
    setLoading(false);
    scrollToBottom();
  };

  const switchChat = (id: string) => {
    setActiveChat(id);
    loadMessages(id);
  };

  const scrollToBottom = () => setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId) return;
    
    const text = newMessage;
    setNewMessage(""); // Clear input instantly

    await supabase.from('messages').insert([{ 
      sender_id: userId, 
      content: text,
      receiver_id: activeChat === "GLOBAL" ? null : activeChat 
    }]);
  };

  const deleteMessage = async (messageId: string) => {
    await supabase.from('messages').delete().eq('id', messageId);
  };

  const startVideoMeeting = () => {
    // Generates a secure, unique Enterprise Video Room
    const roomName = `Workflow_Meeting_${Math.random().toString(36).substring(7)}`;
    const meetingUrl = `https://meet.jit.si/${roomName}`;
    
    // Auto-send the link into the chat
    supabase.from('messages').insert([{ 
      sender_id: userId, 
      content: `🎥 JOIN VIDEO MEETING: ${meetingUrl}`,
      receiver_id: activeChat === "GLOBAL" ? null : activeChat 
    }]);

    // Open the meeting for the user who clicked it
    window.open(meetingUrl, "_blank");
  };

  // Formatters
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const getUserName = (id: string) => users.find(u => u.id === id)?.name || "Unknown";
  const getActiveChatName = () => activeChat === "GLOBAL" ? "# general" : users.find(u => u.id === activeChat)?.name;

  return (
    <DashboardLayout role="employee">
      <div className="max-w-6xl mx-auto h-[calc(100vh-120px)] flex bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        
        {/* LEFT SIDEBAR: CHANNELS & DMs */}
        <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-200 bg-slate-100">
            <h2 className="font-bold text-slate-800 tracking-tight">Office Comms</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-6 custom-scrollbar">
            
            {/* Channels */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-2">Channels</p>
              <button 
                onClick={() => switchChat("GLOBAL")}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeChat === "GLOBAL" ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-200"}`}
              >
                <Hash className="w-4 h-4" /> general
              </button>
            </div>

            {/* Direct Messages */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-2">Direct Messages</p>
              <div className="space-y-1">
                {users.map(u => (
                  <button 
                    key={u.id}
                    onClick={() => switchChat(u.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeChat === u.id ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-200"}`}
                  >
                    <UserCircle className="w-4 h-4 text-slate-400" /> 
                    <span className="truncate">{u.name}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* RIGHT AREA: THE CHAT WINDOW */}
        <div className="flex-1 flex flex-col bg-white">
          
          {/* Chat Header */}
          <div className="h-16 border-b border-slate-200 flex items-center justify-between px-6 bg-white">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-lg text-slate-800">{getActiveChatName()}</h2>
              {activeChat === "GLOBAL" && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">Company Wide</span>}
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={startVideoMeeting} variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50">
                <Video className="w-4 h-4 mr-2" /> Start Meeting
              </Button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/50">
            {loading ? <div className="flex justify-center mt-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : (
              messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <ShieldAlert className="w-12 h-12 mb-2 opacity-20" />
                  <p>This is the start of your secure conversation.</p>
                </div>
              ) : (
                messages.map((msg: any) => {
                  const isMe = msg.sender_id === userId;
                  const isVideoLink = msg.content.includes("🎥 JOIN VIDEO MEETING:");

                  return (
                    <div key={msg.id} className={`flex w-full group ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`flex flex-col max-w-[70%] ${isMe ? "items-end" : "items-start"}`}>
                        
                        {/* Sender Name */}
                        {!isMe && <span className="text-xs text-slate-500 font-bold mb-1 ml-1">{getUserName(msg.sender_id)}</span>}
                        
                        <div className="flex items-center gap-2">
                          {/* Trash Icon (Only shows for your messages when hovered) */}
                          {isMe && (
                            <button onClick={() => deleteMessage(msg.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-red-400 hover:bg-red-50 rounded-md">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* The Message Bubble */}
                          {isVideoLink ? (
                            <div className="bg-blue-600 text-white p-4 rounded-xl shadow-sm rounded-br-none border border-blue-700 text-center">
                              <Video className="w-8 h-8 mx-auto mb-2 opacity-80" />
                              <p className="font-bold text-sm mb-3">Video Meeting Started</p>
                              <a href={msg.content.replace("🎥 JOIN VIDEO MEETING: ", "")} target="_blank" rel="noreferrer" className="bg-white text-blue-600 text-xs font-bold px-4 py-2 rounded-full hover:bg-blue-50 transition-colors">
                                Click to Join
                              </a>
                            </div>
                          ) : (
                            <div className={`px-4 py-2.5 rounded-2xl shadow-sm border ${isMe ? "bg-blue-600 text-white rounded-br-sm border-blue-700" : "bg-white text-slate-800 rounded-bl-sm border-slate-200"}`}>
                              <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            </div>
                          )}
                        </div>

                        {/* Timestamp */}
                        <span className="text-[10px] text-slate-400 font-medium mt-1 mx-1">{formatTime(msg.created_at)}</span>
                      </div>
                    </div>
                  );
                })
              )
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white border-t border-slate-200">
            <form onSubmit={sendMessage} className="flex gap-3">
              <Input 
                className="flex-1 bg-slate-50 border-slate-200 focus-visible:ring-1 focus-visible:ring-blue-500 shadow-sm" 
                placeholder={`Message ${getActiveChatName()}...`}
                value={newMessage} 
                onChange={(e) => setNewMessage(e.target.value)} 
              />
              <Button type="submit" disabled={!newMessage.trim()} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm px-6">
                <Send className="w-4 h-4 mr-2" /> Send
              </Button>
            </form>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}