import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Send, Loader2, Trash2, Hash, UserCircle, Video, ShieldAlert, Search, Filter, Megaphone } from "lucide-react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

export default function UniversalSmartChat() {
  const [messages, setMessages] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  
  const [activeChat, setActiveChat] = useState<string>("GLOBAL"); 
  const [newMessage, setNewMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // NEW: Smart Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [smartFilter, setSmartFilter] = useState("All");

  const location = useLocation(); 
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    initChat();

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
    if (!user) return;
    setUserId(user.id);

    // Fetch the logged-in user's profile for the Smart Context Engine
    const { data: myProfile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (myProfile) setCurrentUserProfile(myProfile);

    // Fetch all users for the DM sidebar
    const { data: profiles } = await supabase.from('profiles').select('id, name, role, department, team_lead_id').neq('id', user.id);
    if (profiles) setUsers(profiles);

    // FOOLPROOF CATCHER ENGINE (Untouched)
    const routedUserId = location.state?.selectedUserId || searchParams.get('userId') || localStorage.getItem('activeChatUserId');
    let targetChatId = "GLOBAL";
    
    if (routedUserId) {
      targetChatId = routedUserId;
      localStorage.removeItem('activeChatUserId');
      localStorage.removeItem('activeChatUserName');
    }

    setActiveChat(targetChatId);
    await loadMessages(targetChatId, user.id);
  };

  const loadMessages = async (chatId: string, currentUserId: string | null = userId) => {
    if (chatId === "BROADCAST") {
      setMessages([]); // Broadcast is a virtual channel, no history to show
      setLoading(false);
      return;
    }

    setLoading(true);
    let query = supabase.from('messages').select('*').order('created_at', { ascending: true });

    if (chatId === "GLOBAL") {
      query = query.is('receiver_id', null);
    } else {
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

  // NEW: Intelligent Filter Engine
  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          u.role?.toLowerCase().includes(searchQuery.toLowerCase());

    if (smartFilter === "All") return matchesSearch;

    if (smartFilter === "Team") {
      const myRole = currentUserProfile?.role?.toUpperCase();
      
      if (myRole === "ADMIN") {
        // Admin sees all Team Leads as their direct "Team"
        return matchesSearch && u.role?.toUpperCase() === "TEAM_LEAD";
      } else if (myRole === "TEAM_LEAD" || myRole === "TL") {
        // TL sees explicitly assigned employees OR same department
        return matchesSearch && (u.team_lead_id === currentUserProfile.id || (u.department === currentUserProfile.department && u.role?.toUpperCase() === 'EMPLOYEE'));
      } else {
        // Employee sees people in the exact same department
        return matchesSearch && u.department === currentUserProfile.department;
      }
    }
    return matchesSearch;
  });

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId) return;
    
    const text = newMessage;
    setNewMessage("");

    // NEW: Broadcast Logic (Sends DMs to everyone in filtered list)
    if (activeChat === "BROADCAST") {
      const payloads = filteredUsers.map(u => ({
        sender_id: userId,
        content: `📢 [BROADCAST]: ${text}`,
        receiver_id: u.id
      }));
      await supabase.from('messages').insert(payloads);
      toast({ title: "Broadcast Dispatched", description: `Message delivered to ${filteredUsers.length} workspace members.` });
      return;
    }

    // Standard Logic
    await supabase.from('messages').insert([{ 
      sender_id: userId, 
      content: text,
      receiver_id: activeChat === "GLOBAL" ? null : activeChat 
    }]);
  };

  const deleteMessage = async (messageId: string) => {
    await supabase.from('messages').delete().eq('id', messageId);
  };

  const startVideoMeeting = async () => {
    const roomName = `Workflow_Meeting_${Math.random().toString(36).substring(7)}`;
    const meetingUrl = `https://meet.jit.si/${roomName}`;
    
    if (activeChat === "BROADCAST") {
      // Send private DM meeting links to the entire filtered group
      const payloads = filteredUsers.map(u => ({
        sender_id: userId,
        content: `🎥 JOIN SECURE TEAM MEETING: ${meetingUrl}`,
        receiver_id: u.id
      }));
      await supabase.from('messages').insert(payloads);
      toast({ title: "Team Meeting Started", description: `Private invites sent to ${filteredUsers.length} members.` });
    } else {
      // Standard single DM or Global Meeting
      await supabase.from('messages').insert([{ 
        sender_id: userId, 
        content: `🎥 JOIN VIDEO MEETING: ${meetingUrl}`,
        receiver_id: activeChat === "GLOBAL" ? null : activeChat 
      }]);
    }

    window.open(meetingUrl, "_blank");
  };

  // Formatters
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const getUserName = (id: string) => users.find(u => u.id === id)?.name || "Unknown";
  
  const getActiveChatName = () => {
    if (activeChat === "GLOBAL") return "# general";
    if (activeChat === "BROADCAST") return `📢 Broadcasting to ${filteredUsers.length} Users`;
    return users.find(u => u.id === activeChat)?.name || "Chat";
  };

  // Determine current user layout fallback (since this is universal)
  const currentLayoutRole = currentUserProfile?.role?.toLowerCase() || 'employee';

  return (
    <DashboardLayout role={currentLayoutRole}>
      <div className="max-w-6xl mx-auto h-[calc(100vh-120px)] flex bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden animate-fade-in">
        
        {/* LEFT SIDEBAR: CHANNELS & DMs */}
        <div className="w-72 bg-slate-50 border-r border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-200 bg-slate-100">
            <h2 className="font-bold text-slate-800 tracking-tight">Office Comms</h2>
            
            {/* NEW: Smart Search & Filter Box */}
            <div className="mt-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search network..." 
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select 
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none bg-white shadow-sm font-medium"
                  value={smartFilter}
                  onChange={(e) => setSmartFilter(e.target.value)}
                >
                  <option value="All">All Workspace Users</option>
                  <option value="Team">
                    {currentUserProfile?.role === "ADMIN" ? "All Team Leads" : "My Specific Team"}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-6 custom-scrollbar">
            
            {/* Channels */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-2">Channels</p>
              <button 
                onClick={() => switchChat("GLOBAL")}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors mb-1 ${activeChat === "GLOBAL" ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-200"}`}
              >
                <Hash className="w-4 h-4" /> general
              </button>

              {/* NEW: Virtual Broadcast Channel (Only shows if filtered) */}
              {smartFilter === "Team" && (
                <button 
                  onClick={() => switchChat("BROADCAST")}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-bold transition-colors shadow-sm border ${activeChat === "BROADCAST" ? "bg-indigo-600 text-white border-indigo-700" : "bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100"}`}
                >
                  <Megaphone className="w-4 h-4" /> Broadcast to Filtered
                </button>
              )}
            </div>

            {/* Direct Messages */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-2 flex justify-between">
                <span>Direct Messages</span>
                <span className="text-slate-400 bg-slate-200 px-1.5 rounded-full">{filteredUsers.length}</span>
              </p>
              <div className="space-y-1">
                {filteredUsers.map(u => (
                  <button 
                    key={u.id}
                    onClick={() => switchChat(u.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${activeChat === u.id ? "bg-blue-100 text-blue-700 font-bold" : "text-slate-600 font-medium hover:bg-slate-200"}`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <UserCircle className={`w-4 h-4 shrink-0 ${activeChat === u.id ? "text-blue-600" : "text-slate-400"}`} /> 
                      <span className="truncate">{u.name}</span>
                    </div>
                    {/* Small Role Indicator */}
                    <span className="text-[9px] uppercase tracking-wider bg-white/50 text-slate-400 px-1.5 rounded border">
                      {u.role === 'ADMIN' ? 'ADM' : u.role === 'TEAM_LEAD' ? 'TL' : 'EMP'}
                    </span>
                  </button>
                ))}
                {filteredUsers.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-slate-400 font-medium bg-slate-100 rounded-md border border-dashed border-slate-300">
                    No users match your criteria.
                  </div>
                )}
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
              <Button onClick={startVideoMeeting} variant={activeChat === "BROADCAST" ? "default" : "outline"} className={`shadow-sm ${activeChat === "BROADCAST" ? "bg-indigo-600 hover:bg-indigo-700" : "text-blue-600 border-blue-200 hover:bg-blue-50"}`}>
                <Video className="w-4 h-4 mr-2" /> 
                {activeChat === "BROADCAST" ? "Start Bulk Meeting" : "Start Meeting"}
              </Button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/50">
            {loading ? <div className="flex justify-center mt-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div> : (
              activeChat === "BROADCAST" ? (
                <div className="flex flex-col items-center justify-center h-full text-indigo-500 animate-pulse">
                  <Megaphone className="w-16 h-16 mb-4 opacity-40" />
                  <h3 className="font-bold text-lg text-indigo-800">Broadcast Mode Active</h3>
                  <p className="text-sm font-medium opacity-80 text-center max-w-sm mt-2">
                    Anything typed here will be sent as a private Direct Message to all {filteredUsers.length} users in your currently filtered list.
                  </p>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <ShieldAlert className="w-12 h-12 mb-2 opacity-20" />
                  <p>This is the start of your secure conversation.</p>
                </div>
              ) : (
                messages.map((msg: any) => {
                  const isMe = msg.sender_id === userId;
                  const isVideoLink = msg.content.includes("JOIN");

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
                              <p className="font-bold text-sm mb-3">Video Meeting Request</p>
                              <a href={msg.content.split(" ").pop()} target="_blank" rel="noreferrer" className="bg-white text-blue-600 text-xs font-bold px-4 py-2 rounded-full hover:bg-blue-50 transition-colors">
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
                placeholder={activeChat === "BROADCAST" ? `Type broadcast message for ${filteredUsers.length} users...` : `Message ${getActiveChatName()}...`}
                value={newMessage} 
                onChange={(e) => setNewMessage(e.target.value)} 
              />
              <Button type="submit" disabled={!newMessage.trim()} className={`shadow-sm px-6 ${activeChat === "BROADCAST" ? "bg-indigo-600 hover:bg-indigo-700" : "bg-blue-600 hover:bg-blue-700"} text-white`}>
                {activeChat === "BROADCAST" ? <Megaphone className="w-4 h-4 mr-2" /> : <Send className="w-4 h-4 mr-2" />} 
                {activeChat === "BROADCAST" ? "Dispatch" : "Send"}
              </Button>
            </form>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}