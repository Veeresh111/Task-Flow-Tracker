import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function OnboardingCenter() {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [search, setSearch] = useState("");

  // Factual requested documents array state framework
  const [documents, setDocuments] = useState<any[]>([]);

  // Corporate assignment infrastructure input variables
  const [teamLeads, setTeamLeads] = useState<any[]>([]);
  const [selectedTeamLead, setSelectedTeamLead] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [assignedPayroll, setAssignedPayroll] = useState("");
  const [processingOnboard, setProcessingOnboard] = useState(false);
  const [loading, setLoading] = useState(true);

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

  // Exact corporate candidate pool filtering engine
  const fetchCandidates = async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "candidate");

      setCandidates(data || []);
      setFiltered(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchActiveTeamLeads = async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, department")
        .eq("role", "team_lead");
      setTeamLeads(data || []);
    } catch (err) {
      console.error("Failed to query active team leads:", err);
    }
  };

  // === EXACT SPECIFIED CODE UNIT: REVIEW BUTTON ACTION LOGIC INTERCEPTOR ===
  const fetchCandidateDocuments = async (candidate: any) => {
    try {
      const { data, error } = await supabase
        .from("background_verifications")
        .select("*")
        .eq("candidate_id", candidate.id)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;

      console.log("Candidate:", candidate);
      console.log("Documents:", data);

      setDocuments(data || []);
      setSelectedCandidate(candidate);
    } catch (error) {
      console.error(error);
    }
  };

  // === STRATEGIC ENTERPRISE CONVERSION PIPELINE FOR MNC ARCHITECTURES ===
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
      // Step A: Trigger transactional role transformation profile mutate step
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          role: "employee",
          department: selectedDepartment,
          team_lead_id: selectedTeamLead,
          payroll_ctc: Number(assignedPayroll),
          verification_status: "verified"
        })
        .eq("id", selectedCandidate.id);

      if (profileError) throw profileError;

      // Step B: Record auditable record track parameters directly into candidate_onboarding
      const { error: onboardingRecordError } = await supabase
        .from("candidate_onboarding")
        .insert({
          candidate_id: selectedCandidate.id,
          status: "completed",
          department: selectedDepartment
        });

      if (onboardingRecordError) throw onboardingRecordError;

      toast({ 
        title: "Hiring Matrix Concluded", 
        description: `${selectedCandidate.name} has been successfully verified, onboarded, and transferred to Employee structures.` 
      });

      setSelectedCandidate(null);
      setSelectedDepartment("");
      setSelectedTeamLead("");
      setAssignedPayroll("");
      
      // Step C: Hot-reload active grids. Candidate will automatically disappear because of the row role transition query bounds.
      await fetchCandidates();
    } catch (err: any) {
      console.error("Critical onboarding chain failure:", err);
      toast({ title: "Onboarding Aborted", description: err.message || "Failed to finalize database conversion.", variant: "destructive" });
    }
    setProcessingOnboard(false);
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
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Candidates</p>
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
                <TableHead className="font-bold">Email Channel</TableHead>
                <TableHead className="font-bold">Verification Stage</TableHead>
                <TableHead className="font-bold text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center p-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600"/></TableCell></TableRow>
              ) : filtered.map((candidate) => (
                <TableRow key={candidate.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="font-bold text-slate-800">{candidate.name}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">{candidate.email}</TableCell>
                  <TableCell>
                    <Badge variant={candidate.verification_status === "verified" ? "default" : "secondary"} className="font-bold uppercase tracking-wider text-[10px]">
                      {candidate.verification_status || "pending"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {/* === EXACT MOUNTED REQUESTED BUTTON HANDLER MATRIX === */}
                    <Button
                      size="sm"
                      onClick={() => fetchCandidateDocuments(candidate)}
                    >
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center p-12 text-slate-400 font-medium">
                    No matching candidate profiles discovered in system nodes.
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

              {/* === EXACT SPECIFIED HOOK DISPLAY DATA RENDERING MATRIX BLOCK === */}
              {documents.length > 0 ? (
                documents.map((doc) => (
                  <Card key={doc.id} className="mb-3">
                    <CardContent className="p-4">
                      <p className="font-semibold">{doc.document_type}</p>

                      <p className="text-sm text-slate-500">
                        Status: {doc.status}
                      </p>

                      <Button
                        asChild
                        size="sm"
                        className="mt-2"
                      >
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View Document
                        </a>
                      </Button>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <p className="text-red-500">
                  No documents found.
                </p>
              )}

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
                    className="h-10 text-sm bg-white border-slate-200 font-medium text-slate-800"
                  />
                </div>
              </div>

              {/* Execution Trigger Array */}
              <div className="pt-4 border-t">
                <Button 
                  onClick={handleOnboardCandidate}
                  disabled={processingOnboard || documents.length === 0}
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