import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Shield, UserCheck, Briefcase, TrendingUp, DollarSign, Loader2, Download, FileSpreadsheet, PieChart as PieChartIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { CareerPredictor } from "@/components/dashboard/CareerPredictor";

export default function AdminDashboard() {
  useEffect(() => { document.title = "Admin Dashboard - FWC"; }, []);
  const [stats, setStats] = useState({ employees: 0, leads: 0, admins: 0, total: 0 });
  const [departmentData, setDepartmentData] = useState<any[]>([]);
    const [payrollSummary, setPayrollSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const PIE_COLORS = ['#10b981', '#3b82f6', '#6366f1', '#f59e0b'];

  useEffect(() => {
    fetchEnterpriseData();
  }, []);

  const fetchEnterpriseData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);

      const { data: unified } = await supabase.rpc('get_enterprise_metrics');
      const metrics = unified || {};

      let profilesResult = await supabase.from('profiles').select('role, department, payroll_ctc, employment_status');
      if (profilesResult.error && (profilesResult.error.code === 'PGRST202' || profilesResult.error.code === '42703' || profilesResult.error.message?.includes('payroll_ctc'))) {
        profilesResult = await supabase.from('profiles').select('role, department');
      }
      const { data, error } = profilesResult;
      if (error) throw error;
      
      if (data) {
        const byRole = (metrics.by_role || []) as Array<{role: string; count: number}>;
        const findCount = (role: string) => {
          const match = byRole.find((r: any) => r.role === role);
          return match?.count ?? 0;
        };
        setStats({
          total: metrics.active_headcount ?? 0,
          employees: findCount('employee'),
          leads: findCount('team_lead') + findCount('tl'),
          admins: findCount('admin')
        });

        const activeProfiles = data.filter((u: any) => u.employment_status !== 'terminated');
        const deptMap = new Map();
        let globalPayroll = 0;
        
        activeProfiles.forEach(u => {
          const dept = u.department || 'General Admin';
          if (!deptMap.has(dept)) {
            deptMap.set(dept, { count: 0, payroll: 0 });
          }
          
          const deptStats = deptMap.get(dept);
          deptStats.count += 1;
          
          const salary = Number(u.payroll_ctc) || 0;
          deptStats.payroll += salary;
          globalPayroll += salary;
        });

        const chartData = Array.from(deptMap, ([name, value]) => ({
          name,
          employees: value.count,
          payroll: Math.round(value.payroll / 1000),
          growth: value.count
        })).sort((a, b) => b.employees - a.employees);

        setDepartmentData(chartData);

        const totalMonthlyPayroll = Math.round(globalPayroll / 12);
        const estimatedAnnualPayroll = globalPayroll;

        const knownSalaryCount = activeProfiles.filter((u: any) => Number(u.payroll_ctc) > 0).length;
        setPayrollSummary({
          totalMonthlyPayroll,
          estimatedAnnualPayroll,
          averageSalary: knownSalaryCount > 0 ? Math.round(globalPayroll / knownSalaryCount) : 0,
          balanceSheet: [
            { category: "Current Monthly Payroll", present: totalMonthlyPayroll, previous: 0 },
            { category: "Current Annual Payroll Liability", present: estimatedAnnualPayroll, previous: 0 },
            { category: "Avg Salary Per Employee", present: (knownSalaryCount > 0 ? Math.round(globalPayroll / knownSalaryCount) : 0), previous: 0 }
          ]
        });
      }
    } catch (err) {
      console.error("Error fetching enterprise stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const downloadFinancialReport = () => {
    if (!payrollSummary) return;
    
    let csvContent = `data:text/csv;charset=utf-8,FWC INDIA - PAYROLL REPORT\n\n`;
    csvContent += `PAYROLL SUMMARY\nCategory,Current (INR),Previous (INR)\n`;
    
    payrollSummary.balanceSheet.forEach((row: any) => {
      csvContent += `"${row.category}",${Math.round(row.present)},${Math.round(row.previous)}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `FWC_Payroll_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatYAxis = (tickItem: number) => {
    if (tickItem >= 10000000) return `₹${(tickItem / 10000000).toFixed(1)}Cr`;
    if (tickItem >= 100000) return `₹${(tickItem / 100000).toFixed(1)}L`;
    return `₹${tickItem}`;
  };

  return (
    <DashboardLayout role="admin">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Enterprise Command Center</h1>
            <p className="text-slate-500 mt-1">Real-time overview of workforce database and operational projections.</p>
          </div>
            {payrollSummary && (
            <Button onClick={downloadFinancialReport} className="bg-slate-900 hover:bg-slate-800 text-white shadow-sm font-bold">
              <Download className="w-4 h-4 mr-2" /> Download Payroll Report
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div>
        ) : (
          <>
            {/* KPI STATS CARDS */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="border-0 shadow-sm border-b-4 border-blue-500 bg-white">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Headcount</CardTitle>
                  <div className="p-2 bg-blue-50 rounded-lg"><Users className="h-4 w-4 text-blue-600" /></div>
                </CardHeader>
                <CardContent><div className="text-3xl font-black text-slate-800">{stats.total}</div></CardContent>
              </Card>
              
              <Card className="border-0 shadow-sm border-b-4 border-slate-400 bg-white">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Base Employees</CardTitle>
                  <div className="p-2 bg-slate-50 rounded-lg"><Briefcase className="h-4 w-4 text-slate-600" /></div>
                </CardHeader>
                <CardContent><div className="text-3xl font-black text-slate-800">{stats.employees}</div></CardContent>
              </Card>

              <Card className="border-0 shadow-sm border-b-4 border-emerald-500 bg-white">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Team Leads</CardTitle>
                  <div className="p-2 bg-emerald-50 rounded-lg"><UserCheck className="h-4 w-4 text-emerald-600" /></div>
                </CardHeader>
                <CardContent><div className="text-3xl font-black text-slate-800">{stats.leads}</div></CardContent>
              </Card>

              <Card className="border-0 shadow-sm border-b-4 border-purple-500 bg-white">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">System Admins</CardTitle>
                  <div className="p-2 bg-purple-50 rounded-lg"><Shield className="h-4 w-4 text-purple-600" /></div>
                </CardHeader>
                <CardContent><div className="text-3xl font-black text-slate-800">{stats.admins}</div></CardContent>
              </Card>
            </div>

            {/* STOCK MARKET STYLE ADVANCED CHARTS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="border-b bg-slate-50/50">
                  <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-indigo-500" /> Headcount by Department
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={departmentData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} />
                      <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Area type="monotone" dataKey="growth" name="Headcount" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorGrowth)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-slate-200">
                <CardHeader className="border-b bg-slate-50/50">
                  <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-500" /> Payroll by Department (₹k)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={departmentData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} />
                      <RechartsTooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="payroll" name="Est. Payroll (₹k)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* FINANCIAL VALUATION & BALANCE SHEET CHARTS */}
            {payrollSummary && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                
                {/* Payroll Summary Card */}
                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="border-b bg-slate-50/50">
                    <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-blue-600" /> Payroll from Database
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={payrollSummary.balanceSheet} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#475569', fontWeight: 'bold'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} tickFormatter={formatYAxis} />
                        <RechartsTooltip cursor={{fill: '#f8fafc'}} formatter={(value: number) => `₹${value.toLocaleString()}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Bar dataKey="present" name="Current Value" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={50} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Payroll Summary Card */}
                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="border-b bg-slate-50/50">
                    <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-emerald-600" /> Payroll Snapshot
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Monthly Payroll</p>
                        <p className="text-2xl font-black text-slate-800 mt-1">₹{payrollSummary.totalMonthlyPayroll.toLocaleString()}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Annual Payroll Liability</p>
                        <p className="text-2xl font-black text-slate-800 mt-1">₹{payrollSummary.estimatedAnnualPayroll.toLocaleString()}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Average Salary</p>
                        <p className="text-2xl font-black text-indigo-600 mt-1">₹{payrollSummary.averageSalary.toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              </div>
            )}
            
            {/* NEW AI CAREER PREDICTOR WIDGET FOR ADMIN */}
            {userId && (
              <div className="mt-6 max-w-lg">
                <CareerPredictor userId={userId} />
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}