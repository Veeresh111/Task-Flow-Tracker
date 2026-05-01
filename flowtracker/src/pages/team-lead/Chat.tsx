import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  LayoutDashboard,
  Users,
  CheckCircle2,
  FolderKanban,
  ListTodo,
  AlertTriangle,
  BarChart3,
  Bell,
  MessageSquare,
  Settings,
  Send,
  Search,
} from "lucide-react";
import { PresenceStatus, WorkMode } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { listConversation, sendMessage, type ChatMessageRow } from "@/lib/db/chat";
import { supabase } from "@/lib/supabase";

const navItems = [
  { title: "Dashboard", href: "/team_lead", icon: LayoutDashboard },
  { title: "My Team", href: "/team_lead/my-team", icon: Users },
  { title: "Approvals", href: "/team_lead/approvals", icon: CheckCircle2 },
  { title: "Projects", href: "/team_lead/projects", icon: FolderKanban },
  { title: "Tasks", href: "/team_lead/tasks", icon: ListTodo },
  { title: "Complaints", href: "/team_lead/complaints", icon: AlertTriangle },
  { title: "Analytics", href: "/team_lead/analytics", icon: BarChart3 },
  { title: "Notifications", href: "/team_lead/notifications", icon: Bell },
  { title: "Chat", href: "/team_lead/chat", icon: MessageSquare },
  { title: "Settings", href: "/team_lead/settings", icon: Settings },
];

export default function Chat() {
  const { profile } = useAuth();
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("offline");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);
  const [contacts, setContacts] = useState<{ id: string; name: string; email: string; status: "online" | "offline" }[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

  const fetchContacts = async () => {
    if (!profile) return;
    setLoadingContacts(true);

    const { data } = await supabase
      .from("profiles")
      .select("id,name,email")
      .eq("role", "employee")
      .eq("team_lead_id", profile.id)
      .eq("approval_status", "approved")
      .order("created_at", { ascending: false });

    const list = (data ?? []).map((c) => ({ id: c.id, name: c.name || c.email, email: c.email, status: "offline" as const }));
    setContacts(list);
    setSelectedContactId((prev) => prev || list[0]?.id || "");
    setLoadingContacts(false);
  };

  const fetchMessages = async () => {
    if (!profile || !selectedContactId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    const res = await listConversation(profile.id, selectedContactId);
    setMessages(res.data ?? []);
    setLoadingMessages(false);
  };

  useEffect(() => {
    fetchContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  useEffect(() => {
    fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, selectedContactId]);

  const handleSend = async () => {
    if (!profile || !selectedContactId) return;
    if (!message.trim()) return;
    const res = await sendMessage({ senderId: profile.id, recipientId: selectedContactId, content: message.trim() });
    if (res.error) return;
    setMessage("");
    fetchMessages();
  };

  const filteredContacts = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return contacts.filter((c) => c.name.toLowerCase().includes(q));
  }, [contacts, searchQuery]);

  const selectedContact = contacts.find((c) => c.id === selectedContactId) || null;

  return (
    <DashboardLayout
      role="team_lead"
      navItems={navItems}
      userName={profile?.name || "Team Lead"}
      userEmail={profile?.email || ""}
      presenceStatus={presenceStatus}
      workMode={workMode}
      onPresenceChange={handlePresenceChange}
    >
      <div className="page-header">
        <h1 className="page-title">Chat</h1>
        <p className="page-description">Communicate with Admin and team members</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-220px)]">
        {/* Contacts List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Contacts</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-380px)]">
              {loadingContacts ? (
                <div className="p-4 text-sm text-muted-foreground">Loading contacts...</div>
              ) : filteredContacts.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No employees in your team yet.</div>
              ) : (
                filteredContacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => setSelectedContactId(contact.id)}
                    className={`w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors border-b ${
                      selectedContactId === contact.id ? "bg-muted" : ""
                    }`}
                  >
                    <div className="relative">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                          {contact.name.split(" ").map((n) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${
                        contact.status === "online" ? "bg-status-online" : "bg-status-offline"
                      }`} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-sm">{contact.name}</p>
                      <p className="text-xs text-muted-foreground">{contact.email}</p>
                    </div>
                  </button>
                ))
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Chat Area */}
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {(selectedContact?.name || "User").split(" ").map((n) => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-lg">{selectedContact?.name || "Select a contact"}</CardTitle>
                {selectedContact ? <StatusBadge status={selectedContact.status} showDot /> : null}
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 p-0 flex flex-col">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {loadingMessages ? (
                  <div className="text-sm text-muted-foreground">Loading messages...</div>
                ) : !selectedContactId ? (
                  <div className="text-sm text-muted-foreground">Select a contact to start chatting.</div>
                ) : messages.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No messages yet.</div>
                ) : (
                  messages.map((msg) => {
                    const isSent = msg.sender_id === profile?.id;
                    return (
                      <div key={msg.id} className={`flex ${isSent ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                            isSent ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"
                          }`}
                        >
                          <p className="text-sm">{msg.content}</p>
                          <p className={`text-xs mt-1 ${isSent ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                            {new Date(msg.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  className="flex-1"
                  disabled={!selectedContactId}
                />
                <Button onClick={handleSend} className="gradient-primary text-white" disabled={!selectedContactId}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
