import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LayoutDashboard, ListTodo, FolderKanban, FileText, AlertTriangle, Bell, MessageSquare, Settings, Plus, Clock } from "lucide-react";
import { PresenceStatus, WorkMode } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { listMyTasks } from "@/lib/db/tasks";
import { createWorkLog, listMyWorkLogs, type WorkLogRow } from "@/lib/db/work-logs";

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

export default function WorkLogs() {
  const { profile } = useAuth();
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("offline");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);
  const [logs, setLogs] = useState<WorkLogRow[]>([]);
  const [tasks, setTasks] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ taskId: "", summary: "", hours: "", date: "" });

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => { setPresenceStatus(status); setWorkMode(mode); };

  const fetchAll = async () => {
    if (!profile) return;
    setLoading(true);
    const [lRes, tRes] = await Promise.all([listMyWorkLogs(profile.id), listMyTasks(profile.id)]);
    setLogs(lRes.data ?? []);
    setTasks((tRes.data ?? []).map((t) => ({ id: t.id, title: t.title })));
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const submit = async () => {
    if (!profile) return;
    const hoursSpent = Number(form.hours);
    if (!form.taskId || !form.summary.trim() || Number.isNaN(hoursSpent) || hoursSpent < 0) return;

    const res = await createWorkLog({
      taskId: form.taskId,
      userId: profile.id,
      summary: form.summary.trim(),
      hoursSpent,
      workDate: form.date ? form.date : null,
    });

    if (res.error) return;

    setOpen(false);
    setForm({ taskId: "", summary: "", hours: "", date: "" });
    fetchAll();
  };

  return (
    <DashboardLayout
      role="employee"
      navItems={navItems}
      userName={profile?.name || "Employee"}
      userEmail={profile?.email || ""}
      presenceStatus={presenceStatus}
      workMode={workMode}
      onPresenceChange={handlePresenceChange}
    >
      <div className="flex justify-between items-start mb-6">
        <div className="page-header mb-0"><h1 className="page-title">Work Logs</h1><p className="page-description">Track your daily work activities</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gradient-primary text-white"><Plus className="w-4 h-4 mr-2" />Add Work Log</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Work Log</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Task</Label>
                <Select value={form.taskId} onValueChange={(v) => setForm((p) => ({ ...p, taskId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select task" />
                  </SelectTrigger>
                  <SelectContent>
                    {tasks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Summary</Label><Textarea placeholder="What did you work on?" value={form.summary} onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Hours</Label><Input type="number" placeholder="0" value={form.hours} onChange={(e) => setForm((p) => ({ ...p, hours: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} /></div>
              </div>
            </div>
            <DialogFooter><Button className="gradient-primary text-white" onClick={submit}>Save Log</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Work Logs</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading logs...</div>
            ) : logs.length === 0 ? (
              <div className="text-sm text-muted-foreground">No work logs yet.</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="p-4 rounded-lg border">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium">{log.tasks?.title ?? "Task"}</p>
                      <p className="text-sm text-muted-foreground">{log.summary}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {log.hours_spent}h
                      </p>
                      <p className="text-xs text-muted-foreground">{log.work_date}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
