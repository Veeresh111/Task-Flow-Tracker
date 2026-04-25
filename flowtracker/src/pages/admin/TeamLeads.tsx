import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
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

const mockTeamLeads = [
  { id: "1", name: "John Smith", email: "john.smith@company.com", status: "online" as const, workMode: "wfo" as const, teamSize: 8, tasksCompleted: 45, hoursWorked: 168 },
  { id: "2", name: "Sarah Johnson", email: "sarah.j@company.com", status: "online" as const, workMode: "wfh" as const, teamSize: 12, tasksCompleted: 67, hoursWorked: 172 },
  { id: "3", name: "Michael Chen", email: "m.chen@company.com", status: "offline" as const, teamSize: 6, tasksCompleted: 34, hoursWorked: 156 },
  { id: "4", name: "Emily Davis", email: "emily.d@company.com", status: "online" as const, workMode: "wfo" as const, teamSize: 10, tasksCompleted: 52, hoursWorked: 165 },
  { id: "5", name: "Robert Wilson", email: "r.wilson@company.com", status: "offline" as const, teamSize: 5, tasksCompleted: 28, hoursWorked: 148 },
];

export default function TeamLeads() {
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("online");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

  const filteredTeamLeads = mockTeamLeads.filter(
    (lead) =>
      lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchQuery.toLowerCase())
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
        <h1 className="page-title">Team Leads</h1>
        <p className="page-description">Manage team lead accounts and monitor their performance</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{mockTeamLeads.length}</div>
            <p className="text-sm text-muted-foreground">Total Team Leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-status-online">
              {mockTeamLeads.filter((t) => t.status === "online").length}
            </div>
            <p className="text-sm text-muted-foreground">Online Now</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {mockTeamLeads.reduce((acc, t) => acc + t.teamSize, 0)}
            </div>
            <p className="text-sm text-muted-foreground">Total Employees</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {mockTeamLeads.reduce((acc, t) => acc + t.tasksCompleted, 0)}
            </div>
            <p className="text-sm text-muted-foreground">Tasks Completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search team leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-white">
              <Plus className="w-4 h-4 mr-2" />
              Add Team Lead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Team Lead</DialogTitle>
              <DialogDescription>
                Create a new team lead account. They will receive an email to set their password.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" placeholder="Enter full name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="email@company.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input id="department" placeholder="Enter department" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button className="gradient-primary text-white" onClick={() => setIsAddDialogOpen(false)}>
                Create Team Lead
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team Lead</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Team Size</TableHead>
                <TableHead>Tasks Completed</TableHead>
                <TableHead>Hours Worked</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTeamLeads.map((lead) => (
                <TableRow key={lead.id} className="data-table-row">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                          {lead.name.split(" ").map((n) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{lead.name}</p>
                        <p className="text-sm text-muted-foreground">{lead.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={lead.status} showDot />
                      {lead.workMode && <StatusBadge status={lead.workMode} />}
                    </div>
                  </TableCell>
                  <TableCell>{lead.teamSize} members</TableCell>
                  <TableCell>{lead.tasksCompleted}</TableCell>
                  <TableCell>{lead.hoursWorked}h</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
