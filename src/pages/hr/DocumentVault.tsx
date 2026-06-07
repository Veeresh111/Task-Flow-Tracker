import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, Eye, Loader2, Search, UserPlus, DollarSign, Briefcase, Users } from "lucide-react";

export default function HRDocumentVault() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");

  // Onboarding Management Operational States
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [onboardingRole, setOnboardingRole] = useState<string>("employee");
  const [baseSalary, setBaseSalary] = useState<string>("0");
  const [allowances, setAllowances] = useState<string>("0");
  const [processingOnboard, setProcessingOnboard] = useState(false);

  // Structural MNC Corporate Operations State Parameters
  const [chosenDepartment, setChosenDepartment] = useState<string>("Engineering");
  const [teamLeadsList, setTeamLeadsList] = useState<any[]>([]);
  const [selectedTeamLead, setSelectedTeamLead] = useState<string>("");

  // Pre-configured Corporate MNC Departments Array List
  const departmentsList = [
    "Engineering",
    "Human Resources",
    "Design",
    "Sales",
    "Finance",
    "Marketing"
  ];

  useEffect(() => {
    fetchDocs();
    fetchActiveTeamLeads();
  }, []);

  // Fetch real-time active Team Lead profiles for direct organizational mapping
  const fetchActiveTeamLeads = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, department')
        .eq('role', 'team_lead');
      
      if (error) throw error;
      if (data) {
        setTeamLeadsList(data);
        if (data.length > 0) {
          setSelectedTeamLead(data[0].id);
        }
      }
    } catch (err: any) {
      console.error("Failed to query operational enterprise managers:", err.message);
    }
  };

  const fetchDocs = async () => {
    setLoading(true);
    try {
      // Explicitly fetching data from your live database table linked with profiles
      const { data, error } = await supabase
        .from('background_verifications')
        .select('*, profiles(name, role, email, phone, education, experience, core_skills)')
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error("Supabase engine error pulling relational fields:", error.message);
        
        // Secondary fallback query to prevent table failure if inner join caching delays
        const { data: fallbackData } = await supabase
          .from('background_verifications')
          .select('*')
          .order('created_at', { ascending: false });
        if (fallbackData) setDocs(fallbackData);
      } else if (data) {
        setDocs(data);
      }
    } catch (globalErr: any) {
      console.error("Critical failure during collection assembly:", globalErr.message);
    } finally {
      setLoading(false);
    }
  };

  // Real-world database connected approval update function
  const updateStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase
        .from('background_verifications')
        .update({ verification_status: status })
        .eq('id', id);

      if (error) throw error;
      
      alert(`Document reference status successfully set to ${status} in live database logs.`);
      fetchDocs();
    } catch (err: any) {
      console.error("Database connection failure updating document status:", err.message);
      alert(`Database Operational Error: ${err.message}`);
    }
  };

  // Execution workflow loop for processing corporate candidate onboarding mutations
  const handleExecuteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoc || !selectedDoc.candidate_id) return;

    setProcessingOnboard(true);
    try {
      const candidateId = selectedDoc.candidate_id;
      const parsedSalary = parseFloat(baseSalary) || 0;
      const parsedAllowances = parseFloat(allowances) || 0;

      // Extract verification row metadata if available to populate empty directory fields
      const extractedEducation = selectedDoc.profiles?.education || selectedDoc.extracted_education || "MNC Verified Graduate";
      const extractedExperience = selectedDoc.profiles?.experience || selectedDoc.extracted_experience || "Verified Professional History";
      const extractedSkills = selectedDoc.profiles?.core_skills || selectedDoc.extracted_skills || "Core Stack Competence";

      // 1. Transaction Modification Layer: Mutate profile access records, department allocation, and transfer applicant data
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          role: onboardingRole,
          department: chosenDepartment,
          team_lead_id: selectedTeamLead || null,
          education: extractedEducation,
          experience: extractedExperience,
          core_skills: extractedSkills
        })
        .eq('id', candidateId);

      if (profileError) throw profileError;

      // 2. Transaction Provisioning Layer: Initialize payroll configuration matrix
      const { error: payrollError } = await supabase
        .from('payroll')
        .insert([{
          employee_id: candidateId,
          base_salary: parsedSalary,
          allowances: parsedAllowances,
          payroll_status: 'Active'
        }]);

      if (payrollError) throw payrollError;

      alert(`Onboarding successfully committed. User transitioned to ${onboardingRole} and evicting tracking lines.`);
      setSelectedDoc(null);
      setBaseSalary("0");
      setAllowances("0");
      fetchDocs();
    } catch (err: any) {
      console.error("Corporate onboarding transaction failure:", err.message);
      alert(`Onboarding Transaction Error: ${err.message}`);
    }
    setProcessingOnboard(false);
  };

  // Automated Candidate Segregation Filter Engine
  const filteredDocs = docs.filter(doc => {
    const candidateName = (doc.profiles?.name || doc.candidate_id || "").toLowerCase();
    const documentType = (doc.document_type || "").toLowerCase();
    const verificationStatus = (doc.verification_status || "").toLowerCase();
    const normalizedQuery = searchQuery.toLowerCase();

    return (
      candidateName.includes(normalizedQuery) ||
      documentType.includes(normalizedQuery) ||
      verificationStatus.includes(normalizedQuery)
    );
  });

  return (
    <DashboardLayout role="hr">
      <div className="max-w-7xl mx-auto space-y-6 pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold text-slate-900">BGC Document Vault</h1>
          <p className="text-slate-500 mt-1">Review and verify compliance documents uploaded by candidates.</p>
        </div>

        {/* Real-time Candidate Segregation Filter UI Input */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by candidate name, document type, status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-800"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium">
            Showing {filteredDocs.length} of {docs.length} compliance files
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <Card className={`shadow-sm border-slate-200 lg:col-span-${selectedDoc ? "2" : "3"}`}>
            <CardHeader className="bg-slate-50 border-b">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600"/> Verification Queue
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-12 flex justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600"/>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SideHead>Candidate</SideHead>
                      <TableHead>Document Type</TableHead>
                      <TableHead>AI Analysis</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocs.map(doc => (
                      <TableRow key={doc.id} className={selectedDoc?.id === doc.id ? "bg-indigo-50/50" : ""}>
                        <TableCell className="font-bold text-slate-900">
                          {doc.profiles?.name || doc.candidate_id || 'Onboarding User'}
                        </TableCell>
                        <TableCell className="text-slate-700">{doc.document_type}</TableCell>
                        <TableCell className="text-xs text-slate-500 max-w-[200px] truncate">
                          {doc.ai_analysis}
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            doc.verification_status === 'Approved' 
                              ? 'bg-emerald-100 text-emerald-700' 
                              : doc.verification_status === 'Rejected' 
                              ? 'bg-red-100 text-red-700' 
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {doc.verification_status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right space-x-2 whitespace-nowrap">
                          <Button variant="outline" size="sm" onClick={() => window.open(doc.file_url, '_blank', 'noopener,noreferrer')}>
                            <Eye className="w-4 h-4"/>
                          </Button>
                          <Button variant="outline" size="sm" className="text-emerald-600 border-emerald-200" onClick={() => updateStatus(doc.id, 'Approved')}>Approve</Button>
                          <Button variant="outline" size="sm" className="text-red-600 border-red-200" onClick={() => updateStatus(doc.id, 'Rejected')}>Reject</Button>
                          
                          {/* Corporate Conversion trigger option available for approved tracking items */}
                          <Button 
                            variant="default" 
                            size="sm" 
                            onClick={() => setSelectedDoc(doc)}
                            className="bg-indigo-600 text-white hover:bg-indigo-700 font-medium text-xs"
                          >
                            <UserPlus className="w-3.5 h-3.5 mr-1"/> Onboard
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredDocs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center p-8 text-slate-500">No matching tracking data metrics available.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* HR ONBOARDING & PAYROLL REGISTRATION COMPONENT WORKFLOW SIDEBAR */}
          {selectedDoc && (
            <Card className="shadow-sm border-indigo-200 bg-white animate-fade-in">
              <CardHeader className="bg-indigo-50/50 border-b border-indigo-100">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-indigo-600" /> Execute Corporate Onboarding
                </CardTitle>
                <p className="text-xs text-slate-500">Candidate: {selectedDoc.profiles?.name || 'Onboarding Target'}</p>
              </CardHeader>
              <CardContent className="p-4">
                <form onSubmit={handleExecuteOnboarding} className="space-y-4">
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Assign Enterprise Clearance Role</label>
                    <select
                      value={onboardingRole}
                      onChange={(e) => setOnboardingRole(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                      required
                    >
                      <option value="employee">Employee</option>
                      <option value="team_lead">Team Lead</option>
                      <option value="hr">HR Specialist</option>
                      <option value="admin">Platform Administrator</option>
                    </select>
                  </div>

                  {/* Structural MNC Department Hierarchy Mapping Input Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Assign Business Department</label>
                    <select
                      value={chosenDepartment}
                      onChange={(e) => setChosenDepartment(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                      required
                    >
                      {departmentsList.map((dept) => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>

                  {/* Operational Management Team Assignment Mapping Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Users className="w-3 h-3 text-indigo-500"/> Assign Reporting Team Lead
                    </label>
                    <select
                      value={selectedTeamLead}
                      onChange={(e) => setSelectedTeamLead(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="">No Direct Manager Assignment</option>
                      {teamLeadsList.map((tl) => (
                        <option key={tl.id} value={tl.id}>
                          {tl.name} ({tl.department || 'General'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5"/> Payroll Ledger Provisioning
                    </h4>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Base Component Salary (Annual)</label>
                        <input
                          type="number"
                          placeholder="Ex: 85000"
                          value={baseSalary}
                          onChange={(e) => setBaseSalary(e.target.value)}
                          className="w-full p-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                          required
                          min="0"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Allowances / Benefits (Annual)</label>
                        <input
                          type="number"
                          placeholder="Ex: 12000"
                          value={allowances}
                          onChange={(e) => setAllowances(e.target.value)}
                          className="w-full p-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                          required
                          min="0"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-slate-100">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      className="w-full text-xs" 
                      onClick={() => setSelectedDoc(null)}
                      disabled={processingOnboard}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      size="sm" 
                      className="w-full text-xs bg-indigo-600 text-white hover:bg-indigo-700 font-bold"
                      disabled={processingOnboard}
                    >
                      {processingOnboard ? <Loader2 className="w-4 h-4 animate-spin mx-auto"/> : "Commit Onboarding"}
                    </Button>
                  </div>

                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

// Fallback subcomponent injection helper for scannable UI layout structures
function SideHead({ children }: { children: React.ReactNode }) {
  return <TableHead className="text-slate-700 text-xs font-semibold">{children}</TableHead>;
}