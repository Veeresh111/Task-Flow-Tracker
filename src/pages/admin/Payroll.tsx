import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { formatINR } from "@/lib/payroll";
import { Loader2, Wallet, TrendingUp, Search, Calendar, ShieldCheck, Download, AlertCircle, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line } from "recharts";

type TabKey = 'overview' | 'cycles' | 'audit' | 'revisions';

interface CycleSummary {
  month: number;
  year: number;
  total_gross: number;
  total_net: number;
  total_pf: number;
  total_tds: number;
  total_employees: number;
  status: string;
  id: string;
}

interface AuditRecord {
  id: string;
  evidence_code: string;
  entity: string;
  entity_id: string | null;
  action: string;
  performed_by: string | null;
  performed_at: string;
  reason: string | null;
  details: Record<string, unknown> | null;
}

interface RevisionRecord {
  id: string;
  employee_id: string;
  old_ctc: number | null;
  new_ctc: number;
  effective_from: string;
  reason: string | null;
  created_at: string;
  employee_name?: string;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  generated: 'bg-blue-100 text-blue-700',
  verified: 'bg-indigo-100 text-indigo-700',
  finance_approved: 'bg-purple-100 text-purple-700',
  hr_approved: 'bg-emerald-100 text-emerald-700',
  released: 'bg-green-100 text-green-700',
};

