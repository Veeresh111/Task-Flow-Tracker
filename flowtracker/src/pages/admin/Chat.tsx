import { useState } from "react";
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
  UserCheck,
  FolderKanban,
  Activity,
  BarChart3,
  Bell,
  MessageSquare,
  Settings,
  Send,
  Search,
  AlertTriangle,
} from "lucide-react";
import { PresenceStatus, WorkMode } from "@/types";

const navItems = [
  { title: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { title: "Team Leads", href: "/admin/team-leads", icon: UserCheck },
  { title: "Employees", href: "/admin/employees", icon: Users },
  { title: "Projects", href: "/admin/projects", icon: FolderKanban },
  { title: "Presence", href: "/admin/presence", icon: Activity },
  { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  { title: "Complaints", href: "/admin/complaints", icon: AlertTriangle },
  { title: "Notifications", href: "/admin/notifications", icon: Bell },
  { title: "Chat", href: "/admin/chat", icon: MessageSquare },
  { title: "Settings", href: "/admin/settings", icon: Settings },
];

const mockContacts = [
  { id: "1", name: "John Smith", status: "online" as const, lastMessage: "Sure, I'll update the report", time: "2m ago" },
  { id: "2", name: "Sarah Johnson", status: "online" as const, lastMessage: "The project is on track", time: "15m ago" },
  { id: "3", name: "Michael Chen", status: "offline" as const, lastMessage: "I'll check and get back to you", time: "1h ago" },
  { id: "4", name: "Emily Davis", status: "online" as const, lastMessage: "Meeting scheduled for tomorrow", time: "3h ago" },
];

const mockMessages = [
  { id: "1", senderId: "1", content: "Hi, I wanted to discuss the project timeline", time: "10:30 AM", isSent: false },
  { id: "2", senderId: "admin", content: "Sure, what's your concern?", time: "10:32 AM", isSent: true },
  { id: "3", senderId: "1", content: "We might need an extension for the API integration task", time: "10:35 AM", isSent: false },
  { id: "4", senderId: "admin", content: "How much time do you need?", time: "10:36 AM", isSent: true },
  { id: "5", senderId: "1", content: "2-3 more days should be sufficient", time: "10:38 AM", isSent: false },
  { id: "6", senderId: "admin", content: "Alright, I'll update the timeline. Keep me posted on the progress.", time: "10:40 AM", isSent: true },
  { id: "7", senderId: "1", content: "Sure, I'll update the report", time: "10:42 AM", isSent: false },
];

export default function Chat() {
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("online");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);
  const [selectedContact, setSelectedContact] = useState(mockContacts[0]);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

  const handleSend = () => {
    if (message.trim()) {
      // Handle send message
      setMessage("");
    }
  };

  const filteredContacts = mockContacts.filter((contact) =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout
      role="admin"
      navItems={navItems}
      userName="Admin User"
      userEmail="admin@company.com"
      presenceStatus={presenceStatus}
      workMode={workMode}
      onPresenceChange={handlePresenceChange}
    >
      <div className="page-header">
        <h1 className="page-title">Chat</h1>
        <p className="page-description">Real-time communication with team leads</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-220px)]">
        {/* Contacts List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Team Leads</CardTitle>
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
              {filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => setSelectedContact(contact)}
                  className={`w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors border-b ${
                    selectedContact.id === contact.id ? "bg-muted" : ""
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
                    <p className="text-xs text-muted-foreground truncate">{contact.lastMessage}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{contact.time}</span>
                </button>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Chat Area */}
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {selectedContact.name.split(" ").map((n) => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-lg">{selectedContact.name}</CardTitle>
                <StatusBadge status={selectedContact.status} showDot />
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 p-0 flex flex-col">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {mockMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.isSent ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                        msg.isSent
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted rounded-bl-md"
                      }`}
                    >
                      <p className="text-sm">{msg.content}</p>
                      <p className={`text-xs mt-1 ${msg.isSent ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {msg.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSend()}
                  className="flex-1"
                />
                <Button onClick={handleSend} className="gradient-primary text-white">
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
