import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { LayoutDashboard, ListTodo, FolderKanban, FileText, AlertTriangle, Bell, MessageSquare, Settings, Plus, Clock } from "lucide-react";
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

const mockWorkLogs = [
  { id: "1", task: "API Documentation", summary: "Completed endpoints section", hours: 3, date: "2024-02-15" },
  { id: "2", task: "API Documentation", summary: "Added authentication docs", hours: 2, date: "2024-02-14" },
  { id: "3", task: "Fix Login Bug", summary: "Investigated and fixed token issue", hours: 4, date: "2024-02-14" },
];

export default function WorkLogs() {
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("offline");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => { setPresenceStatus(status); setWorkMode(mode); };

  return (
    <DashboardLayout role="employee" navItems={navItems} userName="Alice Brown" userEmail="alice.b@company.com" presenceStatus={presenceStatus} workMode={workMode} onPresenceChange={handlePresenceChange}>
      <div className="flex justify-between items-start mb-6">
        <div className="page-header mb-0"><h1 className="page-title">Work Logs</h1><p className="page-description">Track your daily work activities</p></div>
        <Dialog>
          <DialogTrigger asChild><Button className="gradient-primary text-white"><Plus className="w-4 h-4 mr-2" />Add Work Log</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Work Log</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Task</Label><Input placeholder="Select task" /></div>
              <div className="space-y-2"><Label>Summary</Label><Textarea placeholder="What did you work on?" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Hours</Label><Input type="number" placeholder="0" /></div>
                <div className="space-y-2"><Label>Date</Label><Input type="date" /></div>
              </div>
            </div>
            <DialogFooter><Button className="gradient-primary text-white">Save Log</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Work Logs</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockWorkLogs.map((log) => (
              <div key={log.id} className="p-4 rounded-lg border">
                <div className="flex justify-between items-start mb-2">
                  <div><p className="font-medium">{log.task}</p><p className="text-sm text-muted-foreground">{log.summary}</p></div>
                  <div className="text-right"><p className="font-semibold flex items-center gap-1"><Clock className="w-4 h-4" />{log.hours}h</p><p className="text-xs text-muted-foreground">{log.date}</p></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
