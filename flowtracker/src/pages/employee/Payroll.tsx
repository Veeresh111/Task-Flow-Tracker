import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Loader2, Wallet, Download, TrendingUp, DollarSign, Briefcase } from "lucide-react";

export default function UniversalPayroll() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [payslips, setPayslips] = useState<any[]>([]);

  useEffect(() => {
    fetchPayrollData();
  }, []);

  const fetchPayrollData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (userProfile) {
      setProfile(userProfile);
      
      // Determine simulated salary metrics based on User's secure Role
      const r = (userProfile.role || '').toLowerCase();
      let baseSalary = 65000;
      if (r.includes('admin')) baseSalary = 125000;
      if (r.includes('lead') || r === 'tl') baseSalary = 95000;

      // Generate the last 6 months of Payslip History dynamically
      const generatedSlips = [];
      for (let i = 0; i < 6; i++) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        
        const monthlyBase = Math.round(baseSalary / 12);
        const allowances = Math.round(monthlyBase * 0.15); // Standard 15% allowance rate
        const taxDeduction = Math.round(monthlyBase * 0.22); // Simulated 22% tax bracket
        
        generatedSlips.push({
          id: `PS-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-${Math.floor(Math.random() * 9000) + 1000}`,
          month: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
          base: monthlyBase,
          allowances: allowances,
          deductions: taxDeduction,
          net: monthlyBase + allowances - taxDeduction,
          status: "Processed"
        });
      }
      setPayslips(generatedSlips);
    }
    setLoading(false);
  };

  const handleDownload = (slip: any) => {
    // Generates a local CSV payload to simulate downloading a secure PDF Payslip
    const csvContent = `data:text/csv;charset=utf-8,PAYSLIP ID,MONTH,BASE SALARY,ALLOWANCES,TAX DEDUCTIONS,NET PAY\n"${slip.id}","${slip.month}",$${slip.base},$${slip.allowances},-$${slip.deductions},$${slip.net}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Payslip_${slip.month.replace(" ", "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Prevent UI rendering before role check is complete
  if (!profile && !loading) return null;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Wallet className="w-8 h-8 text-emerald-600" /> Payroll & Compensation
          </h1>
          <p className="text-slate-500 mt-1">Review your corporate compensation matrix, allowances, and download historic payslips.</p>
        </div>

        {loading ? <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-emerald-600" /></div> : (
          <>
            {/* Compensation Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="shadow-sm border-slate-200 bg-white">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="p-4 bg-emerald-50 text-emerald-600 rounded-full"><DollarSign className="w-6 h-6"/></div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Annual Base Salary</p>
                    <h2 className="text-3xl font-black text-slate-800">${(payslips[0]?.base * 12).toLocaleString()}</h2>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-slate-200 bg-white">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full"><TrendingUp className="w-6 h-6"/></div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Est. Annual Supplements</p>
                    <h2 className="text-3xl font-black text-slate-800">${(payslips[0]?.allowances * 12).toLocaleString()}</h2>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-slate-200 bg-white">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="p-4 bg-blue-50 text-blue-600 rounded-full"><Briefcase className="w-6 h-6"/></div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pay Grade Track</p>
                    <h2 className="text-xl font-black text-slate-800 uppercase line-clamp-1">{profile.role.replace("_", " ")}</h2>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Payslip History Table */}
            <Card className="shadow-sm border-slate-200 bg-white">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-lg text-slate-800">Historic Compensation Records</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="font-bold text-slate-700">Billing Period</TableHead>
                        <TableHead className="font-bold text-slate-700 text-center">Gross Base</TableHead>
                        <TableHead className="font-bold text-slate-700 text-center">Supplements</TableHead>
                        <TableHead className="font-bold text-red-600 text-center">Tax Withholding</TableHead>
                        <TableHead className="font-bold text-emerald-700 text-center">Net Disbursed</TableHead>
                        <TableHead className="font-bold text-right">Document</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payslips.map(slip => (
                        <TableRow key={slip.id} className="hover:bg-slate-50/80 transition-colors">
                          <TableCell>
                            <div className="font-bold text-slate-900">{slip.month}</div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">ID: {slip.id}</div>
                          </TableCell>
                          <TableCell className="text-center font-medium text-slate-600">${slip.base.toLocaleString()}</TableCell>
                          <TableCell className="text-center font-medium text-blue-600">+${slip.allowances.toLocaleString()}</TableCell>
                          <TableCell className="text-center font-bold text-red-500">-${slip.deductions.toLocaleString()}</TableCell>
                          <TableCell className="text-center font-black text-emerald-600">${slip.net.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <Button onClick={() => handleDownload(slip)} variant="outline" size="sm" className="h-8 text-xs bg-white hover:bg-slate-100 text-slate-700 border-slate-300 font-bold shadow-sm">
                              <Download className="w-3.5 h-3.5 mr-2" /> Download Slip
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}