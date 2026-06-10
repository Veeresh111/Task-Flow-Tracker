import { useState, useEffect, useRef, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Send, Loader2, Trash2, Hash, UserCircle, Video, ShieldAlert, Search, Filter, Megaphone } from "lucide-react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

export default function UniversalSmartChat() {
  const { toast } = useToast();
  const location = useLocation(); 
  const [searchParams] = useSearchParams();

  const [messages, setMessages] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  
  const [activeChat, setActiveChat] = useState<string>("GLOBAL"); 
  const [newMessage, setNewMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Smart Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [smartFilter, setSmartFilter] = useState("All");

  // Enterprise Dynamic Activity States (Tracks unreads cleanly)
  const [unreadMap, setUnreadMap] = useState<Map<string, number>>(new Map());

  // Refs to store immediate reactive state parameters to bypass closure scope issues in the realtime channel
  const activeChatRef = useRef<string>("GLOBAL");
  const userIdRef = useRef<string | null>(null);

  // Dynamic ticker state to force re-render every 30 seconds for the 60-second glow latency accuracy
  const [, setTimeTicker] = useState<number>(Date.now());

  useEffect(() => {
    initChat();

    const interval = setInterval(() => {
      setTimeTicker(Date.now());
    }, 30000);

    const channel = supabase.channel('office-comms-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        // DIAGNOSTIC LOGS FOR REALTIME PACKET VALIDATION
        console.log("REALTIME CALLBACK FIRED");
        console.log("MESSAGE:", payload.new);

        const newMsg = payload.new;
        const currentActiveChat = activeChatRef.current;
        
        let currentSessionUserId = userIdRef.current;
        if (!currentSessionUserId) {
          const { data } = await supabase.auth.getUser();
          currentSessionUserId = data?.user?.id || null;
        }

        // CHAT WINDOW ROUTER VIEW APPENDER
        if (currentActiveChat === "GLOBAL" && !newMsg.receiver_id) {
          setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
          scrollToBottom();
        } else if (
          currentActiveChat !== "GLOBAL" && 
          currentActiveChat !== "BROADCAST" &&
          ((newMsg.sender_id === currentSessionUserId && newMsg.receiver_id === currentActiveChat) ||
           (newMsg.sender_id === currentActiveChat && newMsg.receiver_id === currentSessionUserId))
        ) {
          setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
          scrollToBottom();
          
          if (newMsg.sender_id === currentActiveChat) {
            supabase.from('messages').update({ is_read: true }).eq('id', newMsg.id).then();
          }
        }

        const interactingPeerId = newMsg.sender_id === currentSessionUserId ? newMsg.receiver_id : newMsg.sender_id;
        
        // RECONCILED CONSOLE TRACERS FOR ROOT IDENTITY MISMATCHES
        console.log("CURRENT USER:", currentSessionUserId);
        console.log("PEER ID:", interactingPeerId);

        if (interactingPeerId) {
          setUsers(prevUsers => {
            const updatedList = [...prevUsers];
            const targetIndex = updatedList.findIndex(u => u.id === interactingPeerId);
            
            if (targetIndex === -1) return prevUsers;

            const updatedUserObject = {
              ...updatedList[targetIndex],
              last_message_at: newMsg.created_at || new Date().toISOString(),
              last_message: newMsg.content || ""
            };

            updatedList.splice(targetIndex, 1);
            const nextReorderedList = [updatedUserObject, ...updatedList];

            console.log("NEW USER ORDER:", nextReorderedList.map(u => ({ name: u.name, id: u.id })));
            return nextReorderedList;
          });

          if (newMsg.sender_id !== currentSessionUserId && currentActiveChat !== interactingPeerId) {
            setUnreadMap(prevUnreads => {
              const nextUnreads = new Map(prevUnreads);
              const count = nextUnreads.get(interactingPeerId) || 0;
              nextUnreads.set(interactingPeerId, count + 1);
              return nextUnreads;
            });
          }
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        setMessages(prev => prev.filter(msg => msg.id !== payload.old.id));
      })
      .subscribe();

    return () => { 
      clearInterval(interval);
      supabase.removeChannel(channel); 
    };
  }, []);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  const initChat = async () => {
    setLoading(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) return;
      
      setUserId(user.id);
      userIdRef.current = user.id;

      let { data: myProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      
      if (!myProfile) {
        const inferredName = user.email ? user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ') : "Workspace User";
        const formattedInferredName = inferredName.replace(/\b\w/g, c => c.toUpperCase());
        
        const { data: provisionedProfile } = await supabase
          .from('profiles')
          .insert([{
            id: user.id,
            name: formattedInferredName,
            email: user.email || 'N/A',
            role: 'employee', 
            department: 'Operations Support',
            verification_status: 'verified',
            employment_status: 'active',
            created_at: new Date().toISOString()
          }])
          .select().single();
        myProfile = provisionedProfile;
      }

      if (myProfile) setCurrentUserProfile(myProfile);

      const { data: profiles, error: usersError } = await supabase
        .from('profiles')
        .select('id, name, role, department, team_lead_id')
        .neq('id', user.id);
      
      if (usersError) throw usersError;
      const verifiedProfiles = profiles || [];

      const { data: historicalActivity } = await supabase
        .from('messages')
        .select('sender_id, receiver_id, content, created_at, is_read')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: true });

      const transientUnreadsMap = new Map<string, number>();
      const mappedProfilesWithActivity = verifiedProfiles.map(u => {
        const conversations = historicalActivity?.filter(m => m.sender_id === u.id || m.receiver_id === u.id) || [];
        const lastMsg = conversations[conversations.length - 1];
        
        const unreadCount = conversations.filter(m => m.sender_id === u.id && !m.is_read).length;
        if (unreadCount > 0) transientUnreadsMap.set(u.id, unreadCount);

        return {
          ...u,
          last_message_at: lastMsg ? lastMsg.created_at : "1970-01-01T00:00:00.000Z",
          last_message: lastMsg ? lastMsg.content : ""
        };
      });

      mappedProfilesWithActivity.sort((a, b) => {
        const aTime = new Date(a.last_message_at || 0).getTime();
        const bTime = new Date(b.last_message_at || 0).getTime();
        return bTime - aTime;
      });

      setUnreadMap(transientUnreadsMap);
      setUsers(mappedProfilesWithActivity);

      const routedUserId = location.state?.selectedUserId || searchParams.get('userId');
      let targetChatId = "GLOBAL";
      
      if (routedUserId) {
        targetChatId = routedUserId;
      }

      activeChatRef.current = targetChatId;
      setActiveChat(targetChatId);
      await loadMessages(targetChatId, user.id);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Realtime Sync Interrupted", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (chatId: string, currentUserId: string | null = userId) => {
    if (chatId === "BROADCAST") {
      setMessages([]); 
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let query = supabase.from('messages').select('*').order('created_at', { ascending: true });

      if (chatId === "GLOBAL") {
        query = query.is('receiver_id', null);
      } else {
        query = query.or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${chatId}),and(sender_id.eq.${chatId},receiver_id.eq.${currentUserId})`);
        
        await supabase.from('messages').update({ is_read: true }).eq('receiver_id', currentUserId).eq('sender_id', chatId);
        setUnreadMap(prev => {
          const next = new Map(prev);
          next.set(chatId, 0);
          return next;
        });
      }

      const { data, error } = await query;
      if (error) throw error;
      if (data) setMessages(data);
      scrollToBottom();
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const switchChat = (id: string) => {
    activeChatRef.current = id;
    setActiveChat(id);
    loadMessages(id);
  };

  const scrollToBottom = () => setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch = u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            u.role?.toLowerCase().includes(searchQuery.toLowerCase());

      if (smartFilter === "All") return matchesSearch;

      if (smartFilter === "Team") {
        const myRole = currentUserProfile?.role?.toLowerCase() || "";
        const iteratedUserRole = u.role?.toLowerCase() || "";
        
        if (myRole === "admin") {
          return matchesSearch && iteratedUserRole === "team_lead";
        } else if (myRole === "team_lead" || myRole === "tl") {
          return matchesSearch && (u.team_lead_id === currentUserProfile.id || (u.department === currentUserProfile.department && iteratedUserRole === 'employee'));
        } else {
          return matchesSearch && u.department === currentUserProfile.department;
        }
      }
      return matchesSearch;
    });
  }, [users, searchQuery, smartFilter, currentUserProfile]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    // SECURE FIX: Pull the direct authenticated user data explicitly to defeat local state sync gaps
    const { data: authSessionData } = await supabase.auth.getUser();
    const verifiedAuthUserId = authSessionData?.user?.id;

    // DIAGNOSTIC PRINTS FOR TRANSACTION AUDITING
    console.log("CURRENT USER OBJECT:", authSessionData?.user);
    console.log("SENDER ID BEING ATTEMPTED:", verifiedAuthUserId);

    if (!verifiedAuthUserId) {
      toast({
        title: "Session Expired",
        description: "Your session token returned null. Please log out and re-authenticate.",
        variant: "destructive"
      });
      return;
    }
    
    const text = newMessage;
    setNewMessage("");

    try {
      if (activeChat === "BROADCAST") {
        const userClearanceRole = currentUserProfile?.role?.toLowerCase() || "";
        const holdsManagementClearance = (userClearanceRole === "admin" || userClearanceRole === "team_lead" || userClearanceRole === "tl");
        
        if (!holdsManagementClearance) {
          toast({
            title: "Transmission Denied",
            description: "Standard staff entries are not authorized to send multi-channel broadcasts.",
            variant: "destructive"
          });
          return;
        }

        const payloads = filteredUsers.map(u => ({
          sender_id: verifiedAuthUserId,
          content: `📢 [BROADCAST]: ${text}`,
          receiver_id: u.id
        }));

        if (payloads.length === 0) return;
        const { error } = await supabase.from('messages').insert(payloads).select();
        if (error) throw error;
        toast({ title: "Broadcast Dispatched", description: `Message delivered to ${filteredUsers.length} workspace members.` });
        return;
      }

      // TRANSACTION WRITER ENFORCEMENT: Stripped local caching references out of payload to comply with RLS constraints
      const { data, error } = await supabase.from('messages').insert([{ 
        sender_id: verifiedAuthUserId, 
        content: text,
        receiver_id: activeChat === "GLOBAL" ? null : activeChat 
      }]).select();

      if (error) {
        console.error("SUPABASE ERROR RESPONSE OBJECT:", error);
        toast({
          title: "Write Transaction Aborted",
          description: `${error.message} (Code: ${error.code}). Verify your user id mappings match auth.users schemas precisely.`,
          variant: "destructive"
        });
        return;
      }

      if (data && data.length > 0) {
        setMessages(prev => prev.some(m => m.id === data[0].id) ? prev : [...prev, data[0]]);
        
        if (activeChat !== "GLOBAL" && activeChat !== "BROADCAST") {
          setUsers(prevUsers => {
            const updated = [...prevUsers];
            const idx = updated.findIndex(u => u.id === activeChat);
            if (idx === -1) return prevUsers;

            const updatedUser = {
              ...updated[idx],
              last_message_at: new Date().toISOString(),
              last_message: text
            };

            updated.splice(idx, 1);
            return [updatedUser, ...updated];
          });
        }

        scrollToBottom();
      }
    } catch (err: any) {
      toast({ title: "Message Delivery Blocked", description: err.message, variant: "destructive" });
    }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      const { error } = await supabase.from('messages').delete().eq('id', messageId);
      if (error) throw error;
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
    } catch (err: any) {
      toast({ title: "Deletion Refused", description: err.message, variant: "destructive" });
    }
  };

  const startVideoMeeting = async () => {
    const roomName = `Workflow_Meeting_${crypto.randomUUID()}`;
    const meetingUrl = `https://meet.jit.si/${roomName}`;
    
    const { data: authSessionData } = await supabase.auth.getUser();
    const verifiedAuthUserId = authSessionData?.user?.id;
    if (!verifiedAuthUserId) return;

    try {
      await supabase.from('messages').insert([{ 
        sender_id: verifiedAuthUserId, 
        content: `🎥 JOIN VIDEO MEETING: ${meetingUrl}`,
        receiver_id: activeChat === "GLOBAL" ? null : activeChat 
      }]).select();
      window.open(meetingUrl, "_blank");
    } catch (err: any) {
      console.error(err);
    }
  };

  const formatTime = (iso: string) => {
    if (!iso || iso.startsWith("1970")) return "";
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  const getUserName = (id: string) => users.find(u => u.id === id)?.name || "User";
  
  const getActiveChatName = () => {
    if (activeChat === "GLOBAL") return "# general";
    if (activeChat === "BROADCAST") return `📢 Broadcasting to ${filteredUsers.length} Users`;
    return users.find(u => u.id === activeChat)?.name || "Chat";
  };

  return (
    <DashboardLayout role={currentUserProfile?.role?.toLowerCase() || 'employee'}>
      <div className="max-w-6xl mx-auto h-[calc(100vh-120px)] flex bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        
        {/* LEFT SIDEBAR CHANNELS & CHAT activity ROSTER */}
        <div className="w-80 bg-slate-50 border-r border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-200 bg-slate-100/60">
            <h2 className="font-bold text-slate-800 tracking-tight text-base">Office Comms</h2>
            
            <div className="mt-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" placeholder="Search team members..." 
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-sm"
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select 
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-sm font-medium appearance-none"
                  value={smartFilter} onChange={(e) => setSmartFilter(e.target.value)}
                >
                  <option value="All">All Workspace Users</option>
                  <option value="Team">{currentUserProfile?.role?.toLowerCase() === "admin" ? "All Team Leads" : "My Specific Team"}</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-4 custom-scrollbar">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-2">Channels</p>
              <button 
                onClick={() => switchChat("GLOBAL")}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold transition-colors ${activeChat === "GLOBAL" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <Hash className="w-4 h-4" /> general
              </button>
              {smartFilter === "Team" && (
                <button 
                  onClick={() => switchChat("BROADCAST")}
                  className={`w-full flex items-center gap-2 px-3 py-2 mt-1 rounded-md text-sm font-bold bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 transition-colors`}
                >
                  <Megaphone className="w-4 h-4" /> Broadcast Channel
                </button>
              )}
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-2">Direct Messaging Nodes</p>
              <div className="space-y-0.5">
                {filteredUsers.map(u => {
                  const roleString = u.role?.toLowerCase() || "";
                  const unreadCount = unreadMap.get(u.id) || 0;
                  const messagePreviewText = u.last_message || "No past dialogue threads initiated.";

                  const cleanMessagePreview = messagePreviewText.includes("JOIN VIDEO MEETING") 
                    ? "🎥 Video Meeting Invitation" 
                    : messagePreviewText;

                  const isRecentlyActive = u.last_message_at && (Date.now() - new Date(u.last_message_at).getTime()) < 60000;

                  return (
                    <button 
                      key={u.id} onClick={() => switchChat(u.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-start gap-3 relative ${
                        activeChat === u.id 
                          ? "bg-slate-100/80 border border-slate-200" 
                          : isRecentlyActive 
                            ? "bg-blue-50/70 border border-blue-200 shadow-sm animate-fade-in" 
                            : "hover:bg-slate-100/50"
                      }`}
                    >
                      <UserCircle className={`w-5 h-5 shrink-0 mt-0.5 ${activeChat === u.id ? "text-blue-600" : "text-slate-400"}`} />
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs truncate block ${unreadCount > 0 ? "font-black text-slate-900" : "font-semibold text-slate-700"}`}>{u.name}</span>
                          <span className="text-[10px] text-slate-400 font-medium shrink-0">
                            {formatTime(u.last_message_at)}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between mt-0.5 gap-2">
                          <p className={`text-[11px] truncate mt-0.5 ${unreadCount > 0 ? "font-bold text-slate-900" : "text-slate-400"}`}>{cleanMessagePreview}</p>
                          <span className="text-[9px] uppercase font-mono tracking-tight bg-slate-200/60 text-slate-500 px-1 rounded shrink-0">{roleString === 'admin' ? 'ADM' : roleString === 'team_lead' || roleString === 'tl' ? 'TL' : 'EMP'}</span>
                        </div>
                      </div>

                      {unreadCount > 0 && (
                        <span className="absolute right-3 bottom-2.5 min-w-4 h-4 px-1 rounded-full bg-rose-600 border border-white flex items-center justify-center text-[10px] text-white font-black animate-pulse">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT AREA: THE CHAT WINDOW */}
        <div className="flex-1 flex flex-col bg-white">
          <div className="h-16 border-b border-slate-200 flex items-center justify-between px-6 bg-white">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-800 text-base">{getActiveChatName()}</h2>
              {activeChat === "GLOBAL" && <span className="text-xs bg-slate-50 text-slate-500 px-2 py-0.5 rounded-full border">Unified Loop</span>}
            </div>
            <Button onClick={startVideoMeeting} size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50 h-9 font-bold text-xs">
              <Video className="w-4 h-4 mr-1.5" /> Start Sync Session
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-slate-50/40">
            {activeChat === "BROADCAST" ? (
              <div className="flex flex-col items-center justify-center h-full text-indigo-500 animate-pulse text-center p-6">
                <Megaphone className="w-12 h-12 mb-2 opacity-50" />
                <h3 className="font-bold text-sm uppercase text-indigo-900">Broadcast Channel Vector Engaged</h3>
                <p className="text-xs text-slate-400 max-w-xs mt-1">Dialogue lines entered inside this thread will be dispatched simultaneously as individual Direct Messages to all listed peers.</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-300">
                <ShieldAlert className="w-10 h-10 mb-1 opacity-40" />
                <p className="text-xs font-medium">Dialogue thread initialized successfully.</p>
              </div>
            ) : (
              messages.map((msg: any) => {
                const isMe = msg.sender_id === userId;
                const isVideoLink = msg.content?.includes("JOIN");
                return (
                  <div key={msg.id} className={`flex w-full group ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`flex flex-col max-w-[75%] ${isMe ? "items-end" : "items-start"}`}>
                      {!isMe && <span className="text-[10px] text-slate-400 font-bold mb-0.5 ml-1">{getUserName(msg.sender_id)}</span>}
                      <div className="flex items-center gap-1.5">
                        {isMe && (
                          <button onClick={() => deleteMessage(msg.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-300 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                        {isVideoLink ? (
                          <div className="bg-blue-600 text-white p-4 rounded-xl border border-blue-700 text-center shadow-md">
                            <Video className="w-6 h-6 mx-auto mb-1.5 opacity-90" />
                            <p className="font-bold text-xs mb-2">Video Sync Invitation</p>
                            <a href={msg.content.split(" ").pop()} target="_blank" rel="noreferrer" className="bg-white text-blue-600 text-[11px] font-black px-3 py-1.5 rounded-full hover:bg-blue-50">Connect Link</a>
                          </div>
                        ) : (
                          <div className={`px-3.5 py-2 rounded-2xl border ${isMe ? "bg-blue-600 text-white border-blue-700 rounded-br-sm" : "bg-white text-slate-800 border-slate-100 rounded-bl-sm shadow-sm"}`}>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                          </div>
                        )}
                      </div>
                      <span className="text-[9px] text-slate-400 font-medium mt-0.5 mx-1">{formatTime(msg.created_at)}</span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 bg-white border-t border-slate-100">
            <form onSubmit={sendMessage} className="flex gap-2">
              <Input 
                className="flex-1 bg-slate-50 border-slate-200 text-sm h-10" 
                placeholder={activeChat === "BROADCAST" ? `Type broadcast dispatch message...` : `Message thread...`}
                value={newMessage} onChange={(e) => setNewMessage(e.target.value)} 
              />
              <Button type="submit" disabled={!newMessage.trim()} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-10 px-5 font-bold">Send</Button>
            </form>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}