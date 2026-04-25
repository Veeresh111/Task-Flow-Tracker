import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Search,
} from "lucide-react";
import { PresenceStatus, WorkMode } from "@/types";

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

const mockTeamMembers = [
  { id: "1", name: "Alice Brown", email: "alice.b@company.com", status: "online" as const, workMode: "wfo" as const, activeTasks: 4, hoursToday: "5h 30m" },
  { id: "2", name: "Bob Martin", email: "bob.m@company.com", status: "online" as const, workMode: "wfh" as const, activeTasks: 3, hoursToday: "6h 15m" },
  { id: "3", name: "Carol White", email: "carol.w@company.com", status: "offline" as const, activeTasks: 5, hoursToday: "4h 00m" },
  { id: "4", name: "David Lee", email: "david.l@company.com", status: "online" as const, workMode: "wfo" as const, activeTasks: 2, hoursToday: "5h 45m" },
  { id: "5", name: "Eva Garcia", email: "eva.g@company.com", status: "offline" as const, activeTasks: 3, hoursToday: "3h 20m" },
];

export default function MyTeam() {
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("offline");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

  const filteredMembers = mockTeamMembers.filter(
    (member) =>
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onlineCount = mockTeamMembers.filter((m) => m.status === "online").length;

  return (
    <DashboardLayout
      role="team_lead"
      navItems={navItems}
      userName="John Smith"
      userEmail="john.smith@company.com"
      presenceStatus={presenceStatus}
      workMode={workMode}
      onPresenceChange={handlePresenceChange}
    >
      <div className="page-header">
        <h1 className="page-title">My Team</h1>
        <p className="page-description">View and manage your team members</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{mockTeamMembers.length}</div>
            <p className="text-sm text-muted-foreground">Team Members</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-status-online">{onlineCount}</div>
            <p className="text-sm text-muted-foreground">Online Now</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {mockTeamMembers.reduce((acc, m) => acc + m.activeTasks, 0)}
            </div>
            <p className="text-sm text-muted-foreground">Active Tasks</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search team members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team Member</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Active Tasks</TableHead>
                <TableHead>Hours Today</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.map((member) => (
                <TableRow key={member.id} className="data-table-row">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                          {member.name.split(" ").map((n) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{member.name}</p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={member.status} showDot />
                      {member.workMode && <StatusBadge status={member.workMode} />}
                    </div>
                  </TableCell>
                  <TableCell>{member.activeTasks}</TableCell>
                  <TableCell>{member.hoursToday}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
