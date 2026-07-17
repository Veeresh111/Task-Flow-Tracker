import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet, Loader2, Search, Calendar, CheckCircle2, AlertCircle,
  X, ShieldCheck, FileText, Download, ArrowRight
} from "lucide-react";
import { formatINR } from "@/lib/payroll";

type CycleStatus = 'draft' | 'generated' | 'verified' | 'finance_approved' | 'hr_approved' | 'released';
type TabKey = 'active' | 'history';

interface PayrollCycle {
  id: string;
  month: number;
  year: number;
  status: CycleStatus;
  generated_by: string | null;
  generated_at: string;
  verified_by: string | null;
  verified_at: string | null;
  finance_approved_by: string | null;
  finance_approved_at: string | null;
  hr_approved_by: string | null;
  hr_approved_at: string | null;
  released_by: string | null;
  released_at: string | null;
  total_employees: number;
  total_gross: number;
  total_net: number;
  total_pf: number;
  total_tds: number;
}

interface Payslip {
  id: string;
  employee_id: string;
  cycle_id: string;
  annual_ctc: number;
  monthly_ctc: number;
  earnings: Record<string, number>;
  deductions: Record<string, number>;
  gross: number;
  net: number;
  pf_amount: number;
  pt_amount: number;
  tds_amount: number;
  lop_days: number;
  overtime_hours: number;
  bonus_amount: number;
  incentive_amount: number;
  version: number;
  status: string;
  created_at: string;
  employee_name?: string;
  employee_email?: string;
  employee_department?: string;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const STATUS_ORDER: CycleStatus[] = ['draft','generated','verified','finance_approved','hr_approved','released'];

const STATUS_BADGE: Record<CycleStatus, { label: string; class: string }> = {
  draft: { label: 'Draft', class: 'bg-slate-100 text-slate-600' },
  generated: { label: 'Generated', class: 'bg-blue-100 text-blue-700' },
  verified: { label: 'Verified', class: 'bg-indigo-100 text-indigo-700' },
  finance_approved: { label: 'Finance Approved', class: 'bg-purple-100 text-purple-700' },
  hr_approved: { label: 'HR Approved', class: 'bg-emerald-100 text-emerald-700' },
  released: { label: 'Released', class: 'bg-green-100 text-green-700' },
};

const STATUS_ACTIONS: Record<CycleStatus, { label: string; nextStatus: CycleStatus; requiredRole: string }[]> = {
  draft: [],
  generated: [{ label: 'Verify', nextStatus: 'verified', requiredRole: 'hr' }],
  verified: [{ label: 'Finance Approve', nextStatus: 'finance_approved', requiredRole: 'finance' }],
  finance_approved: [{ label: 'HR Approve', nextStatus: 'hr_approved', requiredRole: 'hr' }],
  hr_approved: [{ label: 'Release', nextStatus: 'released', requiredRole: 'hr' }],
  released: [],
};

export default function HRPayroll() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>('active');
  const [cycles, setCycles] = useState<PayrollCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<PayrollCycle | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loadingCycle, setLoadingCycle] = useState(true);
  const [loadingPayslips, setLoadingPayslips] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [dbReady, setDbReady] = useState<boolean | null>(null);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const fetchUser = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  }, []);

  const checkDbReady = useCallback(async () => {
    try {
      const { error } = await supabase.rpc('preview_payslip_breakdown', { p_annual_ctc: 1200000 });
      setDbReady(!error || !error.message?.includes('PGRST202'));
    } catch {
      setDbReady(false);
    }
  }, []);

  const fetchCycles = useCallback(async () => {
    setLoadingCycle(true);
    try {
      const { data, error } = await supabase
        .from('payroll_cycles')
        .select('*')
        .order('year', { ascending: false })
        .order('month', { ascending: false });
      if (error) throw error;
      setCycles(data || []);
      if (!selectedCycle && data && data.length > 0) {
        setSelectedCycle(data[0]);
      }
    } catch (e: any) {
      if (e.code === 'PGRST202' || e.code === '42P01') {
        setDbReady(false);
      }
    } finally {
      setLoadingCycle(false);
    }
  }, [selectedCycle]);

  const fetchPayslips = useCallback(async (cycleId: string) => {
    setLoadingPayslips(true);
    try {
      const { data, error } = await supabase
        .from('payslips')
        .select('*')
        .eq('cycle_id', cycleId)
        .order('created_at');
      if (error) throw error;

      // Use snapped employee data from payslip row; fall back to profiles join
      // if snapshot columns are empty (pre-migration rows).
      const enriched = await Promise.all((data || []).map(async (p: any) => {
        if (!p.employee_name && p.employee_id) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('name, email, department')
            .eq('id', p.employee_id)
            .single();
          return { ...p, employee_name: prof?.name, employee_email: prof?.email, employee_department: prof?.department };
        }
        return p;
      }));
      setPayslips(enriched);
    } catch (e: any) {
      if (e.code !== 'PGRST202' && e.code !== '42P01') {
        toast({ title: 'Failed to load payslips', variant: 'destructive' });
      }
      setPayslips([]);
    } finally {
      setLoadingPayslips(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUser();
    checkDbReady();
  }, [fetchUser, checkDbReady]);

  useEffect(() => {
    if (dbReady === true) {
      fetchCycles();
    } else if (dbReady === null) {
    } else {
      setLoadingCycle(false);
    }
  }, [dbReady, fetchCycles]);

  useEffect(() => {
    if (selectedCycle) {
      fetchPayslips(selectedCycle.id);
    }
  }, [selectedCycle, fetchPayslips]);

  const handleGenerate = async () => {
    if (!currentUserId) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.rpc('process_monthly_payroll', {
        p_month: currentMonth,
        p_year: currentYear,
      });
      if (error) throw error;
      if (data?.success) {
        toast({
          title: 'Payroll Generated',
          description: `${data.employees_generated} payslips created for ${MONTHS[currentMonth-1]} ${currentYear}. Evidence: ${data.evidence_code}`,
        });
        await fetchCycles();
      } else {
        toast({
          title: 'Generation Failed',
          description: data?.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({
        title: 'Generation Error',
        description: e.message || 'Could not generate payroll',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleTransitionStatus = async (nextStatus: CycleStatus) => {
    if (!selectedCycle || !currentUserId) return;
    setTransitioning(true);
    try {
      const { data, error } = await supabase.rpc('transition_payroll_status', {
        p_cycle_id: selectedCycle.id,
        p_next_status: nextStatus,
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Transition rejected');
      }

      toast({
        title: 'Status Updated',
        description: `Cycle moved to ${nextStatus.replace('_', ' ')}. Evidence: ${data.evidence_code}`,
      });

      setSelectedCycle(prev => prev ? { ...prev, status: nextStatus } as PayrollCycle : prev);
      setCycles(prev => prev.map(c => c.id === selectedCycle.id ? { ...c, status: nextStatus } as PayrollCycle : c));
    } catch (e: any) {
      toast({
        title: 'Status Update Failed',
        description: e.message || 'Could not update cycle status',
        variant: 'destructive',
      });
    } finally {
      setTransitioning(false);
    }
  };

  const currentCycleIndex = STATUS_ORDER.indexOf(selectedCycle?.status || 'draft');
  const availableActions = selectedCycle ? STATUS_ACTIONS[selectedCycle.status] || [] : [];

  if (dbReady === false) {
    return (
      <DashboardLayout role="hr">
        <div className="max-w-3xl mx-auto p-12 text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto" />
          <h2 className="text-2xl font-bold text-slate-800">Payroll Backend Not Configured</h2>
          <p className="text-slate-500">
            Apply migration <code className="bg-slate-100 px-2 py-0.5 rounded text-sm">20260630000002_payroll_tables.sql</code> to enable payroll management.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  if (dbReady === null || loadingCycle) {
    return (
      <DashboardLayout role="hr">
        <div className="p-20 flex justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-emerald-600" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="hr">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="text-emerald-600" /> Payroll Management
            </h1>
            <p className="text-slate-500 mt-1">
              Authoritative payroll generation, multi-step approval, and payslip management.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={activeTab === 'active' ? 'default' : 'outline'}
              onClick={() => setActiveTab('active')}
              className={activeTab === 'active' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
            >
              Active Cycle
            </Button>
            <Button
              variant={activeTab === 'history' ? 'default' : 'outline'}
              onClick={() => setActiveTab('history')}
              className={activeTab === 'history' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
            >
              History
            </Button>
          </div>
        </div>

        {activeTab === 'active' ? (
          <div className="space-y-6">
            {!selectedCycle || selectedCycle.month !== currentMonth || selectedCycle.year !== currentYear ? (
              <Card className="border-dashed border-2 border-emerald-200 bg-emerald-50/30">
                <CardContent className="p-8 text-center space-y-4">
                  <h2 className="text-xl font-bold text-slate-700">
                    {MONTHS[currentMonth-1]} {currentYear} — No Payroll Cycle
                  </h2>
                  <p className="text-slate-500 text-sm max-w-md mx-auto">
                    Generate payroll for the current period. The RPC will calculate all payslips
                    from employee CTC data using the standard salary structure.
                  </p>
                  <Button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8"
                  >
                    {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Generate Payroll for {MONTHS[currentMonth-1]} {currentYear}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                      <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-emerald-600" />
                          {MONTHS[selectedCycle.month-1]} {selectedCycle.year}
                        </h2>
                        <Badge className={`mt-1 ${STATUS_BADGE[selectedCycle.status].class}`}>
                          {STATUS_BADGE[selectedCycle.status].label}
                        </Badge>
                      </div>
                      {generating && (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Loader2 className="w-4 h-4 animate-spin" /> Generating...
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-xs text-slate-500 font-bold uppercase">Employees</p>
                        <p className="text-2xl font-black text-slate-800">{selectedCycle.total_employees}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-xs text-slate-500 font-bold uppercase">Total Gross</p>
                        <p className="text-xl font-black text-slate-800">{formatINR(selectedCycle.total_gross)}</p>
                      </div>
                      <div className="bg-emerald-50 rounded-lg p-3">
                        <p className="text-xs text-slate-500 font-bold uppercase">Total Net</p>
                        <p className="text-xl font-black text-emerald-600">{formatINR(selectedCycle.total_net)}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-xs text-slate-500 font-bold uppercase">Total TDS</p>
                        <p className="text-xl font-black text-red-600">{formatINR(selectedCycle.total_tds)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      {STATUS_ORDER.map((s, i) => (
                        <div key={s} className="flex items-center gap-1">
                          <div className={`w-3 h-3 rounded-full ${i <= currentCycleIndex ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                          <span className={`text-[11px] font-medium ${i <= currentCycleIndex ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {STATUS_BADGE[s].label}
                          </span>
                          {i < STATUS_ORDER.length - 1 && (
                            <ArrowRight className={`w-3 h-3 ${i < currentCycleIndex ? 'text-emerald-400' : 'text-slate-200'}`} />
                          )}
                        </div>
                      ))}
                    </div>

                    {availableActions.length > 0 && (
                      <div className="flex gap-2 mt-4 pt-4 border-t">
                        {availableActions.map(action => (
                          <Button
                            key={action.nextStatus}
                            onClick={() => handleTransitionStatus(action.nextStatus)}
                            disabled={transitioning}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                          >
                            {transitioning ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="bg-slate-50 border-b pb-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <CardTitle className="text-lg text-slate-800">Employee Payslips</CardTitle>
                      <Input
                        placeholder="Search employee..."
                        className="w-full sm:w-56 h-9 text-sm"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {loadingPayslips ? (
                      <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
                    ) : payslips.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-sm">No payslips found for this cycle.</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="font-bold">Employee</TableHead>
                            <TableHead className="font-bold text-right">Gross</TableHead>
                            <TableHead className="font-bold text-right">PF</TableHead>
                            <TableHead className="font-bold text-right">TDS</TableHead>
                            <TableHead className="font-bold text-right">Net</TableHead>
                            <TableHead className="font-bold text-center">Version</TableHead>
                            <TableHead className="font-bold text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payslips
                            .filter(p => !searchQuery || (p.employee_name || '').toLowerCase().includes(searchQuery.toLowerCase()))
                            .map((p) => (
                              <TableRow key={p.id} className="hover:bg-slate-50">
                                <TableCell>
                                  <p className="font-semibold text-slate-900">{p.employee_name || 'Unknown'}</p>
                                  <p className="text-[10px] text-slate-400">{p.employee_department || ''}</p>
                                </TableCell>
                                <TableCell className="text-right font-medium">{formatINR(p.gross)}</TableCell>
                                <TableCell className="text-right text-slate-600">{formatINR(p.pf_amount)}</TableCell>
                                <TableCell className="text-right text-red-600">{formatINR(p.tds_amount)}</TableCell>
                                <TableCell className="text-right font-bold text-emerald-600">{formatINR(p.net)}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="outline" className="text-[10px]">{p.version}</Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSelectedPayslip(p)}
                                    className="h-8 text-[11px] font-bold"
                                  >
                                    <FileText className="w-3 h-3 mr-1" /> View
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {cycles.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p>No payroll cycles found. Generate your first cycle to see history here.</p>
              </div>
            ) : (
              <Card className="shadow-sm">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-bold">Period</TableHead>
                        <TableHead className="font-bold">Status</TableHead>
                        <TableHead className="font-bold text-right">Employees</TableHead>
                        <TableHead className="font-bold text-right">Gross</TableHead>
                        <TableHead className="font-bold text-right">Net</TableHead>
                        <TableHead className="font-bold text-right">Generated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cycles.map((cycle) => (
                        <TableRow
                          key={cycle.id}
                          className={`cursor-pointer ${selectedCycle?.id === cycle.id ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                          onClick={() => setSelectedCycle(cycle)}
                        >
                          <TableCell className="font-bold">
                            {MONTHS[cycle.month-1]} {cycle.year}
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_BADGE[cycle.status].class}>
                              {STATUS_BADGE[cycle.status].label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{cycle.total_employees}</TableCell>
                          <TableCell className="text-right font-medium">{formatINR(cycle.total_gross)}</TableCell>
                          <TableCell className="text-right font-bold text-emerald-600">{formatINR(cycle.total_net)}</TableCell>
                          <TableCell className="text-right text-xs text-slate-500">
                            {new Date(cycle.generated_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {selectedPayslip && (
          <div className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white shadow-2xl rounded-2xl border-0 overflow-hidden flex flex-col max-h-[95vh]">
              <div className="bg-slate-900 p-4 flex justify-between items-center text-white shrink-0">
                <h3 className="font-black text-xs uppercase tracking-wider flex items-center gap-1.5 text-indigo-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> Payslip — {MONTHS[selectedCycle?.month ? selectedCycle.month - 1 : 0]} {selectedCycle?.year}
                </h3>
                <button onClick={() => setSelectedPayslip(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                <div className="grid grid-cols-2 gap-4 bg-slate-50 border p-4 rounded-xl text-xs">
                  <div>
                    <p className="text-slate-400 font-bold text-[9px] uppercase tracking-wider mb-1">Employee</p>
                    <p className="font-bold text-slate-900">{selectedPayslip.employee_name || 'Unknown'}</p>
                    <p className="text-slate-500 font-mono text-[11px]">{selectedPayslip.employee_email}</p>
                    <p className="text-slate-600">{selectedPayslip.employee_department}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-400 font-bold text-[9px] uppercase tracking-wider mb-1">Annual CTC</p>
                    <p className="font-bold text-lg text-slate-900">{formatINR(selectedPayslip.annual_ctc)}</p>
                    <p className="text-slate-500">Version {selectedPayslip.version}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b pb-1">
                      Earnings
                    </h4>
                    <div className="space-y-1 text-xs">
                      {Object.entries(selectedPayslip.earnings).map(([key, val]) => (
                        <div key={key} className="flex justify-between py-1">
                          <span className="text-slate-600 capitalize">{key}</span>
                          <span className="font-semibold">{formatINR(val)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between py-1.5 border-t font-bold text-slate-800">
                        <span>Gross</span>
                        <span>{formatINR(selectedPayslip.gross)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b pb-1">
                      Deductions
                    </h4>
                    <div className="space-y-1 text-xs">
                      {Object.entries(selectedPayslip.deductions).map(([key, val]) => (
                        <div key={key} className="flex justify-between py-1">
                          <span className="text-slate-600 uppercase">{key}</span>
                          <span className="font-semibold text-red-600">{formatINR(val)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between py-1.5 border-t font-bold text-slate-800">
                        <span>PF</span>
                        <span>{formatINR(selectedPayslip.pf_amount)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-t font-bold text-slate-800">
                        <span>PT</span>
                        <span>{formatINR(selectedPayslip.pt_amount)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-t">
                        <span className="text-slate-600">TDS</span>
                        <span className="font-semibold text-red-600">{formatINR(selectedPayslip.tds_amount)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-5 rounded-xl flex justify-between items-center">
                  <div>
                    <p className="text-xs text-indigo-300 uppercase tracking-widest font-black">Net Pay</p>
                    <p className="text-[10px] text-slate-400">After all statutory deductions</p>
                  </div>
                  <p className="text-3xl font-black text-emerald-400">{formatINR(selectedPayslip.net)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
