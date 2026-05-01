import { useEffect, useState } from "react";
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
import { useAuth } from "@/lib/auth-context";
import { createComplaint, listMyComplaints, type ComplaintRow } from "@/lib/db/complaints";

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

export default function Complaints() {
  const { profile } = useAuth();
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("offline");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [complaints, setComplaints] = useState<ComplaintRow[]>([]);
  const [form, setForm] = useState({ title: "", description: "" });

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => { setPresenceStatus(status); setWorkMode(mode); };

  const fetchAll = async () => {
    if (!profile) return;
    setLoading(true);
    const res = await listMyComplaints(profile.id);
    setComplaints(res.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const submit = async () => {
    if (!profile) return;
    if (!form.title.trim() || !form.description.trim()) return;
    const res = await createComplaint({ title: form.title.trim(), description: form.description.trim(), raisedBy: profile.id });
    if (res.error) return;
    setOpen(false);
    setForm({ title: "", description: "" });
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
        <div className="page-header mb-0"><h1 className="page-title">Complaints</h1><p className="page-description">Raise and track issues</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gradient-primary text-white"><Plus className="w-4 h-4 mr-2" />Raise Complaint</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Raise Complaint</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Title</Label><Input placeholder="Brief title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea placeholder="Describe your issue..." rows={4} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
            </div>
            <DialogFooter><Button className="gradient-primary text-white" onClick={submit}>Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>My Complaints</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading complaints...</div>
            ) : complaints.length === 0 ? (
              <div className="text-sm text-muted-foreground">No complaints yet.</div>
            ) : (
              complaints.map((c) => (
                <div key={c.id} className="p-4 rounded-lg border flex justify-between items-start">
                  <div>
                    <p className="font-medium">{c.title}</p>
                    <p className="text-sm text-muted-foreground">{c.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
