import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Candidate, BackgroundVerification, CandidateOnboarding } from "@/types";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Input } from "@/components/ui/input";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { Button } from "@/components/ui/button";

import {
  Search,
  UserCheck,
  FileCheck,
  Clock,
  ShieldCheck,
  Building,
  DollarSign,
  UserCircle,
  Loader2,
  Check,
  AlertTriangle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function OnboardingCenter() {
  useEffect(() => { document.title = "Onboarding Center - TaskFlow"; }, []);
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [filtered, setFiltered] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [search, setSearch] = useState("");

  // Factual requested documents array state framework
  const [documents, setDocuments] = useState<BackgroundVerification[]>([]);

  // Corporate assignment infrastructure input variables
  const [teamLeads, setTeamLeads] = useState<any[]>([]);
  const [selectedTeamLead, setSelectedTeamLead] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [assignedPayroll, setAssignedPayroll] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [processingOnboard, setProcessingOnboard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verifyingDocId, setVerifyingDocId] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      candidates.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
      )
    );
  }, [search, candidates]);

  const fetchInitialData = async () => {
    setLoading(true);
    await fetchCandidates();
    await fetchActiveTeamLeads();
    setLoading(false);
  };

  const fetchCandidates = async () => {
    try {
      // Only show candidates with accepted offers — ready for onboarding
      const { data: offerAcceptedApps, error: appsErr } = await supabase
        .from("job_applications")
        .select(`
          id, candidate_id, candidate_name, form_id,
          job_forms:form_id (job_title)
        `)
        .eq("status", "Offer Accepted");

      if (appsErr) throw appsErr;

      const candidateIds: string[] = [...new Set((offerAcceptedApps || []).map(a => a.candidate_id).filter(Boolean))];

      let profileCandidates: any[] = [];
      if (candidateIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("*")
          .in("id", candidateIds);
        if (profiles) profileCandidates = profiles;
      }

      let atsCandidates: any[] = [];
      if (candidateIds.length > 0) {
        const { data } = await supabase
          .from("candidates")
          .select("id, full_name, email, phone, stage, profile_id")
          .in("id", candidateIds);
        if (data) atsCandidates = data;
      }

      const merged = (offerAcceptedApps || []).map(app => {
        const profile = profileCandidates.find(p => p.id === app.candidate_id);
        const atsCand = atsCandidates?.find(c => c.id === app.candidate_id || c.profile_id === app.candidate_id);
        return {
          id: app.candidate_id,
          name: app.candidate_name || profile?.name || atsCand?.full_name || "Unknown",
          email: profile?.email || atsCand?.email || "",
          phone: profile?.phone || atsCand?.phone || "",
          role: 'candidate',
          verification_status: profile?.verification_status || 'pending',
          job_title: app.job_forms?.job_title || "Position",
          application_id: app.id,
          _candidate_table_id: atsCand?.id || null,
          _source: profile ? 'profile' : 'ats'
        };
      });

      setCandidates(merged);
      setFiltered(merged);
    } catch (err) {
      console.error("Failed to fetch offer-accepted candidates:", err);
    }
  };

  const fetchActiveTeamLeads = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, department")
        .eq("role", "team_lead");
      
      if (error) throw error;
      setTeamLeads(data || []);
    } catch (err) {
      console.error("Failed to query active team leads:", err);
    }
  };

  const fetchCandidateDocuments = async (candidate: Candidate) => {
    try {
      const { data, error } = await supabase
        .from("background_verifications")
        .select("*")
        .eq("candidate_id", candidate.id);

      if (error) throw error;

      console.debug("Fetched documents for candidate");

      setDocuments(data || []);
      setSelectedCandidate(candidate);
    } catch (error) {
      console.error(error);
    }
  };

  const handleVerifyDocumentStatus = async (docId: string, nextStatus: 'Verified' | 'Rejected') => {
    setVerifyingDocId(docId);
    try {
      const { error } = await supabase
        .from("background_verifications")
        .update({ status: nextStatus })
        .eq("id", docId);

      if (error) throw error;

      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: nextStatus } : d));
      toast({ title: `Document ${nextStatus}`, description: "The validation matrix has updated successfully." });
    } catch (err) {
      toast({ title: "Verification Failed", description: err.message, variant: "destructive" });
    }
    setVerifyingDocId(null);
  };

  const handleOnboardCandidate = async () => {
    if (!selectedCandidate) return;
    if (!selectedDepartment) {
      return toast({ title: "Validation Warning", description: "Please assign an operational division branch department.", variant: "destructive" });
    }
    if (!selectedTeamLead) {
      return toast({ title: "Validation Warning", description: "Please select an active Team Lead manager.", variant: "destructive" });
    }
    if (!assignedPayroll || isNaN(Number(assignedPayroll)) || Number(assignedPayroll) <= 0) {
      return toast({ title: "Validation Warning", description: "Please enter a valid monthly basic CTC package allocation.", variant: "destructive" });
    }

    setProcessingOnboard(true);
    try {
      // Resolve the correct candidate_id for FK constraint (candidates.id)
      let candidateTableId = selectedCandidate._candidate_table_id;
      if (!candidateTableId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("candidate_id")
          .eq("id", selectedCandidate.id)
          .maybeSingle();
        if (profile?.candidate_id) {
          candidateTableId = profile.candidate_id;
        } else {
          // Fallback: use the candidate id from application
          const { data: app } = await supabase
            .from("job_applications")
            .select("candidate_id")
            .eq("id", selectedCandidate.application_id)
            .maybeSingle();
          candidateTableId = app?.candidate_id || selectedCandidate.id;
        }
      }

      // Step 1: Elevate candidate role profile values
      const profileUpdate: any = {
        role: "employee",
        department: selectedDepartment,
        team_lead_id: selectedTeamLead,
        payroll_ctc: Number(assignedPayroll),
        verification_status: "verified",
        employment_status: "active"
      };
      if (joiningDate) {
        profileUpdate.join_date = joiningDate;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("id", selectedCandidate.id);

      if (profileError) throw profileError;

      // Step 2: Create onboarding record with correct candidate_id FK
      const employeeCode = `EMP-${selectedCandidate.id.substring(0,6).toUpperCase()}${Date.now().toString(36).toUpperCase()}`;
      // Delete any existing onboarding record for this candidate
      await supabase.from("candidate_onboarding").delete().eq("candidate_id", candidateTableId);
      const { error: onboardingRecordError } = await supabase
        .from("candidate_onboarding")
        .insert({
          candidate_id: candidateTableId,
          onboarding_stage: "completed",
          completion_percentage: 100,
          department: selectedDepartment,
          manager_id: selectedTeamLead,
          salary: Number(assignedPayroll),
          employee_code: employeeCode,
          asset_status: "pending",
          payroll_status: "active",
          onboarding_completed: true
        });

      if (onboardingRecordError) throw onboardingRecordError;

      // Step 3: Update job_application status to Onboarding
      if (selectedCandidate.application_id) {
        await supabase
          .from("job_applications")
          .update({ status: "Onboarding" })
          .eq("id", selectedCandidate.application_id);
      }

      // Step 4: Sync candidates.stage with job_application status
      if (candidateTableId) {
        await supabase
          .from("candidates")
          .update({ stage: "Onboarding" })
          .eq("id", candidateTableId);
      }

      // Step 5: Notify candidate of successful onboarding
      if (candidateTableId) {
        await supabase.from('candidate_notifications').insert({
          candidate_id: candidateTableId,
          title: 'Onboarding Complete',
          message: `Congratulations! You have been successfully onboarded. Your employee code is: ${employeeCode}. You can now access employee features.`,
          read: false
        });
      }

      toast({ 
        title: "Onboarding Complete", 
        description: `${selectedCandidate.name} onboarded successfully. Employee Code: ${employeeCode}` 
      });

      setSelectedCandidate(null);
      setSelectedDepartment("");
      setSelectedTeamLead("");
      setAssignedPayroll("");
      setJoiningDate("");
      setDocuments([]);
      
      // Step 6: Hot-reload active grids.
      await fetchCandidates();
    } catch (err) {
      console.error("Critical onboarding chain failure:", err);
      toast({ title: "Onboarding Aborted", description: err.message || "Failed to finalize database conversion.", variant: "destructive" });
    } finally {
      setProcessingOnboard(false);
    }
  };

  const totalCandidates = candidates.length;
  const verifiedCandidates = candidates.filter((c) => c.verification_status === "verified").length;
  const pendingCandidates = candidates.filter((c) => c.verification_status !== "verified").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Onboarding & Verification Center
        </h1>
        <p className="text-slate-500 mt-1">
          Manage candidate onboarding datasets and verify submitted document payloads prior to database conversion.
        </p>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <UserCheck className="w-6 h-6 mb-2 text-blue-600" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Offer Accepted</p>
            <h2 className="text-3xl font-black mt-1 text-slate-800">{totalCandidates}</h2>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-6">
            <ShieldCheck className="w-6 h-6 mb-2 text-emerald-600" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Verified Clearance</p>
            <h2 className="text-3xl font-black mt-1 text-emerald-600">{verifiedCandidates}</h2>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-6">
            <Clock className="w-6 h-6 mb-2 text-orange-600" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending Review</p>
            <h2 className="text-3xl font-black mt-1 text-orange-600">{pendingCandidates}</h2>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-6">
            <FileCheck className="w-6 h-6 mb-2 text-purple-600" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completion Rate</p>
            <Progress className="h-2 mt-2" value={totalCandidates === 0 ? 0 : (verifiedCandidates / totalCandidates) * 100} />
            <p className="mt-2 text-xs font-black text-purple-600">
              {Math.round(totalCandidates === 0 ? 0 : (verifiedCandidates / totalCandidates) * 100)}% Complete
            </p>
          </CardContent>
        </Card>
      </div>

      {/* REQUISITION POOL GRID */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="bg-slate-50 border-b pb-4">
          <CardTitle className="text-lg text-slate-800">Candidate Tracking Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              className="pl-10 h-10 bg-slate-50"
              placeholder="Filter by candidate tracking metadata..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70">
                <TableHead className="font-bold">Applicant Identity</TableHead>
                <TableHead className="font-bold">Position</TableHead>
                <TableHead className="font-bold">Email Channel</TableHead>
                <TableHead className="font-bold">Verification Stage</TableHead>
                <TableHead className="font-bold text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center p-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600"/></TableCell></TableRow>
              ) : filtered.map((candidate) => (
                <TableRow key={candidate.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="font-bold text-slate-800">{candidate.name}</TableCell>
                  <TableCell className="text-xs text-slate-600">{candidate.job_title || "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">{candidate.email}</TableCell>
                  <TableCell>
                    <Badge variant={candidate.verification_status === "verified" ? "default" : "secondary"} className="font-bold uppercase tracking-wider text-[10px]">
                      {candidate.verification_status || "pending"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      onClick={() => {
                        setDocuments([]);
                        fetchCandidateDocuments(candidate);
                      }}
                    >
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center p-12 text-slate-400 font-medium">
                    No candidates with accepted offers ready for onboarding.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* CANDIDATE VERIFICATION DRAWER LAYOUT */}
      <Sheet open={!!selectedCandidate} onOpenChange={() => { setSelectedCandidate(null); setDocuments([]); }}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto custom-scrollbar flex flex-col space-y-6">
          <SheetHeader className="border-b pb-2">
            <SheetTitle className="text-xl font-black text-slate-900">
              Candidate Review & Workspace Assignment
            </SheetTitle>
          </SheetHeader>

          {selectedCandidate && (
            <div className="space-y-6 flex-1">
              <Card className="border-slate-200 bg-slate-50/50 shadow-sm">
                <CardContent className="p-4 space-y-1 text-sm text-slate-700">
                  <p><strong>Name:</strong> {selectedCandidate.name}</p>
                  <p><strong>Email:</strong> {selectedCandidate.email}</p>
                  <p>
                    <strong>Current Verification:</strong>{" "}
                    <span className="capitalize font-bold text-indigo-600">{selectedCandidate.verification_status || "pending"}</span>
                  </p>
                </CardContent>
              </Card>

              {/* Uploaded Documents List */}
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Uploaded Documents</h3>
                {documents.length > 0 ? (
                  documents.map((doc) => (
                    <Card key={doc.id} className="mb-3 border-slate-200 shadow-sm">
                      <CardContent className="p-4 flex flex-col justify-between sm:flex-row sm:items-center gap-4">
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-800">{doc.document_type}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Status:</span>
                            <Badge 
                              variant={doc.status === 'Verified' ? 'default' : doc.status === 'Rejected' ? 'destructive' : 'secondary'}
                              className="text-[10px] py-0 px-2 font-bold uppercase tracking-wide"
                            >
                              {doc.status || 'Submitted'}
                            </Badge>
                          </div>
                          {doc.remarks && <p className="text-[11px] italic text-slate-500 max-w-sm">Note: {doc.remarks}</p>}
                        </div>

                        <div className="flex sm:flex-col gap-2 shrink-0">
                          <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                            <a href={doc.file_url} target="_blank" rel="noreferrer">View File</a>
                          </Button>
                          <div className="flex gap-1">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              disabled={verifyingDocId === doc.id}
                              className="h-8 px-2 text-emerald-600 hover:bg-emerald-50 border-emerald-200"
                              onClick={() => handleVerifyDocumentStatus(doc.id, 'Verified')}
                            >
                              <Check className="w-3.5 h-3.5"/>
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              disabled={verifyingDocId === doc.id}
                              className="h-8 px-2 text-rose-600 hover:bg-rose-50 border-rose-200"
                              onClick={() => handleVerifyDocumentStatus(doc.id, 'Rejected')}
                            >
                              <AlertTriangle className="w-3.5 h-3.5"/>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <p className="text-red-500 text-sm bg-red-50 border border-red-100 rounded-lg p-3">
                    No documents found for this candidate.
                  </p>
                )}
              </div>

              {/* MNC METRICS CONFIGURATION STRUCTURE PARAMETERS MODULE */}
              <div className="space-y-4 border-t border-slate-200 pt-4">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">FWC Operational Parameters Setup</h3>

                {/* 1. Assign Department Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                    <Building className="w-3.5 h-3.5 text-slate-400"/> Assign Target Department
                  </label>
                  <select 
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700 outline-none"
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                  >
                    <option value="">Select Department...</option>
                    <option value="Engineering">Engineering / Technology</option>
                    <option value="Human Resources">Human Resources</option>
                    <option value="Product Management">Product Management</option>
                    <option value="Finance & Accounts">Finance & Accounts</option>
                  </select>
                </div>

                {/* 2. Assign Direct Report Supervisor Manager Line (Team Lead Link) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                    <UserCircle className="w-3.5 h-3.5 text-slate-400"/> Direct Reporting Manager (TL)
                  </label>
                  <select 
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700 outline-none"
                    value={selectedTeamLead}
                    onChange={(e) => setSelectedTeamLead(e.target.value)}
                  >
                    <option value="">Select reporting line supervisor...</option>
                    {teamLeads.map((tl) => (
                      <option key={tl.id} value={tl.id}>{tl.name} ({tl.department || 'General Head'})</option>
                    ))}
                  </select>
                </div>

                {/* 3. Assign Remuneration Gross Volume Package Scale */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-slate-400"/> Monthly Gross Salary Allocation (INR)
                  </label>
                  <Input 
                    type="number"
                    placeholder="E.g. 75000"
                    value={assignedPayroll}
                    onChange={(e) => setAssignedPayroll(e.target.value)}
                    className="h-10 text-sm bg-white"
                  />
                </div>

                {/* 4. Joining Date */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400"/> Expected Joining Date
                  </label>
                  <Input 
                    type="date"
                    value={joiningDate}
                    onChange={(e) => setJoiningDate(e.target.value)}
                    className="h-10 text-sm bg-white"
                  />
                </div>
              </div>

              {/* Execution Trigger Array */}
              <div className="pt-4 border-t">
                <Button 
                  onClick={handleOnboardCandidate}
                  disabled={processingOnboard}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 rounded-xl text-sm flex items-center justify-center gap-2"
                >
                  {processingOnboard ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <UserCheck className="w-4 h-4 mr-2"/>}
                  Hire & Onboard Candidate
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}