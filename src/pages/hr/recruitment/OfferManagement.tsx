import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { isValidStatusTransition, isValidOfferStatusTransition } from "@/lib/status-validators";
import { Loader2, Mail, CheckCircle2, XCircle, Clock, Search, Send, FileSignature, AlertTriangle } from "lucide-react";
import { OfferLetter, JobApplication } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  "Pending Approval": "bg-amber-50 text-amber-700 border-amber-200",
  "Approved": "bg-blue-50 text-blue-700 border-blue-200",
  "Sent": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Accepted": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Declined": "bg-red-50 text-red-700 border-red-200",
  "Expired": "bg-slate-50 text-slate-500 border-slate-200"
};

export default function OfferManagement() {
  const { toast } = useToast();

  // ---- Create Offer (authoritative RPC path; product decision A) ----
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [eligibleApps, setEligibleApps] = useState<JobApplication[]>([]);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [offeredCtc, setOfferedCtc] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  const openCreateDialog = async () => {
    setCreateError(null);
    setSelectedAppId(""); setOfferedCtc(""); setJoiningDate(""); setJobTitle("");
    setCreateOpen(true);
    // Offer-eligible applications: server re-validates; this is UX pre-filtering only.
    const { data, error } = await supabase
      .from("job_applications")
      .select("id, candidate_name, candidate_email, status, form_id")
      .in("status", ["Assessment Completed", "Interview Scheduled", "Interview Cleared", "Offer Generated"])
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast({ title: "Load Failed", description: error.message, variant: "destructive" });
      return;
    }
    setEligibleApps((data as JobApplication[]) || []);
  };

  const submitCreateOffer = async () => {
    setCreateError(null);
    if (!selectedAppId || !offeredCtc || !joiningDate) {
      setCreateError("Application, CTC and joining date are required.");
      return;
    }
    const ctc = Number(offeredCtc);
    if (!Number.isFinite(ctc) || ctc <= 0) {
      setCreateError("CTC must be a positive number.");
      return;
    }
    setCreating(true);
    try {
      const { data: result, error } = await supabase.rpc("create_offer_for_application", {
        p_application_id: selectedAppId,
        p_offered_ctc: ctc,
        p_joining_date: joiningDate,
        p_job_title: jobTitle.trim() || null
      });
      if (error) throw error;
      if (!result?.success) {
        setCreateError(result?.error || "Server refused offer creation.");
        return;
      }
      toast({ title: "Offer Created", description: `Reference ${result.reference}. Pending approval.` });
      setCreateOpen(false);
      fetchOffers();
    } catch (err: any) {
      setCreateError(err.message || "Unexpected error.");
    } finally {
      setCreating(false);
    }
  };
  const [offers, setOffers] = useState<OfferLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<OfferLetter | null>(null);

  useEffect(() => {
    fetchOffers();
  }, []);

  const fetchOffers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("offer_letters")
        .select("*")
        .order("created_at", { ascending: false })
        .range(0, 99);

      if (error) throw error;

      const offers = data || [];
      const candidateIds = [...new Set(offers.map(o => o.candidate_id).filter(Boolean))];
      const formIds = [...new Set(offers.map(o => o.job_form_id).filter(Boolean))];

      const [candidatesRes, formsRes] = await Promise.all([
        candidateIds.length > 0
          ? supabase.from("candidates").select("id, full_name, email").in("id", candidateIds)
          : Promise.resolve({ data: [] }),
        formIds.length > 0
          ? supabase.from("job_forms").select("id, job_title").in("id", formIds)
          : Promise.resolve({ data: [] })
      ]);

      const candidatesMap = new Map((candidatesRes.data || []).map(c => [c.id, c]));
      const formsMap = new Map((formsRes.data || []).map(f => [f.id, f]));

      const offersWithRefs = offers.map((offer: OfferLetter) => ({
        ...offer,
        candidates: candidatesMap.get(offer.candidate_id) || { full_name: "Unknown", email: "" },
        job_forms: formsMap.get(offer.job_form_id) || { job_title: "" }
      }));

      setOffers(offersWithRefs);
    } catch (err) {
      console.error("Failed to load offers:", err);
    }
    setLoading(false);
  };

  const updateOfferStatus = async (id: string, newStatus: string) => {
    setProcessingId(id);
    try {
      // SERVER-AUTHORITATIVE STATE MACHINE: the RPC derives the actor from
      // the JWT, validates the transition against the canonical offer state
      // machine and performs timestamping + pipeline sync in one transaction.
      const actionMap: Record<string, string> = {
        "Approved": "approve",
        "Sent": "send",
        "Accepted": "accept",
        "Declined": "decline",
        "Expired": "expire"
      };
      const action = actionMap[newStatus];
      if (!action) {
        toast({ title: "Unsupported Transition", description: `Status '${newStatus}' is not an actionable offer transition.`, variant: "destructive" });
        setProcessingId(null);
        return;
      }

      const { data: result, error } = await supabase.rpc("transition_offer_status", {
        p_offer_id: id,
        p_action: action
      });

      if (error) throw error;
      if (!result?.success) {
        toast({ title: "Transition Refused", description: result?.error || "Server refused the transition.", variant: "destructive" });
        setProcessingId(null);
        return;
      }

      toast({ title: "Status Updated", description: `Offer moved to '${result.status}'.` });
      fetchOffers();
    } catch (err) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    }
    setProcessingId(null);
  };

  const filteredOffers = offers.filter(o => {
    const candidateName = (o.candidates?.full_name || "").toLowerCase();
    const email = (o.candidates?.email || "").toLowerCase();
    const q = searchQuery.toLowerCase();
    const matchesSearch = candidateName.includes(q) || email.includes(q) || o.terms?.toLowerCase().includes(q);
    const matchesStatus = filterStatus === "All" || o.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="bg-slate-50 border-b p-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <FileSignature className="w-4 h-4 text-indigo-600" /> Offer Letter Management
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-400 font-medium">{offers.length} total</div>
            <Button size="sm" className="h-8 text-xs font-bold bg-indigo-600 text-white" onClick={openCreateDialog}>
              <FileSignature className="w-3.5 h-3.5 mr-1.5" /> Create Offer
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by candidate name, email, or terms..."
                className="pl-9 h-10 text-sm"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-48 h-10 text-xs">
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

          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow>
                  <TableHead className="font-black text-xs">Candidate</TableHead>
                  <TableHead className="font-black text-xs">Role</TableHead>
                  <TableHead className="font-black text-xs">CTC</TableHead>
                  <TableHead className="font-black text-xs">Date</TableHead>
                  <TableHead className="font-black text-xs">Status</TableHead>
                  <TableHead className="font-black text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600" /></TableCell></TableRow>
                ) : filteredOffers.map(offer => (
                  <TableRow
                    key={offer.id}
                    className={`cursor-pointer hover:bg-slate-50/80 ${selectedOffer?.id === offer.id ? "bg-indigo-50/50" : ""}`}
                    onClick={() => setSelectedOffer(offer)}
                  >
                    <TableCell>
                      <div className="font-bold text-slate-900">{offer.candidates?.full_name || "Unknown"}</div>
                      <div className="text-xs text-slate-500">{offer.candidates?.email || ""}</div>
                    </TableCell>
                    <TableCell className="text-indigo-700 font-medium text-sm">{offer.job_forms?.job_title || offer.terms?.split('\n')[0]?.replace('Role: ', '') || 'N/A'}</TableCell>
                    <TableCell className="font-mono font-bold text-slate-800">₹{Number(offer.offered_ctc).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-xs text-slate-500">{new Date(offer.offer_date || offer.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <span className={`text-[10px] font-black uppercase px-2 py-1 rounded border tracking-wider ${STATUS_COLORS[offer.status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                        {offer.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                        {offer.status === "Pending Approval" && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold text-blue-700 border-blue-200" onClick={() => updateOfferStatus(offer.id, "Approved")} disabled={processingId === offer.id}>
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                          </Button>
                        )}
                        {offer.status === "Approved" && (
                          <Button size="sm" className="h-7 text-[10px] font-bold bg-indigo-600 text-white" onClick={() => updateOfferStatus(offer.id, "Sent")} disabled={processingId === offer.id}>
                            <Send className="w-3 h-3 mr-1" /> Mark Sent
                          </Button>
                        )}
                        {offer.status === "Sent" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold text-emerald-700 border-emerald-200" onClick={() => updateOfferStatus(offer.id, "Accepted")} disabled={processingId === offer.id}>
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Accept
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold text-red-700 border-red-200" onClick={() => updateOfferStatus(offer.id, "Declined")} disabled={processingId === offer.id}>
                              <XCircle className="w-3 h-3 mr-1" /> Decline
                            </Button>
                          </>
                        )}
                        {["Pending Approval", "Approved", "Sent"].includes(offer.status) && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold text-slate-500 border-slate-200" onClick={() => updateOfferStatus(offer.id, "Expired")} disabled={processingId === offer.id}>
                            <Clock className="w-3 h-3 mr-1" /> Expire
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && filteredOffers.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-400 text-sm">No offer letters found.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selectedOffer && (
        <Card className="border-indigo-100 shadow-lg bg-white animate-in slide-in-from-bottom-4">
          <CardHeader className="bg-indigo-900 text-white p-4 flex flex-row justify-between items-center">
            <CardTitle className="text-sm font-black tracking-wider flex items-center gap-2"><FileSignature className="w-4 h-4" /> Offer Details</CardTitle>
            <Button size="sm" variant="ghost" className="text-white/80 hover:text-white" onClick={() => setSelectedOffer(null)}>Close</Button>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Candidate</p>
                <p className="text-lg font-bold text-slate-900">{selectedOffer.candidates?.full_name || "N/A"}</p>
                <p className="text-xs text-slate-500">{selectedOffer.candidates?.email || ""}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Offered CTC</p>
                <p className="text-lg font-bold text-emerald-600 font-mono">₹{Number(selectedOffer.offered_ctc).toLocaleString('en-IN')}</p>
                <p className="text-xs text-slate-500">Joining: {selectedOffer.joining_date ? new Date(selectedOffer.joining_date).toLocaleDateString() : 'TBD'}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Status Timeline</p>
                <p className="text-xs text-slate-600">Created: {new Date(selectedOffer.created_at).toLocaleDateString()}</p>
                <p className="text-xs text-slate-600">Sent: {selectedOffer.sent_at ? new Date(selectedOffer.sent_at).toLocaleDateString() : 'Not sent'}</p>
                <p className="text-xs text-slate-600">Response: {selectedOffer.responded_at ? new Date(selectedOffer.responded_at).toLocaleDateString() : 'Awaiting'}</p>
              </div>
            </div>

            {selectedOffer.terms && (
              <div className="bg-slate-50 p-4 rounded-xl border">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Terms & Conditions</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedOffer.terms}</p>
              </div>
            )}

            {selectedOffer.notes && (
              <div className="bg-slate-50 p-4 rounded-xl border">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Internal Notes</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedOffer.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileSignature className="w-4 h-4 text-indigo-600" /> Create Offer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600">Application (offer-eligible)</Label>
              <Select value={selectedAppId} onValueChange={setSelectedAppId}>
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select application" /></SelectTrigger>
                <SelectContent>
                  {eligibleApps.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.candidate_name || a.candidate_email} — {a.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600">Role title</Label>
              <Input className="h-10 text-sm" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Senior React Engineer" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600">Annual CTC (₹)</Label>
                <Input className="h-10 text-sm" type="number" min="1" value={offeredCtc} onChange={e => setOfferedCtc(e.target.value)} placeholder="1800000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600">Joining date</Label>
                <Input className="h-10 text-sm" type="date" min={new Date().toISOString().slice(0, 10)} value={joiningDate} onChange={e => setJoiningDate(e.target.value)} />
              </div>
            </div>
            {createError && (
              <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {createError}
              </div>
            )}
            <p className="text-[11px] text-slate-400">
              The server validates HR authorization, the candidate/application relationship and the current pipeline state.
              The offer is created as <span className="font-semibold">Pending Approval</span> and continues through the existing state machine.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button size="sm" className="bg-indigo-600 text-white" onClick={submitCreateOffer} disabled={creating}>
              {creating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileSignature className="w-3.5 h-3.5 mr-1.5" />}
              {creating ? "Creating…" : "Create Offer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}