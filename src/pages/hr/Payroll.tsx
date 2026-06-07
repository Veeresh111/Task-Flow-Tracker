import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
// FIX 2: Explicitly added BarChart3 to prevent ReferenceError crash on Modal open
import { Wallet, Download, CheckCircle2, AlertCircle, Loader2, Search, Filter, TrendingUp, TrendingDown, Calendar, UserCheck, X, BarChart3 } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts";

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function HRPayroll() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('global');
  const [payrollData, setPayrollData] = useState<any[]>([]);
  const [myPayroll, setMyPayroll] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDept, setFilterDept] = useState("All");

  // Employee Detail Modal States
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = useState("");

  // Analytics State
  const [globalStats, setGlobalStats] = useState({ totalBase: 0, totalTax: 0, totalNet: 0, deptData: [] });

  useEffect(() => {
    fetchPayrollDatabase();
  }, []);

  const fetchPayrollDatabase = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profiles } = await supabase.from('profiles').select('*');

      if (profiles) {
        const enrichedData = profiles.map(emp => {
          const role = emp.role?.toLowerCase() || 'employee';
          let base = 60000;
          if (role.includes('admin')) base = 120000;
          else if (role.includes('lead') || role === 'tl') base = 90000;
          else if (role.includes('hr')) base = 85000;

          const allowances = base * 0.15;
          const bonus = Math.floor(Math.random() * 5000);
          const gross = base + allowances + bonus;

          const tax = gross * 0.18; 
          const providentFund = base * 0.12;
          const netPay = gross - tax - providentFund;
          
          // Generate realistic join date for experience
          const joinDate = new Date(emp.created_at || Date.now());
          const expMonths = Math.max(1, Math.floor((Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));

          const record = {
            id: emp.id,
            name: emp.name || 'Unknown',
            department: emp.department || 'General',
            role: emp.role || 'employee',
            base, allowances, bonus, gross, tax, providentFund, netPay,
            status: 'Processed',
            experience: `${Math.floor(expMonths / 12)} Yrs ${expMonths % 12} Mos`,
            joinDate: joinDate.toLocaleDateString(),
            // Mock Performance Data for the Analytics Graph
            performanceData: [
              { month: 'Jan', performance: 75 + Math.random()*20, morale: 70 + Math.random()*20 },
              { month: 'Feb', performance: 75 + Math.random()*20, morale: 70 + Math.random()*20 },
              { month: 'Mar', performance: 75 + Math.random()*20, morale: 70 + Math.random()*20 },
              { month: 'Apr', performance: 75 + Math.random()*20, morale: 70 + Math.random()*20 },
              { month: 'May', performance: 75 + Math.random()*20, morale: 70 + Math.random()*20 },
              { month: 'Jun', performance: 80 + Math.random()*20, morale: 75 + Math.random()*20 },
            ]
          };

          if (user && emp.id === user.id) setMyPayroll(record);
          return record;
        });

        setPayrollData(enrichedData);
        calculateGlobalStats(enrichedData);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const calculateGlobalStats = (data: any[]) => {
    let tBase = 0, tTax = 0, tNet = 0;
    const dMap: any = {};

    data.forEach(r => {
      tBase += r.base;
      tTax += r.tax;
      tNet += r.netPay;
      
      if (!dMap[r.department]) dMap[r.department] = { name: r.department, NetPay: 0, Taxes: 0 };
      dMap[r.department].NetPay += r.netPay;
      dMap[r.department].Taxes += r.tax;
    });

    setGlobalStats({
      totalBase: tBase,
      totalTax: tTax,
      totalNet: tNet,
      deptData: Object.values(dMap)
    });
  };

  const handleCompensationAdjustment = (type: 'raise' | 'deduction') => {
    const amount = Number(adjustmentAmount);
    if (!amount || amount <= 0) return toast({ title: "Invalid Amount", variant: "destructive" });

    const updatedData = payrollData.map(emp => {
      if (emp.id === selectedEmp.id) {
        let newBonus = emp.bonus;
        let newTax = emp.tax;
        
        if (type === 'raise') newBonus += amount;
        if (type === 'deduction') newTax += amount; // Treat deduction as a tax/penalty for calculation
        
        const newGross = emp.base + emp.allowances + newBonus;
        const newNet = newGross - newTax - emp.providentFund;

        return { ...emp, bonus: newBonus, tax: newTax, gross: newGross, netPay: newNet };
      }
      return emp;
    });

    setPayrollData(updatedData);
    calculateGlobalStats(updatedData); // Instantly update graphs
    setSelectedEmp(updatedData.find(e => e.id === selectedEmp.id));
    setAdjustmentAmount("");
    setModalOpen(false);

    toast({ 
      title: `Compensation Updated`, 
      description: `Successfully applied a ₹${amount} ${type} to ${selectedEmp.name}. Graphs synchronized.` 
    });
  };

  const exportCSV = (data: any[], filename: string) => {
    let csvContent = `data:text/csv;charset=utf-8,NAME,DEPARTMENT,BASE,ALLOWANCE,BONUS,TAX,PF,NET PAY\n`;
    data.forEach(r => {
      csvContent += `"${r.name}","${r.department}",${r.base},${r.allowances},${r.bonus},${r.tax},${r.providentFund},${r.netPay}\n`;
    });
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatCurrency = (val: number) => `₹${Math.round(val).toLocaleString()}`;

  // Filter Logic
  const filteredData = payrollData.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || emp.role.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = filterDept === "All" || emp.department === filterDept;
    return matchesSearch && matchesDept;
  });

  const uniqueDepartments = ["All", ...Array.from(new Set(payrollData.map(e => e.department)))];

  if (loading) return <DashboardLayout role="hr"><div className="p-20 flex justify-center"><Loader2 className="w-12 h-12 animate-spin text-emerald-600"/></div></DashboardLayout>;

  return (
    <DashboardLayout role="hr">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12 relative">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="text-emerald-600"/> HR Payroll & Analytics
            </h1>
            <p className="text-slate-500 mt-1">Global corporate disbursements, tax deductions, and personal payslips.</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button variant={activeTab === 'global' ? 'default' : 'outline'} onClick={() => setActiveTab('global')} className={`flex-1 md:flex-none ${activeTab==='global'?'bg-emerald-600 hover:bg-emerald-700':''}`}>Global Analytics</Button>
            <Button variant={activeTab === 'personal' ? 'default' : 'outline'} onClick={() => setActiveTab('personal')} className={`flex-1 md:flex-none ${activeTab==='personal'?'bg-emerald-600 hover:bg-emerald-700':''}`}>My Payslip</Button>
          </div>
        </div>

        {activeTab === 'global' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border-l-4 border-l-slate-800 shadow-sm"><CardContent className="p-6">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Gross Liability</p>
                <h2 className="text-3xl font-black text-slate-800">{formatCurrency(globalStats.totalBase + globalStats.totalTax)}</h2>
              </CardContent></Card>
              <Card className="border-l-4 border-l-emerald-500 shadow-sm"><CardContent className="p-6">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Disbursed Net Pay</p>
                <h2 className="text-3xl font-black text-emerald-600">{formatCurrency(globalStats.totalNet)}</h2>
              </CardContent></Card>
              <Card className="border-l-4 border-l-red-500 shadow-sm"><CardContent className="p-6">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Tax Deductions</p>
                <h2 className="text-3xl font-black text-red-600">{formatCurrency(globalStats.totalTax)}</h2>
              </CardContent></Card>
            </div>

            {/* AI DATA ANALYTICS CHARTS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="shadow-sm">
                <CardHeader className="bg-slate-50 border-b"><CardTitle className="text-sm font-bold text-slate-700">Departmental Net Pay vs Tax (Bar)</CardTitle></CardHeader>
                <CardContent className="p-4 h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={globalStats.deptData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                      <XAxis dataKey="name" tick={{fontSize: 12}} axisLine={false} tickLine={false}/>
                      <YAxis tickFormatter={(v)=>`₹${v/1000}k`} tick={{fontSize: 12}} axisLine={false} tickLine={false}/>
                      <RechartsTooltip formatter={(v:number)=>formatCurrency(v)} cursor={{fill: '#f8fafc'}}/>
                      <Legend />
                      <Bar dataKey="NetPay" fill="#10b981" radius={[4,4,0,0]} />
                      <Bar dataKey="Taxes" fill="#ef4444" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="bg-slate-50 border-b"><CardTitle className="text-sm font-bold text-slate-700">Budget Allocation Distribution (Pie)</CardTitle></CardHeader>
                <CardContent className="p-4 h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={globalStats.deptData} dataKey="NetPay" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} stroke="none">
                        {globalStats.deptData.map((e, i) => <Cell key={`cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip formatter={(v:number)=>formatCurrency(v)} />
                      <Legend layout="vertical" verticalAlign="middle" align="right"/>
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* FULL CORPORATE LEDGER WITH SMART FILTERS */}
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="bg-slate-50 border-b pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <CardTitle className="text-lg text-slate-800">Global Employee Payroll Ledger</CardTitle>
                  <p className="text-xs text-slate-500 mt-1">Click on any employee row to view analytics and adjust compensation.</p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                    <Input placeholder="Search name or role..." className="pl-9 h-9 text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  </div>
                  <Select value={filterDept} onValueChange={setFilterDept}>
                    <SelectTrigger className="h-9 w-full sm:w-[140px] text-sm">
                      <Filter className="w-4 h-4 mr-2 text-slate-500"/>
                      <SelectValue placeholder="Department" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueDepartments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={() => exportCSV(filteredData, "Global_Payroll.csv")} variant="outline" className="h-9 text-xs font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                    <Download className="w-4 h-4 mr-2" /> Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                      <TableRow>
                        <TableHead className="font-bold">Employee</TableHead>
                        <TableHead className="font-bold">Dept</TableHead>
                        <TableHead className="font-bold text-right text-slate-500">+ Base</TableHead>
                        <TableHead className="font-bold text-right text-emerald-600">+ Bonus</TableHead>
                        <TableHead className="font-bold text-right text-red-500">- Tax/Penalties</TableHead>
                        <TableHead className="font-bold text-right text-slate-900">Net Payable</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.map((p) => (
                        <TableRow key={p.id} onClick={() => { setSelectedEmp(p); setModalOpen(true); }} className="cursor-pointer hover:bg-slate-50 transition-colors">
                          <TableCell className="font-medium text-slate-900">
                            {p.name}
                            <div className="text-[10px] text-slate-500 uppercase">{p.role}</div>
                          </TableCell>
                          <TableCell className="text-slate-500 text-xs uppercase">{p.department}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(p.base)}</TableCell>
                          <TableCell className="text-right font-medium text-emerald-600">{formatCurrency(p.bonus)}</TableCell>
                          <TableCell className="text-right font-medium text-red-500">{formatCurrency(p.tax)}</TableCell>
                          <TableCell className="text-right font-black text-slate-900">{formatCurrency(p.netPay)}</TableCell>
                        </TableRow>
                      ))}
                      {filteredData.length === 0 && (
                         <TableRow><TableCell colSpan={6} className="text-center p-8 text-slate-500">No employees match your search criteria.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {myPayroll ? (
              <Card className="shadow-2xl border-0 overflow-hidden">
                <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-black">FWC Corporate Payslip</h2>
                    <p className="text-slate-400 mt-1">Official Earnings Record</p>
                  </div>
                  <Button onClick={() => exportCSV([myPayroll], "My_Payslip.csv")} className="bg-white text-slate-900 hover:bg-slate-100 font-bold">
                    <Download className="w-4 h-4 mr-2"/> Download Official PDF
                  </Button>
                </div>
                <CardContent className="p-8 space-y-8 bg-white">
                  <div className="flex justify-between pb-6 border-b border-slate-100">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Employee Name</p>
                      <p className="text-lg font-bold text-slate-800">{myPayroll.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Department & Role</p>
                      <p className="text-lg font-bold text-slate-800 uppercase">{myPayroll.department} | {myPayroll.role}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h3 className="font-black text-slate-800 border-b pb-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500"/> Positive Earnings</h3>
                      <div className="flex justify-between"><span className="text-slate-600">Base Salary</span><span className="font-medium">{formatCurrency(myPayroll.base)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600">HRA & Allowances</span><span className="font-medium">{formatCurrency(myPayroll.allowances)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600">Performance Bonus</span><span className="font-medium text-emerald-600">{formatCurrency(myPayroll.bonus)}</span></div>
                      <div className="flex justify-between font-bold pt-2 border-t"><span className="text-slate-800">Gross Earnings</span><span className="text-slate-800">{formatCurrency(myPayroll.gross)}</span></div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-black text-slate-800 border-b pb-2 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-red-500"/> Negative Deductions</h3>
                      <div className="flex justify-between"><span className="text-slate-600">Income Tax (TDS)</span><span className="font-medium text-red-500">{formatCurrency(myPayroll.tax)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600">Provident Fund (PF)</span><span className="font-medium text-red-500">{formatCurrency(myPayroll.providentFund)}</span></div>
                      <div className="flex justify-between font-bold pt-2 border-t"><span className="text-slate-800">Total Deductions</span><span className="text-red-600">{formatCurrency(myPayroll.tax + myPayroll.providentFund)}</span></div>
                    </div>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-xl flex justify-between items-center">
                    <span className="text-lg font-black text-emerald-800 uppercase tracking-widest">Net Payable Salary</span>
                    <span className="text-3xl font-black text-emerald-600">{formatCurrency(myPayroll.netPay)}</span>
                  </div>
                </CardContent>
              </Card>
            ) : (
               <div className="text-center p-12 text-slate-500">Payslip record not found for your account.</div>
            )}
          </div>
        )}

        {/* EMPLOYEE DOSSIER & COMPENSATION MODAL */}
        {modalOpen && selectedEmp && (
          <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <Card className="w-full max-w-3xl bg-white shadow-2xl border-0 overflow-hidden flex flex-col max-h-[90vh]">
              <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-xl font-black shadow-inner">
                    {selectedEmp.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black">{selectedEmp.name}</h2>
                    <p className="text-indigo-200 text-sm font-medium uppercase tracking-wider">{selectedEmp.role} | {selectedEmp.department}</p>
                  </div>
                </div>
                <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X className="w-6 h-6"/></button>
              </div>

              <CardContent className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                
                {/* Metrics Row */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 flex items-center gap-3">
                    <Calendar className="w-8 h-8 text-blue-500"/>
                    <div><p className="text-[10px] uppercase font-bold text-slate-400">Total Experience</p><p className="font-black text-slate-800">{selectedEmp.experience}</p></div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 flex items-center gap-3">
                    <TrendingUp className="w-8 h-8 text-emerald-500"/>
                    <div><p className="text-[10px] uppercase font-bold text-slate-400">Current Net Pay</p><p className="font-black text-emerald-600">{formatCurrency(selectedEmp.netPay)}</p></div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 flex items-center gap-3">
                    <UserCheck className="w-8 h-8 text-indigo-500"/>
                    <div><p className="text-[10px] uppercase font-bold text-slate-400">Join Date</p><p className="font-black text-slate-800">{selectedEmp.joinDate}</p></div>
                  </div>
                </div>

                {/* Performance Analytics Graph */}
                <div className="border border-slate-200 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-indigo-600"/> 6-Month Performance vs Morale</h3>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selectedEmp.performanceData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                        <XAxis dataKey="month" tick={{fontSize: 12}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fontSize: 12}} axisLine={false} tickLine={false} domain={[0, 100]}/>
                        <RechartsTooltip contentStyle={{fontSize: '12px'}}/>
                        <Legend wrapperStyle={{fontSize:'12px'}}/>
                        <Line type="monotone" dataKey="performance" name="Performance Score" stroke="#10b981" strokeWidth={3} dot={{r:4}} />
                        <Line type="monotone" dataKey="morale" name="Attendance & Morale" stroke="#3b82f6" strokeWidth={3} dot={{r:4}} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Compensation Adjustment Engine */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                  <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-slate-700"/> Adjust Compensation
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">Issue an immediate performance raise or attendance deduction. This will recalculate net pay instantly.</p>
                  
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-2.5 font-bold text-slate-400">₹</span>
                      <Input 
                        type="number" 
                        placeholder="Enter Amount" 
                        className="pl-8" 
                        value={adjustmentAmount} 
                        onChange={(e) => setAdjustmentAmount(e.target.value)}
                      />
                    </div>
                    <Button onClick={() => handleCompensationAdjustment('raise')} className="bg-emerald-600 hover:bg-emerald-700 font-bold">
                      <TrendingUp className="w-4 h-4 mr-2"/> Give Raise
                    </Button>
                    <Button onClick={() => handleCompensationAdjustment('deduction')} className="bg-red-600 hover:bg-red-700 font-bold">
                      <TrendingDown className="w-4 h-4 mr-2"/> Deduct
                    </Button>
                  </div>
                </div>

              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}