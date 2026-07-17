import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { formatINR } from "@/lib/payroll";
import { Loader2, Wallet, Download, TrendingUp, X, Calendar, ShieldCheck, FileText, Search } from "lucide-react";

interface Payslip {
  id: string;
  cycle_id: string;
  month: number;
  year: number;
  annual_ctc: number;
  monthly_ctc: number;
  earnings: Record<string, number>;
  deductions: Record<string, number>;
  gross: number;
  net: number;
  pf_amount: number;
  pt_amount: number;
  tds_amount: number;
  version: number;
  status: string;
  employee_name: string;
  employee_department: string;
  cycle_status: string;
}

interface SalaryRevision {
  id: string;
  old_ctc: number | null;
  new_ctc: number;
  effective_from: string;
  reason: string | null;
  created_at: string;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function EmployeePayroll() {
  const [loading, setLoading] = useState(true);
  const [dbReady, setDbReady] = useState<boolean | null>(null);
  const [annualCtc, setAnnualCtc] = useState(0);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [revisions, setRevisions] = useState<SalaryRevision[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const checkDb = useCallback(async () => {
    try {
      const { error } = await supabase.rpc('preview_payslip_breakdown', { p_annual_ctc: 1200000 });
      setDbReady(!error || !error.message?.includes('PGRST202'));
    } catch {
      setDbReady(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('payroll_ctc')
        .eq('id', user.id)
        .single();
      setAnnualCtc(Number(profile?.payroll_ctc) || 0);

      const { data: slips } = await supabase
        .from('payslips')
        .select('*, payroll_cycles!inner(month, year, status)')
        .eq('employee_id', user.id)
        .order('created_at', { ascending: false });
      if (slips) {
        setPayslips(slips.map((s: any) => ({
          ...s,
          month: s.payroll_cycles?.month,
          year: s.payroll_cycles?.year,
          cycle_status: s.payroll_cycles?.status,
        })));
      }

      const { data: revs } = await supabase
        .from('salary_revisions')
        .select('*')
        .eq('employee_id', user.id)
        .order('effective_from', { ascending: false });
      if (revs) setRevisions(revs);
    } catch (e: any) {
      if (e.code !== 'PGRST202' && e.code !== '42P01') {
        console.error(e);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkDb(); }, [checkDb]);
  useEffect(() => { if (dbReady === true) fetchData(); else if (dbReady === false) setLoading(false); }, [dbReady, fetchData]);

  const handleDownloadCsv = (p: Payslip) => {
    setDownloadingId(p.id);
    const rows = [
      ['Field', 'Amount (INR)'],
      ['Annual CTC', p.annual_ctc],
      ['Monthly CTC', p.monthly_ctc],
      [],
      ['Earnings'],
      ...Object.entries(p.earnings).map(([k, v]) => [k.toUpperCase(), v]),
      ['Gross', p.gross],
      [],
      ['Deductions'],
      ['PF', p.pf_amount],
      ['PT', p.pt_amount],
      ['TDS', p.tds_amount],
      ['Total Deductions', (p.pf_amount + p.pt_amount + p.tds_amount)],
      [],
      ['Net Pay', p.net],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Payslip_${MONTHS[p.month-1]}_${p.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setTimeout(() => setDownloadingId(null), 500);
  };

  const ytdGross = payslips.reduce((s, p) => s + p.gross, 0);
  const ytdPf = payslips.reduce((s, p) => s + p.pf_amount, 0);
  const ytdTds = payslips.reduce((s, p) => s + p.tds_amount, 0);
  const ytdNet = payslips.reduce((s, p) => s + p.net, 0);
  const currentPayslip = payslips.find(p => {
    const now = new Date();
    return p.month === now.getMonth() + 1 && p.year === now.getFullYear();
  });

  const filteredPayslips = payslips.filter(p =>
    !search || `${MONTHS[p.month-1]} ${p.year}`.toLowerCase().includes(search.toLowerCase())
  );

  if (dbReady === false) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto p-12 text-center space-y-4">
          <Loader2 className="w-16 h-16 text-amber-500 mx-auto" />
          <h2 className="text-2xl font-bold text-slate-800">Payroll Not Configured</h2>
          <p className="text-slate-500">Payroll backend is not yet available. Please check back later.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="text-emerald-600" /> My Payroll & Compensation
            </h1>
            <p className="text-slate-500 mt-1">Review payslips, track YTD earnings, and view salary history.</p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <Card key={i}><CardContent className="p-6"><div className="h-16 bg-slate-100 rounded animate-pulse" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <>
            {annualCtc > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-slate-800"><CardContent className="p-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Annual CTC</p>
                  <p className="text-xl font-black text-slate-800">{formatINR(annualCtc)}</p>
                </CardContent></Card>
                <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Current Month Net</p>
                  <p className="text-xl font-black text-emerald-600">
                    {currentPayslip ? formatINR(currentPayslip.net) : '—'}
                  </p>
                </CardContent></Card>
                <Card className="border-l-4 border-l-indigo-500"><CardContent className="p-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">YTD Gross</p>
                  <p className="text-xl font-black text-indigo-600">{formatINR(ytdGross)}</p>
                </CardContent></Card>
                <Card className="border-l-4 border-l-red-500"><CardContent className="p-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">YTD TDS</p>
                  <p className="text-xl font-black text-red-600">{formatINR(ytdTds)}</p>
                </CardContent></Card>
              </div>
            )}

            {currentPayslip && (
              <Card className="border-emerald-200 border-2 bg-emerald-50/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-emerald-800">
                    <Calendar className="w-4 h-4" /> Current Month — {MONTHS[currentPayslip.month-1]} {currentPayslip.year}
                    <Badge className="bg-emerald-100 text-emerald-700 ml-2">{currentPayslip.cycle_status}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><span className="text-slate-500 text-[10px] block">Gross</span><span className="font-bold">{formatINR(currentPayslip.gross)}</span></div>
                    <div><span className="text-slate-500 text-[10px] block">PF</span><span className="font-bold">{formatINR(currentPayslip.pf_amount)}</span></div>
                    <div><span className="text-slate-500 text-[10px] block">TDS</span><span className="font-bold text-red-600">{formatINR(currentPayslip.tds_amount)}</span></div>
                    <div><span className="text-slate-500 text-[10px] block">Net</span><span className="font-bold text-emerald-600">{formatINR(currentPayslip.net)}</span></div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSelectedPayslip(currentPayslip)} className="h-8 text-xs">
                      <FileText className="w-3 h-3 mr-1" /> View Details
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDownloadCsv(currentPayslip)} disabled={downloadingId === currentPayslip.id} className="h-8 text-xs">
                      <Download className="w-3 h-3 mr-1" /> CSV
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card><CardContent className="p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">YTD Net</p>
                <p className="text-lg font-black text-emerald-600">{formatINR(ytdNet)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">YTD PF</p>
                <p className="text-lg font-black text-slate-700">{formatINR(ytdPf)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">YTD PT</p>
                <p className="text-lg font-black text-slate-700">{formatINR(payslips.reduce((s, p) => s + p.pt_amount, 0))}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Total Payslips</p>
                <p className="text-lg font-black text-slate-700">{payslips.length}</p>
              </CardContent></Card>
            </div>

            <Card className="shadow-sm">
              <CardHeader className="bg-slate-50 border-b pb-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <CardTitle className="text-lg text-slate-800">Payslip History</CardTitle>
                  <div className="relative w-full md:w-56">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input placeholder="Search month..." className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredPayslips.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    {search ? 'No payslips match your search.' : 'No payslips found yet. Your payslips will appear here once payroll is generated.'}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-bold">Period</TableHead>
                        <TableHead className="font-bold text-right">Gross</TableHead>
                        <TableHead className="font-bold text-right">Net</TableHead>
                        <TableHead className="font-bold text-right">PF</TableHead>
                        <TableHead className="font-bold text-right">TDS</TableHead>
                        <TableHead className="font-bold text-center">Status</TableHead>
                        <TableHead className="font-bold text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPayslips.map(p => (
                        <TableRow key={p.id} className="hover:bg-slate-50">
                          <TableCell className="font-semibold">{MONTHS[p.month-1]} {p.year}</TableCell>
                          <TableCell className="text-right">{formatINR(p.gross)}</TableCell>
                          <TableCell className="text-right font-bold text-emerald-600">{formatINR(p.net)}</TableCell>
                          <TableCell className="text-right text-slate-600">{formatINR(p.pf_amount)}</TableCell>
                          <TableCell className="text-right text-red-600">{formatINR(p.tds_amount)}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-[10px] ${p.cycle_status === 'released' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500'}`}>
                              {p.cycle_status === 'released' ? 'Released' : p.cycle_status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setSelectedPayslip(p)} className="h-8 w-8 p-0">
                                <FileText className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDownloadCsv(p)} disabled={downloadingId === p.id} className="h-8 w-8 p-0">
                                <Download className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {revisions.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader className="bg-slate-50 border-b">
                  <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-indigo-600" /> Salary Revision History
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-bold">Effective</TableHead>
                        <TableHead className="font-bold text-right">Previous CTC</TableHead>
                        <TableHead className="font-bold text-right">New CTC</TableHead>
                        <TableHead className="font-bold text-right">Change</TableHead>
                        <TableHead className="font-bold">Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {revisions.map(r => {
                        const pct = r.old_ctc ? Math.round(((r.new_ctc - r.old_ctc) / r.old_ctc) * 100) : null;
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="text-sm">{new Date(r.effective_from).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right">{r.old_ctc ? formatINR(r.old_ctc) : '—'}</TableCell>
                            <TableCell className="text-right font-bold text-emerald-600">{formatINR(r.new_ctc)}</TableCell>
                            <TableCell className="text-right">
                              {pct !== null ? (
                                <span className={`text-xs font-bold ${pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {pct >= 0 ? '+' : ''}{pct}%
                                </span>
                              ) : '—'}
                            </TableCell>
                            <TableCell className="text-xs text-slate-500 max-w-[200px] truncate">{r.reason || '—'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {selectedPayslip && (
          <div className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white shadow-2xl rounded-2xl border-0 overflow-hidden flex flex-col max-h-[95vh]">
              <div className="bg-slate-900 p-4 flex justify-between items-center text-white shrink-0">
                <h3 className="font-black text-xs uppercase tracking-wider flex items-center gap-1.5 text-indigo-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> Payslip — {MONTHS[selectedPayslip.month-1]} {selectedPayslip.year}
                </h3>
                <button onClick={() => setSelectedPayslip(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                <div className="grid grid-cols-2 gap-4 bg-slate-50 border p-4 rounded-xl text-xs">
                  <div>
                    <p className="text-slate-400 font-bold text-[9px] uppercase tracking-wider mb-1">Employee</p>
                    <p className="font-bold text-slate-900">{selectedPayslip.employee_name || 'You'}</p>
                    <p className="text-slate-600">{selectedPayslip.employee_department}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-400 font-bold text-[9px] uppercase tracking-wider mb-1">Annual CTC</p>
                    <p className="font-bold text-lg text-slate-900">{formatINR(selectedPayslip.annual_ctc)}</p>
                    <p className="text-slate-400 text-[10px]">Version {selectedPayslip.version}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b pb-1">Earnings</h4>
                    <div className="space-y-1 text-xs">
                      {Object.entries(selectedPayslip.earnings).map(([key, val]) => (
                        <div key={key} className="flex justify-between py-1">
                          <span className="text-slate-600 capitalize">{key}</span>
                          <span className="font-semibold">{formatINR(val)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between py-1.5 border-t font-bold text-slate-800">
                        <span>Gross</span><span>{formatINR(selectedPayslip.gross)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b pb-1">Deductions</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between py-1"><span className="text-slate-600">PF</span><span className="font-semibold text-red-600">{formatINR(selectedPayslip.pf_amount)}</span></div>
                      <div className="flex justify-between py-1"><span className="text-slate-600">PT</span><span className="font-semibold">{formatINR(selectedPayslip.pt_amount)}</span></div>
                      <div className="flex justify-between py-1"><span className="text-slate-600">TDS</span><span className="font-semibold text-red-600">{formatINR(selectedPayslip.tds_amount)}</span></div>
                      <div className="flex justify-between py-1.5 border-t font-bold text-slate-800">
                        <span>Total Deductions</span>
                        <span className="text-red-600">{formatINR(selectedPayslip.pf_amount + selectedPayslip.pt_amount + selectedPayslip.tds_amount)}</span>
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

                <div className="flex justify-center gap-3 pt-2">
                  <Button variant="outline" onClick={() => { handleDownloadCsv(selectedPayslip); setSelectedPayslip(null); }} className="text-xs">
                    <Download className="w-3 h-3 mr-1" /> Download CSV
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
