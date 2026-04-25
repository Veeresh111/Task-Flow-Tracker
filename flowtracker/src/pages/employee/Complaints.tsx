import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { LayoutDashboard, ListTodo, FolderKanban, FileText, AlertTriangle, Bell, MessageSquare, Settings, Plus } from "lucide-react";
import { PresenceStatus, WorkMode } from "@/types";

const navItems = [
  { title: "Dashboard", href: "/employee", icon: LayoutDashboard },
  { title: "My Tasks", href: "/employee/tasks", icon: ListTodo },
  { title: "Projects", href: "/employee/projects", icon: FolderKanban },
  { title: "Work Logs", href: "/employee/work-logs", icon: FileText },
  { title: "Complaints", href: "/employee/complaints", icon: AlertTriangle },
  { title: "Notifications", href: "/employee/notifications", icon: Bell },
  { title: "Chat", href: "/employee/chat", icon: MessageSquare },
  { title: "Settings", href: "/employee/settings", icon: Settings },
];

const mockComplaints = [
  { id: "1", title: "VPN Issues", description: "Unable to connect to company VPN", status: "pending" as const, date: "2024-02-15" },
  { id: "2", title: "Software Request", description: "Need access to design tools", status: "resolved" as const, date: "2024-02-10" },
];

export default function Complaints() {
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("offline");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => { setPresenceStatus(status); setWorkMode(mode); };

  return (
    <DashboardLayout role="employee" navItems={navItems} userName="Alice Brown" userEmail="alice.b@company.com" presenceStatus={presenceStatus} workMode={workMode} onPresenceChange={handlePresenceChange}>
      <div className="flex justify-between items-start mb-6">
        <div className="page-header mb-0"><h1 className="page-title">Complaints</h1><p className="page-description">Raise and track issues</p></div>
        <Dialog>
          <DialogTrigger asChild><Button className="gradient-primary text-white"><Plus className="w-4 h-4 mr-2" />Raise Complaint</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Raise Complaint</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Title</Label><Input placeholder="Brief title" /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea placeholder="Describe your issue..." rows={4} /></div>
            </div>
            <DialogFooter><Button className="gradient-primary text-white">Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>My Complaints</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockComplaints.map((c) => (
              <div key={c.id} className="p-4 rounded-lg border flex justify-between items-start">
                <div><p className="font-medium">{c.title}</p><p className="text-sm text-muted-foreground">{c.description}</p><p className="text-xs text-muted-foreground mt-1">{c.date}</p></div>
                <StatusBadge status={c.status} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
