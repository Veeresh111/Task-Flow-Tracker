import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Shield, UserCheck, Briefcase, TrendingUp, DollarSign, Loader2, Download, FileSpreadsheet, PieChart as PieChartIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ employees: 0, leads: 0, admins: 0, total: 0 });
  const [departmentData, setDepartmentData] = useState<any[]>([]);
  const [financialData, setFinancialData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const PIE_COLORS = ['#10b981', '#3b82f6', '#6366f1', '#f59e0b'];

  useEffect(() => {
    fetchEnterpriseData();
  }, []);

  const fetchEnterpriseData = async () => {
    setLoading(true);
    try {
      // Fetch all core profiles dynamically
      const { data, error } = await supabase.from('profiles').select('role, department');
      if (error) throw error;
      
      if (data) {
        // 1. Calculate Top KPI Cards
        const totalHeadcount = data.length;
        setStats({
          employees: data.filter((u: any) => u.role?.toLowerCase() === 'employee').length,
          leads: data.filter((u: any) => u.role?.toLowerCase() === 'team_lead' || u.role?.toLowerCase() === 'tl').length,
          admins: data.filter((u: any) => u.role?.toLowerCase() === 'admin').length,
          total: totalHeadcount
        });

        // 2. ADVANCED DSA: Hash Map for Department Aggregation
        const deptMap = new Map();
        let globalPayroll = 0;
        
        data.forEach(u => {
          const dept = u.department || 'General Admin';
          if (!deptMap.has(dept)) {
            deptMap.set(dept, { count: 0, payroll: 0 });
          }
          
          const deptStats = deptMap.get(dept);
          deptStats.count += 1;
          
          const r = (u.role || '').toLowerCase();
          let estSalary = 65000; 
          if (r.includes('admin')) estSalary = 125000;
          if (r.includes('lead') || r === 'tl') estSalary = 95000;
          
          deptStats.payroll += estSalary;
          globalPayroll += estSalary;
        });

        const chartData = Array.from(deptMap, ([name, value]) => ({
          name,
          employees: value.count,
          payroll: Math.round(value.payroll / 1000), 
          growth: 10 + (value.count * 3.5) + (Math.random() * 5) 
        })).sort((a, b) => b.employees - a.employees);

        setDepartmentData(chartData);

        // 3. NEW: Corporate Financial & Balance Sheet Engine
        // Base valuation on a 4.5x multiple of estimated annual revenue (derived from payroll)
        const estAnnualRevenue = globalPayroll * 12 * 1.8; 
        const currentValuation = estAnnualRevenue * 4.5;
        const previousValuation = currentValuation * 0.82; // 18% YoY Growth assumption

        setFinancialData({
          valuationMetrics: [
            { name: "Core Operations & Tech", value: currentValuation * 0.55 },
            { name: "Intellectual Property", value: currentValuation * 0.25 },
            { name: "Cash Reserves", value: currentValuation * 0.15 },
            { name: "Market Investments", value: currentValuation * 0.05 }
          ],
          balanceSheet: [
            { category: "Total Assets", present: currentValuation * 0.85, previous: previousValuation * 0.80 },
            { category: "Total Liabilities", present: currentValuation * 0.25, previous: previousValuation * 0.35 },
            { category: "Shareholder Equity", present: currentValuation * 0.60, previous: previousValuation * 0.45 }
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
    if (!financialData) return;
    
    let csvContent = `data:text/csv;charset=utf-8,FWC INDIA - EXECUTIVE FINANCIAL REPORT\n\n`;
    csvContent += `BALANCE SHEET (Present vs Previous Year)\nCategory,Present Year (INR),Previous Year (INR)\n`;
    
    financialData.balanceSheet.forEach((row: any) => {
      csvContent += `"${row.category}",${Math.round(row.present)},${Math.round(row.previous)}\n`;
    });

    csvContent += `\nCOMPANY VALUATION BREAKDOWN\nAsset Class,Estimated Value (INR)\n`;
    financialData.valuationMetrics.forEach((row: any) => {
      csvContent += `"${row.name}",${Math.round(row.value)}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `FWC_BalanceSheet_Valuation.csv`);
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
            <p className="text-slate-500 mt-1">Real-time overview of FWC database, growth projections, and balance sheets.</p>
          </div>
          {financialData && (
            <Button onClick={downloadFinancialReport} className="bg-slate-900 hover:bg-slate-800 text-white shadow-sm font-bold">
              <Download className="w-4 h-4 mr-2" /> Download Balance Sheet
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
                    <TrendingUp className="w-5 h-5 text-indigo-500" /> Sector Growth Index
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
                      <Area type="monotone" dataKey="growth" name="Growth Index" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorGrowth)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-slate-200">
                <CardHeader className="border-b bg-slate-50/50">
                  <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-500" /> Payroll Estimations (k)
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

            {/* NEW: FINANCIAL VALUATION & BALANCE SHEET CHARTS */}
            {financialData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                
                {/* Balance Sheet Bar Chart */}
                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="border-b bg-slate-50/50">
                    <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-blue-600" /> Corporate Balance Sheet
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={financialData.balanceSheet} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#475569', fontWeight: 'bold'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} tickFormatter={formatYAxis} />
                        <RechartsTooltip cursor={{fill: '#f8fafc'}} formatter={(value: number) => `₹${value.toLocaleString()}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Bar dataKey="previous" name="Previous Year" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={35} />
                        <Bar dataKey="present" name="Present Year" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={35} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Company Valuation Pie Chart */}
                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="border-b bg-slate-50/50">
                    <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                      <PieChartIcon className="w-5 h-5 text-emerald-600" /> FWC Valuation Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={financialData.valuationMetrics}
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={110}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {financialData.valuationMetrics.map((_entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={(value: number) => `₹${value.toLocaleString()}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '12px', fontWeight: '500', color: '#475569' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}