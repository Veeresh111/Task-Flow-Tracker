import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Clock,
  CheckCheck,
  AlertTriangle,
} from "lucide-react";
import { PresenceStatus, WorkMode } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { listTeamLeads } from "@/lib/db/profiles";
import { createNotification } from "@/lib/db/notifications";
import { supabase } from "@/lib/supabase";

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

export default function Notifications() {
  const { profile } = useAuth();
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("online");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState("");

  const [teamLeads, setTeamLeads] = useState<{ id: string; name: string; email: string }[]>([]);
  const [sent, setSent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

  const fetchAll = async () => {
    if (!profile) return;
    setLoading(true);

    const tlRes = await listTeamLeads();
    setTeamLeads((tlRes.data ?? []).map((tl) => ({ id: tl.id, name: tl.name || tl.email, email: tl.email })));

    const { data: sentRows } = await supabase
      .from("notifications")
      .select("*, recipient:profiles!notifications_recipient_id_fkey(id,name,email)")
      .eq("sender_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(50);

    setSent(sentRows ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const selectedRecipientIds = useMemo(() => {
    if (recipient === "all") return teamLeads.map((t) => t.id);
    if (!recipient) return [];
    return [recipient];
  }, [recipient, teamLeads]);

  const handleSend = async () => {
    if (!profile) return;
    if (!title.trim() || !message.trim()) return;
    if (selectedRecipientIds.length === 0) return;

    for (const rid of selectedRecipientIds) {
      // eslint-disable-next-line no-await-in-loop
      const res = await createNotification({
        title: title.trim(),
        message: message.trim(),
        senderId: profile.id,
        recipientId: rid,
      });
      if (res.error) return;
    }

    setTitle("");
    setMessage("");
    setRecipient("");
    fetchAll();
  };

  return (
    <DashboardLayout
      role="admin"
      navItems={navItems}
      userName={profile?.name || "Admin"}
      userEmail={profile?.email || ""}
      presenceStatus={presenceStatus}
      workMode={workMode}
      onPresenceChange={handlePresenceChange}
    >
      <div className="page-header">
        <h1 className="page-title">Notifications</h1>
        <p className="page-description">Send notifications to team leads and view delivery status</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Send Notification */}
        <Card>
          <CardHeader>
            <CardTitle>Send Notification</CardTitle>
            <CardDescription>Compose and send a notification to team leads</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recipient">Recipient</Label>
              <Select value={recipient} onValueChange={setRecipient}>
                <SelectTrigger>
                  <SelectValue placeholder="Select recipient" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Team Leads</SelectItem>
                  {teamLeads.map((tl) => (
                    <SelectItem key={tl.id} value={tl.id}>
                      {tl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Notification title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Write your notification message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
              />
            </div>

            <Button onClick={handleSend} className="w-full gradient-primary text-white">
              <Send className="w-4 h-4 mr-2" />
              Send Notification
            </Button>
          </CardContent>
        </Card>

        {/* Sent Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Sent Notifications</CardTitle>
            <CardDescription>Recent notifications and their status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading sent notifications...</div>
              ) : sent.length === 0 ? (
                <div className="text-sm text-muted-foreground">No notifications sent yet.</div>
              ) : (
                sent.map((notification) => (
                  <div key={notification.id} className="p-4 rounded-lg border">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium">{notification.title}</p>
                        <p className="text-sm text-muted-foreground">{notification.message}</p>
                      </div>
                      {notification.read ? (
                        <CheckCheck className="w-4 h-4 text-status-completed" />
                      ) : (
                        <CheckCheck className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>To: {notification.recipient?.name || notification.recipient_id}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(notification.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
