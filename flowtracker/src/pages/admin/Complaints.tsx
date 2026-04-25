import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  MoreHorizontal,
  CheckCircle2,
  XCircle,
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

const mockComplaints = [
  { id: "1", title: "VPN Connection Issues", description: "Unable to connect to VPN from home", raisedBy: "John Doe", role: "Employee", status: "pending" as const, createdAt: "2024-02-15 10:30 AM" },
  { id: "2", title: "Access Permission Request", description: "Need access to production database", raisedBy: "Jane Smith", role: "Employee", status: "pending" as const, createdAt: "2024-02-15 09:15 AM" },
  { id: "3", title: "Hardware Upgrade Needed", description: "Current laptop is too slow for development", raisedBy: "Mike Ross", role: "Employee", status: "resolved" as const, createdAt: "2024-02-14 03:45 PM" },
  { id: "4", title: "Team Resource Shortage", description: "Need more team members for project deadline", raisedBy: "Sarah Johnson", role: "Team Lead", status: "pending" as const, createdAt: "2024-02-14 11:00 AM" },
  { id: "5", title: "Software License Expired", description: "Adobe Creative Suite license has expired", raisedBy: "Carol White", role: "Employee", status: "closed" as const, createdAt: "2024-02-13 02:30 PM" },
];

export default function Complaints() {
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("online");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

  const filteredComplaints = mockComplaints.filter((complaint) => {
    const matchesSearch =
      complaint.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      complaint.raisedBy.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || complaint.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = mockComplaints.filter((c) => c.status === "pending").length;
  const resolvedCount = mockComplaints.filter((c) => c.status === "resolved").length;

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
        <h1 className="page-title">Complaints</h1>
        <p className="page-description">Manage and resolve issues raised by employees and team leads</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{mockComplaints.length}</div>
            <p className="text-sm text-muted-foreground">Total Complaints</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-status-pending">{pendingCount}</div>
            <p className="text-sm text-muted-foreground">Pending Resolution</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-status-completed">{resolvedCount}</div>
            <p className="text-sm text-muted-foreground">Resolved</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search complaints..."
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
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Complaint</TableHead>
                <TableHead>Raised By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredComplaints.map((complaint) => (
                <TableRow key={complaint.id} className="data-table-row">
                  <TableCell>
                    <div>
                      <p className="font-medium">{complaint.title}</p>
                      <p className="text-sm text-muted-foreground">{complaint.description}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{complaint.raisedBy}</p>
                      <p className="text-sm text-muted-foreground">{complaint.role}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={complaint.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{complaint.createdAt}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Mark as Resolved
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <XCircle className="w-4 h-4 mr-2" />
                          Close Complaint
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
