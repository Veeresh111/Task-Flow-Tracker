import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
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
  Search,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { PresenceStatus, WorkMode } from "@/types";
import { useAuth } from "@/lib/auth-context";
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

export default function Presence() {
  const { profile } = useAuth();
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("online");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<any[]>([]);

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

  const fetchAll = async () => {
    setLoading(true);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,name,email,role")
      .neq("role", "admin")
      .order("created_at", { ascending: false });

    const { data: sessions } = await supabase
      .from("presence_sessions")
      .select("user_id,status,work_mode,start_time,end_time")
      .order("start_time", { ascending: false });

    const latestByUser: Record<string, any> = {};
    for (const s of sessions ?? []) {
      if (!latestByUser[s.user_id]) latestByUser[s.user_id] = s;
    }

    setPeople(
      (profiles ?? []).map((p) => {
        const latest = latestByUser[p.id];
        const online = latest && latest.status === "online" && !latest.end_time;
        const mode = latest?.work_mode ?? null;
        const since = latest?.start_time ? new Date(latest.start_time).toLocaleTimeString() : "-";
        return {
          id: p.id,
          name: p.name || p.email,
          role: p.role === "team_lead" ? "Team Lead" : "Employee",
          status: online ? "online" : "offline",
          workMode: mode,
          onlineSince: online ? since : "-",
          todayHours: "-",
        };
      })
    );

    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return people.filter((person) => {
      const matchesSearch = person.name.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || person.status === statusFilter;
      const matchesMode = modeFilter === "all" || person.workMode === modeFilter;
      return matchesSearch && matchesStatus && matchesMode;
    });
  }, [people, searchQuery, statusFilter, modeFilter]);

  const onlineCount = people.filter((p) => p.status === "online").length;
  const wfoCount = people.filter((p) => p.workMode === "wfo").length;
  const wfhCount = people.filter((p) => p.workMode === "wfh").length;

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
        <h1 className="page-title">Presence Monitoring</h1>
        <p className="page-description">Real-time view of workforce presence and work modes</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-status-online">{onlineCount}</div>
                <p className="text-sm text-muted-foreground">Online Now</p>
              </div>
              <div className="w-3 h-3 rounded-full bg-status-online animate-pulse" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-status-wfo">{wfoCount}</div>
            <p className="text-sm text-muted-foreground">Work From Office</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-status-wfh">{wfhCount}</div>
            <p className="text-sm text-muted-foreground">Work From Home</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-muted-foreground">
              {people.length - onlineCount}
            </div>
            <p className="text-sm text-muted-foreground">Currently Offline</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>

        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Work Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="wfo">WFO</SelectItem>
            <SelectItem value="wfh">WFH</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Presence Grid */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading presence...</div>
      ) : filteredData.length === 0 ? (
        <div className="text-sm text-muted-foreground">No users yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredData.map((person) => (
            <Card key={person.id}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {person.name.split(" ").map((n) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-card ${
                      person.status === "online" ? "bg-status-online" : "bg-status-offline"
                    }`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{person.name}</h3>
                    <p className="text-sm text-muted-foreground">{person.role}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <StatusBadge status={person.status} />
                      {person.workMode && <StatusBadge status={person.workMode} />}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
                  <div>
                    <p className="text-xs text-muted-foreground">Online Since</p>
                    <p className="font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {person.onlineSince}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Today's Hours</p>
                    <p className="font-medium">{person.todayHours}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
