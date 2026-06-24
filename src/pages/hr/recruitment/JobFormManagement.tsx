import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { isValidJobFormStatusTransition } from "@/lib/status-validators";
import { Loader2, Briefcase, Search, Plus, Edit3, Trash2, Copy, Archive, Clock, CheckCircle2, XCircle, Calendar, AlertTriangle } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  "Draft": "bg-slate-100 text-slate-600 border-slate-300",
  "Published": "bg-emerald-50 text-emerald-700 border-emerald-300",
  "Closed": "bg-amber-50 text-amber-700 border-amber-300",
  "Expired": "bg-red-50 text-red-500 border-red-200",
  "Archived": "bg-slate-50 text-slate-400 border-slate-200"
};

const LIFECYCLE_FLOW = ["Draft", "Published", "Closed", "Archived"];

export default function JobFormManagement() {
  const { toast } = useToast();
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closeTarget, setCloseTarget] = useState<any>(null);
  const [closeReason, setCloseReason] = useState("");

  const [showExpiryDialog, setShowExpiryDialog] = useState(false);
  const [expiryTarget, setExpiryTarget] = useState<any>(null);
  const [expiryDate, setExpiryDate] = useState("");

  useEffect(() => {
    fetchForms();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUserId(data.user.id);
    });
  }, []);

  const fetchForms = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("job_forms")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setForms(data || []);
    } catch (err: any) {
      toast({ title: "Failed to Load", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const updateStatus = async (id: string, newStatus: string, extra?: Record<string, any>) => {
    setProcessingId(id);
    try {
      const form = forms.find(f => f.id === id);
      if (form && !isValidJobFormStatusTransition(form.status, newStatus)) {
        toast({ title: "Invalid Transition", description: `Cannot move job form from "${form.status}" to "${newStatus}".`, variant: "destructive" });
        setProcessingId(null);
        return;
      }
      const updateData: any = { status: newStatus, ...extra };
      if (newStatus === "Published") updateData.published_at = new Date().toISOString();
      else if (newStatus === "Closed") updateData.closed_at = new Date().toISOString();
      else if (newStatus === "Archived") updateData.updated_at = new Date().toISOString();

      const { error } = await supabase.from("job_forms").update(updateData).eq("id", id);
      if (error) throw error;

      toast({ title: "Status Updated", description: `Job form moved to '${newStatus}'.` });
      fetchForms();
      if (selectedForm?.id === id) {
        setSelectedForm({ ...selectedForm, ...updateData });
      }
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    }
    setProcessingId(null);
  };

  const duplicateForm = async (form: any) => {
    setProcessingId(form.id);
    try {
      const { error } = await supabase.from("job_forms").insert([{
        job_title: form.job_title + " (Copy)",
        jd_text: form.jd_text,
        form_schema: form.form_schema,
        requires_assessment: form.requires_assessment ?? true,
        status: "Draft",
        created_by: currentUserId
      }]);
      if (error) throw error;
      toast({ title: "Duplicated", description: "Job form copied as new Draft." });
      fetchForms();
    } catch (err: any) {
      toast({ title: "Duplicate Failed", description: err.message, variant: "destructive" });
    }
    setProcessingId(null);
  };

  const deleteForm = async () => {
    if (!deleteTarget) return;
    setProcessingId(deleteTarget.id);
    try {
      const { error } = await supabase.from("job_forms").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "Deleted", description: "Job form permanently removed." });
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      if (selectedForm?.id === deleteTarget.id) setSelectedForm(null);
      fetchForms();
    } catch (err: any) {
      toast({ title: "Delete Failed", description: err.message, variant: "destructive" });
    }
    setProcessingId(null);
  };

  const saveEdit = async () => {
    if (!editForm) return;
    setProcessingId(editForm.id);
    try {
      const { error } = await supabase
        .from("job_forms")
        .update({
          job_title: editForm.job_title,
          jd_text: editForm.jd_text,
          form_schema: editForm.form_schema,
          requires_assessment: editForm.requires_assessment ?? true,
          updated_at: new Date().toISOString()
        })
        .eq("id", editForm.id);
      if (error) throw error;
      toast({ title: "Updated", description: "Job form saved." });
      setShowEditDialog(false);
      setEditForm(null);
      fetchForms();
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    }
    setProcessingId(null);
  };

  const setExpiry = async () => {
    if (!expiryTarget || !expiryDate) return;
    setProcessingId(expiryTarget.id);
    try {
      const { error } = await supabase
        .from("job_forms")
        .update({ expires_at: new Date(expiryDate).toISOString() })
        .eq("id", expiryTarget.id);
      if (error) throw error;
      toast({ title: "Expiry Set", description: `Form will expire on ${new Date(expiryDate).toLocaleDateString()}.` });
      setShowExpiryDialog(false);
      setExpiryTarget(null);
      setExpiryDate("");
      fetchForms();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
    setProcessingId(null);
  };

  const closeForm = async () => {
    if (!closeTarget) return;
    await updateStatus(closeTarget.id, "Closed", { closed_reason: closeReason || "No reason provided" });
    setShowCloseDialog(false);
    setCloseTarget(null);
    setCloseReason("");
  };

  const canDelete = (status: string) => status === "Draft";
  const canArchive = (status: string) => status === "Closed" || status === "Expired";

  const filteredForms = forms.filter(f => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (f.job_title || "").toLowerCase().includes(q) || (f.jd_text || "").toLowerCase().includes(q);
    const matchesStatus = filterStatus === "All" || f.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getApplyLink = (formId: string) => `${window.location.origin}/apply/${formId}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="bg-slate-50 border-b p-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-indigo-600" /> Job Form Management
          </CardTitle>
          <div className="text-xs text-slate-400 font-medium">{forms.length} total</div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by job title or description..."
                className="pl-9 h-10 text-sm"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-44 h-10 text-xs">
                <SelectValue placeholder="Filter Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                {Object.keys(STATUS_COLORS).map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow>
                  <TableHead className="font-black text-xs">Job Title</TableHead>
                  <TableHead className="font-black text-xs">Status</TableHead>
                  <TableHead className="font-black text-xs">Created</TableHead>
                  <TableHead className="font-black text-xs">Expires</TableHead>
                  <TableHead className="font-black text-xs">Apply Link</TableHead>
                  <TableHead className="font-black text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600" /></TableCell></TableRow>
                ) : filteredForms.map(form => {
                  const isExpired = form.expires_at && new Date(form.expires_at) < new Date();
                  const displayStatus = isExpired && form.status === "Published" ? "Expired" : form.status;

                  return (
                    <TableRow
                      key={form.id}
                      className={`cursor-pointer hover:bg-slate-50/80 ${selectedForm?.id === form.id ? "bg-indigo-50/50" : ""}`}
                      onClick={() => setSelectedForm(form)}
                    >
                      <TableCell>
                        <div className="font-bold text-slate-900">{form.job_title || "Untitled"}</div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded border tracking-wider ${STATUS_COLORS[displayStatus] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                          {displayStatus}
                        </span>
                        {form.expires_at && (
                          <div className="text-[9px] text-slate-400 mt-1">
                            {isExpired ? "Expired" : `Expires ${new Date(form.expires_at).toLocaleDateString()}`}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">{new Date(form.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {form.expires_at ? new Date(form.expires_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        {form.status === "Published" && !isExpired ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[10px] font-bold text-indigo-600 h-6 px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(getApplyLink(form.id));
                              toast({ title: "Copied", description: "Apply link copied to clipboard." });
                            }}
                          >
                            Copy Link
                          </Button>
                        ) : (
                          <span className="text-[10px] text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                          {form.status === "Draft" && (
                            <Button size="sm" className="h-7 text-[10px] font-bold bg-emerald-600 text-white" onClick={() => updateStatus(form.id, "Published")} disabled={processingId === form.id}>
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Publish
                            </Button>
                          )}
                          {form.status === "Published" && !isExpired && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold text-amber-700 border-amber-200" onClick={() => { setCloseTarget(form); setShowCloseDialog(true); }} disabled={processingId === form.id}>
                                <XCircle className="w-3 h-3 mr-1" /> Close
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold text-slate-500 border-slate-200" onClick={() => { setExpiryTarget(form); setShowExpiryDialog(true); }} disabled={processingId === form.id}>
                                <Clock className="w-3 h-3 mr-1" /> Expire
                              </Button>
                            </>
                          )}
                          {canArchive(form.status) && (
                            <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold text-indigo-600 border-indigo-200" onClick={() => updateStatus(form.id, "Archived")} disabled={processingId === form.id}>
                              <Archive className="w-3 h-3 mr-1" /> Archive
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold text-slate-600 border-slate-200" onClick={() => duplicateForm(form)} disabled={processingId === form.id}>
                            <Copy className="w-3 h-3 mr-1" /> Duplicate
                          </Button>
                          {form.status !== "Archived" && (
                            <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold text-blue-600 border-blue-200" onClick={() => { setEditForm({ ...form }); setShowEditDialog(true); }}>
                              <Edit3 className="w-3 h-3 mr-1" /> Edit
                            </Button>
                          )}
                          {canDelete(form.status) && (
                            <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold text-red-600 border-red-200" onClick={() => { setDeleteTarget(form); setShowDeleteDialog(true); }}>
                              <Trash2 className="w-3 h-3 mr-1" /> Delete
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && filteredForms.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-400 text-sm">No job forms found. Generate one in the JD tab first.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selectedForm && (
        <Card className="border-indigo-100 shadow-lg bg-white animate-in slide-in-from-bottom-4">
          <CardHeader className="bg-indigo-900 text-white p-4 flex flex-row justify-between items-center">
            <CardTitle className="text-sm font-black tracking-wider flex items-center gap-2"><Briefcase className="w-4 h-4" /> {selectedForm.job_title || "Job Form Details"}</CardTitle>
            <Button size="sm" variant="ghost" className="text-white/80 hover:text-white" onClick={() => setSelectedForm(null)}>Close</Button>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Status</p>
                <span className={`inline-block mt-1 text-[10px] font-black uppercase px-2 py-1 rounded border tracking-wider ${STATUS_COLORS[selectedForm.status] || ''}`}>
                  {selectedForm.status}
                </span>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Created</p>
                <p className="text-sm font-bold text-slate-800">{new Date(selectedForm.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Timeline</p>
                <div className="text-xs text-slate-600 space-y-0.5">
                  <p>Published: {selectedForm.published_at ? new Date(selectedForm.published_at).toLocaleDateString() : "Not published"}</p>
                  <p>Closed: {selectedForm.closed_at ? new Date(selectedForm.closed_at).toLocaleDateString() : "Open"}</p>
                  <p>Expires: {selectedForm.expires_at ? new Date(selectedForm.expires_at).toLocaleDateString() : "No expiry"}</p>
                </div>
              </div>
            </div>

            {selectedForm.published_at && selectedForm.status === "Published" && (
              <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                <p className="text-[10px] font-black uppercase text-indigo-500 tracking-wider mb-1">Public Apply Link</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-white px-3 py-1.5 rounded border flex-1 truncate">{getApplyLink(selectedForm.id)}</code>
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => { navigator.clipboard.writeText(getApplyLink(selectedForm.id)); toast({ title: "Copied", description: "Apply link copied." }); }}>
                    Copy
                  </Button>
                </div>
              </div>
            )}

            {selectedForm.jd_text && (
              <div className="bg-slate-50 p-4 rounded-xl border">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Job Description</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedForm.jd_text}</p>
              </div>
            )}

            {selectedForm.closed_reason && (
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                <p className="text-[10px] font-black uppercase text-amber-600 tracking-wider mb-1">Closing Reason</p>
                <p className="text-sm text-amber-800">{selectedForm.closed_reason}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Job Form</DialogTitle>
            <DialogDescription>Update the job title, description, and form schema.</DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-500">Job Title</label>
                <Input value={editForm.job_title || ""} onChange={e => setEditForm({ ...editForm, job_title: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-500">Job Description</label>
                <Textarea className="h-40" value={editForm.jd_text || ""} onChange={e => setEditForm({ ...editForm, jd_text: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-500">Form Schema (JSON)</label>
                <Textarea className="h-32 font-mono text-xs" value={typeof editForm.form_schema === 'string' ? editForm.form_schema : JSON.stringify(editForm.form_schema || {}, null, 2)} onChange={e => setEditForm({ ...editForm, form_schema: e.target.value })} />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={editForm.requires_assessment ?? true} onChange={e => setEditForm({ ...editForm, requires_assessment: e.target.checked })} />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
                <label className="text-xs font-semibold text-slate-700 cursor-pointer select-none">Require Assessment for Shortlisted Candidates</label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={processingId === editForm?.id} className="bg-indigo-600">
              {processingId === editForm?.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><AlertTriangle className="w-5 h-5" /> Delete Job Form</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete "{deleteTarget?.job_title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteForm} disabled={processingId === deleteTarget?.id}>
              {processingId === deleteTarget?.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600"><XCircle className="w-5 h-5" /> Close Job Form</DialogTitle>
            <DialogDescription>
              Closing "{closeTarget?.job_title}" will stop accepting new applications. Provide a reason for closing.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Closing Reason</label>
            <Textarea
              value={closeReason}
              onChange={e => setCloseReason(e.target.value)}
              placeholder="E.g. Position filled, Department restructured"
              className="h-20"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCloseDialog(false); setCloseTarget(null); setCloseReason(""); }}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={closeForm} disabled={processingId === closeTarget?.id}>
              {processingId === closeTarget?.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Close Form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExpiryDialog} onOpenChange={setShowExpiryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-600"><Calendar className="w-5 h-5" /> Set Expiry Date</DialogTitle>
            <DialogDescription>
              Set an automatic expiry date for "{expiryTarget?.job_title}". After this date, the form status changes to Expired.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Expiry Date</label>
            <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowExpiryDialog(false); setExpiryTarget(null); setExpiryDate(""); }}>Cancel</Button>
            <Button onClick={setExpiry} disabled={!expiryDate || processingId === expiryTarget?.id} className="bg-slate-700 hover:bg-slate-800">
              {processingId === expiryTarget?.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Set Expiry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