export default function AdminPayroll() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [dbReady, setDbReady] = useState<boolean | null>(null);
  const [cycles, setCycles] = useState<CycleSummary[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [revisions, setRevisions] = useState<RevisionRecord[]>([]);
  const [search, setSearch] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [employeeCount, setEmployeeCount] = useState(0);

  const checkDb = useCallback(async () => {
    try {
      const { error } = await supabase.rpc('preview_payslip_breakdown', { p_annual_ctc: 1200000 });
      setDbReady(!error || !error.message?.includes('PGRST202'));
    } catch { setDbReady(false); }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: cyclesData } = await supabase.from('payroll_cycles').select('*').order('year', { ascending: false }).order('month', { ascending: false });
      if (cyclesData) setCycles(cyclesData);

      const { data: payslipsData } = await supabase.from('payslips').select('*, payroll_cycles!inner(month, year, status)').order('created_at', { ascending: false });
      if (payslipsData) setPayslips(payslipsData.map((s: any) => ({ ...s, month: s.payroll_cycles?.month, year: s.payroll_cycles?.year })));

      const { data: auditData } = await supabase.from('payroll_audit').select('*').order('performed_at', { ascending: false }).limit(200);
      if (auditData) setAuditRecords(auditData);

      const { data: revisionsData } = await supabase.from('salary_revisions').select('*, profiles!inner(name)').order('created_at', { ascending: false }).limit(100);
      if (revisionsData) {
        setRevisions(revisionsData.map((r: any) => ({ ...r, employee_name: r.profiles?.name })));
      }

      const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'active');
      if (count !== null) setEmployeeCount(count);
    } catch (e: any) {
      if (e.code !== 'PGRST202' && e.code !== '42P01') console.error(e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { checkDb(); }, [checkDb]);
  useEffect(() => { if (dbReady === true) fetchData(); else if (dbReady === false) setLoading(false); }, [dbReady, fetchData]);

  const totalGross = cycles.reduce((s, c) => s + Number(c.total_gross), 0);
  const totalNet = cycles.reduce((s, c) => s + Number(c.total_net), 0);
  const totalPf = cycles.reduce((s, c) => s + Number(c.total_pf), 0);
  const totalTds = cycles.reduce((s, c) => s + Number(c.total_tds), 0);
  const totalEmployeesPaid = cycles.reduce((s, c) => s + c.total_employees, 0);

  const chartData = [...cycles].reverse().map(c => ({
    label: `${MONTHS[c.month-1]} ${c.year}`,
    gross: Number(c.total_gross),
    net: Number(c.total_net),
    pf: Number(c.total_pf),
    tds: Number(c.total_tds),
  }));

  const deptData = (() => {
    const map: Record<string, number> = {};
    payslips.forEach(p => {
      const dept = p.employee_department || 'Unknown';
      map[dept] = (map[dept] || 0) + Number(p.net);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  })();

  const filteredAudit = auditRecords.filter(r =>
    !auditSearch || r.action.toLowerCase().includes(auditSearch.toLowerCase()) || r.evidence_code.toLowerCase().includes(auditSearch.toLowerCase())
  );

  const filteredCycles = cycles.filter(c =>
    !search || `${MONTHS[c.month-1]} ${c.year}`.toLowerCase().includes(search.toLowerCase())
  );

  if (dbReady === false) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto p-12 text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto" />
          <h2 className="text-2xl font-bold text-slate-800">Payroll Backend Not Configured</h2>
          <p className="text-slate-500">Apply migration to enable payroll administration.</p>
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
              <Wallet className="text-emerald-600" /> Payroll Administration
            </h1>
            <p className="text-slate-500 mt-1">Enterprise payroll analytics, cycle management, and audit explorer.</p>
          </div>
          <div className="flex gap-2">
            {(['overview', 'cycles', 'audit', 'revisions'] as TabKey[]).map(tab => (
              <Button key={tab} variant={activeTab === tab ? 'default' : 'outline'} size="sm"
                onClick={() => setActiveTab(tab)}
                className={activeTab === tab ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}>
                {tab === 'overview' ? 'Overview' : tab === 'cycles' ? 'Cycles' : tab === 'audit' ? 'Audit' : 'Revisions'}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <Card key={i}><CardContent className="p-6"><div className="h-16 bg-slate-100 rounded animate-pulse" /></CardContent></Card>)}
          </div>
        ) : activeTab === 'overview' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-l-4 border-l-slate-800"><CardContent className="p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Active Employees</p>
                <p className="text-2xl font-black text-slate-800">{employeeCount}</p>
              </CardContent></Card>
              <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Total Cycles</p>
                <p className="text-2xl font-black text-emerald-600">{cycles.length}</p>
              </CardContent></Card>
              <Card className="border-l-4 border-l-indigo-500"><CardContent className="p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">All-Time Gross</p>
                <p className="text-2xl font-black text-indigo-600">{formatINR(totalGross)}</p>
              </CardContent></Card>
              <Card className="border-l-4 border-l-red-500"><CardContent className="p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">All-Time TDS</p>
                <p className="text-2xl font-black text-red-600">{formatINR(totalTds)}</p>
              </CardContent></Card>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card><CardContent className="p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">All-Time Net</p>
                <p className="text-lg font-black text-emerald-600">{formatINR(totalNet)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">All-Time PF</p>
                <p className="text-lg font-black text-slate-700">{formatINR(totalPf)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Total Employees Paid</p>
                <p className="text-lg font-black text-slate-700">{totalEmployeesPaid}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Released Cycles</p>
                <p className="text-lg font-black text-green-600">{cycles.filter(c => c.status === 'released').length}</p>
              </CardContent></Card>
            </div>

            {chartData.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card><CardHeader className="bg-slate-50 border-b pb-3"><CardTitle className="text-sm font-bold text-slate-700">Monthly Net Pay Trend</CardTitle></CardHeader>
                  <CardContent className="p-4 h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                        <XAxis dataKey="label" tick={{fontSize: 10}} axisLine={false}/>
                        <YAxis tickFormatter={(v:number)=>`₹${(v/100000).toFixed(1)}L`} tick={{fontSize: 10}} axisLine={false}/>
                        <RechartsTooltip formatter={(v:number)=>formatINR(v)}/>
                        <Bar dataKey="net" fill="#10b981" radius={[4,4,0,0]} name="Net Pay"/>
                        <Bar dataKey="gross" fill="#3b82f6" radius={[4,4,0,0]} name="Gross"/>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card><CardHeader className="bg-slate-50 border-b pb-3"><CardTitle className="text-sm font-bold text-slate-700">Department Net Pay Distribution</CardTitle></CardHeader>
                  <CardContent className="p-4 h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={deptData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9"/>
                        <XAxis type="number" tickFormatter={(v:number)=>`₹${(v/100000).toFixed(1)}L`} tick={{fontSize: 10}} axisLine={false}/>
                        <YAxis dataKey="name" type="category" tick={{fontSize: 10}} axisLine={false} width={100}/>
                        <RechartsTooltip formatter={(v:number)=>formatINR(v)}/>
                        <Bar dataKey="value" fill="#8b5cf6" radius={[0,4,4,0]} name="Net Pay"/>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        ) : activeTab === 'cycles' ? (
          <Card className="shadow-sm">
            <CardHeader className="bg-slate-50 border-b pb-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <CardTitle className="text-lg text-slate-800">Payroll Cycles</CardTitle>
                <Input placeholder="Search period..." className="w-full md:w-56 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredCycles.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No payroll cycles found.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-bold">Period</TableHead>
                      <TableHead className="font-bold">Status</TableHead>
                      <TableHead className="font-bold text-right">Employees</TableHead>
                      <TableHead className="font-bold text-right">Gross</TableHead>
                      <TableHead className="font-bold text-right">Net</TableHead>
                      <TableHead className="font-bold text-right">PF</TableHead>
                      <TableHead className="font-bold text-right">TDS</TableHead>
                      <TableHead className="font-bold text-right">Generated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCycles.map(c => (
                      <TableRow key={c.id} className="hover:bg-slate-50">
                        <TableCell className="font-semibold">{MONTHS[c.month-1]} {c.year}</TableCell>
                        <TableCell><Badge className={STATUS_BADGE[c.status] || ''}>{c.status.replace('_', ' ')}</Badge></TableCell>
                        <TableCell className="text-right">{c.total_employees}</TableCell>
                        <TableCell className="text-right font-medium">{formatINR(Number(c.total_gross))}</TableCell>
                        <TableCell className="text-right font-bold text-emerald-600">{formatINR(Number(c.total_net))}</TableCell>
                        <TableCell className="text-right text-slate-600">{formatINR(Number(c.total_pf))}</TableCell>
                        <TableCell className="text-right text-red-600">{formatINR(Number(c.total_tds))}</TableCell>
                        <TableCell className="text-right text-xs text-slate-500">
                          {c.generated_at ? new Date(c.generated_at).toLocaleDateString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : activeTab === 'audit' ? (
          <Card className="shadow-sm">
            <CardHeader className="bg-slate-50 border-b pb-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" /> Payroll Audit Trail
                </CardTitle>
                <Input placeholder="Search action or evidence code..." className="w-full md:w-64 h-9 text-sm" value={auditSearch} onChange={e => setAuditSearch(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredAudit.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No audit records found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-bold text-[10px]">Evidence</TableHead>
                        <TableHead className="font-bold text-[10px]">Action</TableHead>
                        <TableHead className="font-bold text-[10px]">Entity</TableHead>
                        <TableHead className="font-bold text-[10px] text-right">Timestamp</TableHead>
                        <TableHead className="font-bold text-[10px]">Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAudit.map(r => (
                        <TableRow key={r.id} className="hover:bg-slate-50 text-xs">
                          <TableCell><Badge variant="outline" className="text-[10px] font-mono">{r.evidence_code}</Badge></TableCell>
                          <TableCell className="font-semibold">{r.action}</TableCell>
                          <TableCell className="text-slate-500 text-[10px]">{r.entity}{r.entity_id ? ` • ${r.entity_id.substring(0, 8)}...` : ''}</TableCell>
                          <TableCell className="text-right text-slate-500 text-[10px]">{new Date(r.performed_at).toLocaleString()}</TableCell>
                          <TableCell className="text-slate-500 max-w-[200px] truncate text-[10px]">{r.reason || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm">
            <CardHeader className="bg-slate-50 border-b">
              <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-600" /> Salary Revisions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {revisions.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No salary revisions recorded.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-bold">Employee</TableHead>
                      <TableHead className="font-bold text-right">Previous CTC</TableHead>
                      <TableHead className="font-bold text-right">New CTC</TableHead>
                      <TableHead className="font-bold text-right">Change</TableHead>
                      <TableHead className="font-bold text-right">Effective</TableHead>
                      <TableHead className="font-bold">Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revisions.map(r => {
                      const pct = r.old_ctc ? Math.round(((r.new_ctc - r.old_ctc) / r.old_ctc) * 100) : null;
                      return (
                        <TableRow key={r.id} className="hover:bg-slate-50">
                          <TableCell className="font-semibold">{r.employee_name || r.employee_id.substring(0, 8)}</TableCell>
                          <TableCell className="text-right">{r.old_ctc ? formatINR(r.old_ctc) : '—'}</TableCell>
                          <TableCell className="text-right font-bold text-emerald-600">{formatINR(r.new_ctc)}</TableCell>
                          <TableCell className="text-right">
                            {pct !== null ? (
                              <span className={`text-xs font-bold ${pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {pct >= 0 ? '+' : ''}{pct}%
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-right text-xs">{new Date(r.effective_from).toLocaleDateString()}</TableCell>
                          <TableCell className="text-xs text-slate-500 max-w-[200px] truncate">{r.reason || '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
