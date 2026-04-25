import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  MoreHorizontal,
  ArrowUpCircle,
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

const mockComplaints = [
  { id: "1", title: "Network Connectivity Issue", description: "VPN keeps disconnecting", raisedBy: "Alice Brown", status: "pending" as const, createdAt: "2024-02-15 10:00 AM" },
  { id: "2", title: "Software License Request", description: "Need Figma license for design work", raisedBy: "Bob Martin", status: "resolved" as const, createdAt: "2024-02-14 02:30 PM" },
  { id: "3", title: "Hardware Issue", description: "Laptop keyboard not working properly", raisedBy: "Carol White", status: "pending" as const, createdAt: "2024-02-14 11:15 AM" },
];

export default function Complaints() {
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("offline");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

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
        <h1 className="page-title">Complaints</h1>
        <p className="page-description">View and resolve team member complaints</p>
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
            <div className="text-2xl font-bold text-status-pending">
              {mockComplaints.filter((c) => c.status === "pending").length}
            </div>
            <p className="text-sm text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-status-completed">
              {mockComplaints.filter((c) => c.status === "resolved").length}
            </div>
            <p className="text-sm text-muted-foreground">Resolved</p>
          </CardContent>
        </Card>
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
              {mockComplaints.map((complaint) => (
                <TableRow key={complaint.id} className="data-table-row">
                  <TableCell>
                    <div>
                      <p className="font-medium">{complaint.title}</p>
                      <p className="text-sm text-muted-foreground">{complaint.description}</p>
                    </div>
                  </TableCell>
                  <TableCell>{complaint.raisedBy}</TableCell>
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
                          <ArrowUpCircle className="w-4 h-4 mr-2" />
                          Escalate to Admin
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
