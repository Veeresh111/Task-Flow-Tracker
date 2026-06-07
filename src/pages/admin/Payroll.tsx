import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Loader2, Wallet, Download, TrendingUp, Building2, Briefcase, FileText, X, Landmark } from "lucide-react";

export default function UniversalPayroll() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [selectedSlip, setSelectedSlip] = useState<any>(null);

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
      
      // Determine MNC simulated salary metrics (Annual CTC in INR)
      const r = (userProfile.role || '').toLowerCase();
      let annualCTC = 600000; // Base Employee (6 LPA)
      if (r.includes('admin')) annualCTC = 1500000; // Admin (15 LPA)
      if (r.includes('lead') || r === 'tl') annualCTC = 1200000; // Team Lead (12 LPA)

      // Generate the last 6 months of Payslip History dynamically using precise Indian Corporate Math
      const generatedSlips = [];
      for (let i = 0; i < 6; i++) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        
        const monthlyCTC = Math.round(annualCTC / 12);
        
        // EARNINGS
        const basic = Math.round(monthlyCTC * 0.40); // Basic Pay is 40% of CTC
        const hra = Math.round(basic * 0.50); // HRA is 50% of Basic
        const lta = Math.round(monthlyCTC * 0.10); // Leave Travel Allowance
        const specialAllowance = Math.round(monthlyCTC * 0.10); 
        
        // Dynamic Variable Pay (Simulating 85% to 100% payout based on month)
        const performanceMultiplier = 0.85 + (Math.random() * 0.15);
        const variablePay = Math.round((monthlyCTC * 0.10) * performanceMultiplier); 

        const grossEarnings = basic + hra + lta + specialAllowance + variablePay;

        // DEDUCTIONS
        const pf = Math.round(basic * 0.12); // Employee PF Contribution (12% of Basic)
        const pt = 200; // Standard Professional Tax in Bangalore, Karnataka
        const tds = Math.round(grossEarnings * 0.15); // Simulated 15% Income Tax Bracket
        
        const totalDeductions = pf + pt + tds;
        const netPay = grossEarnings - totalDeductions;
        
        generatedSlips.push({
          id: `FWC-PS-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-${Math.floor(Math.random() * 9000) + 1000}`,
          month: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
          daysWorked: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
          earnings: { basic, hra, lta, specialAllowance, variablePay, gross: grossEarnings },
          deductions: { pf, pt, tds, total: totalDeductions },
          net: netPay,
          status: "Processed & Credited"
        });
      }
      setPayslips(generatedSlips);
    }
    setLoading(false);
  };

  const formatINR = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  };

  const handleDownloadCSV = (slip: any) => {
    const csvContent = `data:text/csv;charset=utf-8,FWC CORPORATE PAYSLIP\n` +
      `PAYSLIP ID,${slip.id}\nMONTH,${slip.month}\nEMPLOYEE,${profile.name}\nROLE,${profile.role}\n\n` +
      `EARNINGS,AMOUNT\nBasic Pay,${slip.earnings.basic}\nHRA,${slip.earnings.hra}\nLTA,${slip.earnings.lta}\nSpecial Allowance,${slip.earnings.specialAllowance}\nVariable Pay,${slip.earnings.variablePay}\nGROSS EARNINGS,${slip.earnings.gross}\n\n` +
      `DEDUCTIONS,AMOUNT\nProvident Fund (PF),${slip.deductions.pf}\nProfessional Tax (PT),${slip.deductions.pt}\nTDS (Income Tax),${slip.deductions.tds}\nTOTAL DEDUCTIONS,${slip.deductions.total}\n\n` +
      `NET PAY CREDITED,${slip.net}`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${slip.id}_Payslip.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!profile && !loading) return null;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
              <Wallet className="w-8 h-8 text-emerald-600" /> FWC Payroll Center
            </h1>
            <p className="text-slate-500 mt-1">Review your compensation structures, variable payouts, and corporate tax deductions.</p>
          </div>
          <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-slate-50 border border-slate-100 rounded-lg">
            {/* The Logo dynamically pulls from your public folder */}
            <img src="/fwc-logo.png" alt="FWC Logo" className="h-10 object-contain drop-shadow-sm" onError={(e) => (e.currentTarget.style.display = 'none')} />
            <div className="flex flex-col">
              <span className="text-sm font-black text-slate-800 tracking-tight">FWC India</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Bangalore HQ</span>
            </div>
          </div>
        </div>

        {loading ? <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-emerald-600" /></div> : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="shadow-sm border-slate-200 bg-white border-b-4 border-b-emerald-500">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="p-4 bg-emerald-50 text-emerald-600 rounded-full"><Landmark className="w-6 h-6"/></div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gross Monthly Earnings</p>
                    <h2 className="text-2xl font-black text-slate-800">{formatINR(payslips[0]?.earnings.gross)}</h2>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-slate-200 bg-white border-b-4 border-b-indigo-500">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full"><TrendingUp className="w-6 h-6"/></div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Latest Variable Payout</p>
                    <h2 className="text-2xl font-black text-slate-800">{formatINR(payslips[0]?.earnings.variablePay)}</h2>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-slate-200 bg-white border-b-4 border-b-blue-500">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="p-4 bg-blue-50 text-blue-600 rounded-full"><Briefcase className="w-6 h-6"/></div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">FWC Corporate Band</p>
                    <h2 className="text-lg font-black text-slate-800 uppercase line-clamp-1">{profile.role.replace("_", " ")}</h2>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-sm border-slate-200 bg-white">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-lg text-slate-800">Compensation Ledger</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="font-bold text-slate-700">Billing Period</TableHead>
                        <TableHead className="font-bold text-slate-700 text-center">Gross Earnings</TableHead>
                        <TableHead className="font-bold text-slate-700 text-center">Variable Payout</TableHead>
                        <TableHead className="font-bold text-red-600 text-center">Tax & Deductions</TableHead>
                        <TableHead className="font-bold text-emerald-700 text-center">Net Disbursed</TableHead>
                        <TableHead className="font-bold text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payslips.map(slip => (
                        <TableRow key={slip.id} className="hover:bg-slate-50/80 transition-colors">
                          <TableCell>
                            <div className="font-bold text-slate-900">{slip.month}</div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">ID: {slip.id}</div>
                          </TableCell>
                          <TableCell className="text-center font-medium text-slate-600">{formatINR(slip.earnings.gross)}</TableCell>
                          <TableCell className="text-center font-bold text-indigo-600">+{formatINR(slip.earnings.variablePay)}</TableCell>
                          <TableCell className="text-center font-bold text-red-500">-{formatINR(slip.deductions.total)}</TableCell>
                          <TableCell className="text-center font-black text-emerald-600">{formatINR(slip.net)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button onClick={() => setSelectedSlip(slip)} variant="outline" size="sm" className="h-8 text-xs text-blue-600 border-blue-200 hover:bg-blue-50">
                                <FileText className="w-3.5 h-3.5 mr-1" /> View Slip
                              </Button>
                            </div>
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

        {/* FWC PROFESSIONAL PAYSLIP MODAL */}
        {selectedSlip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <Card className="w-full max-w-3xl shadow-2xl border-none animate-in zoom-in-95 duration-200 overflow-hidden bg-white">
              
              {/* Slip Header */}
              <div className="border-b-4 border-emerald-600 p-8 flex justify-between items-start bg-slate-50">
                <div className="flex items-center gap-4">
                  <img src="/fwc-logo.png" alt="FWC" className="h-14 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">FWC India</h2>
                    <p className="text-sm text-slate-500 font-medium">Bangalore Headquarters, Karnataka</p>
                    <p className="text-xs text-slate-400 mt-1">Payslip for the month of <span className="font-bold text-slate-700">{selectedSlip.month}</span></p>
                  </div>
                </div>
                <div className="text-right">
                  <button onClick={() => setSelectedSlip(null)} className="text-slate-400 hover:bg-slate-200 p-1 rounded-full transition-colors mb-2"><X className="w-5 h-5"/></button>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Document ID</p>
                  <p className="text-sm font-mono font-bold text-slate-800">{selectedSlip.id}</p>
                </div>
              </div>

              {/* Slip Body */}
              <CardContent className="p-8">
                {/* Employee Details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                  <div><p className="text-[10px] font-bold text-slate-400 uppercase">Employee Name</p><p className="text-sm font-bold text-slate-800">{profile.name}</p></div>
                  <div><p className="text-[10px] font-bold text-slate-400 uppercase">Employee ID</p><p className="text-sm font-mono font-bold text-slate-800">{profile.id.split('-')[0].toUpperCase()}</p></div>
                  <div><p className="text-[10px] font-bold text-slate-400 uppercase">Department</p><p className="text-sm font-bold text-slate-800">{profile.department || 'Cross-Functional'}</p></div>
                  <div><p className="text-[10px] font-bold text-slate-400 uppercase">Pay Days</p><p className="text-sm font-bold text-slate-800">{selectedSlip.daysWorked}</p></div>
                </div>

                {/* Financial Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Earnings Column */}
                  <div>
                    <h3 className="font-black text-emerald-800 border-b-2 border-emerald-100 pb-2 mb-3 uppercase tracking-wider text-sm">Earnings</h3>
                    <div className="space-y-2.5 text-sm">
                      <div className="flex justify-between text-slate-600"><span className="font-medium">Basic Pay</span><span className="font-bold text-slate-900">{formatINR(selectedSlip.earnings.basic)}</span></div>
                      <div className="flex justify-between text-slate-600"><span className="font-medium">House Rent Allowance (HRA)</span><span className="font-bold text-slate-900">{formatINR(selectedSlip.earnings.hra)}</span></div>
                      <div className="flex justify-between text-slate-600"><span className="font-medium">Leave Travel Allowance (LTA)</span><span className="font-bold text-slate-900">{formatINR(selectedSlip.earnings.lta)}</span></div>
                      <div className="flex justify-between text-slate-600"><span className="font-medium">Special Allowance</span><span className="font-bold text-slate-900">{formatINR(selectedSlip.earnings.specialAllowance)}</span></div>
                      <div className="flex justify-between text-slate-600"><span className="font-medium">Variable Pay / Performance</span><span className="font-bold text-indigo-600">{formatINR(selectedSlip.earnings.variablePay)}</span></div>
                    </div>
                    <div className="mt-4 pt-3 border-t-2 border-slate-100 flex justify-between font-black text-slate-900 bg-slate-50 p-2 rounded">
                      <span>Total Earnings</span><span>{formatINR(selectedSlip.earnings.gross)}</span>
                    </div>
                  </div>

                  {/* Deductions Column */}
                  <div>
                    <h3 className="font-black text-red-800 border-b-2 border-red-100 pb-2 mb-3 uppercase tracking-wider text-sm">Deductions</h3>
                    <div className="space-y-2.5 text-sm">
                      <div className="flex justify-between text-slate-600"><span className="font-medium">Provident Fund (PF)</span><span className="font-bold text-slate-900">{formatINR(selectedSlip.deductions.pf)}</span></div>
                      <div className="flex justify-between text-slate-600"><span className="font-medium">Professional Tax (PT)</span><span className="font-bold text-slate-900">{formatINR(selectedSlip.deductions.pt)}</span></div>
                      <div className="flex justify-between text-slate-600"><span className="font-medium">TDS (Income Tax)</span><span className="font-bold text-slate-900">{formatINR(selectedSlip.deductions.tds)}</span></div>
                    </div>
                    <div className="mt-4 pt-3 border-t-2 border-slate-100 flex justify-between font-black text-red-600 bg-red-50 p-2 rounded">
                      <span>Total Deductions</span><span>{formatINR(selectedSlip.deductions.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Net Pay Footer */}
                <div className="mt-8 bg-emerald-600 text-white rounded-xl p-6 flex flex-col md:flex-row justify-between items-center shadow-lg">
                  <div>
                    <p className="text-emerald-100 text-sm font-bold uppercase tracking-wider">Net Pay Credited</p>
                    <p className="text-xs text-emerald-200 mt-0.5">Amount transferred to registered bank account.</p>
                  </div>
                  <h2 className="text-4xl font-black mt-2 md:mt-0">{formatINR(selectedSlip.net)}</h2>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <Button onClick={() => setSelectedSlip(null)} variant="outline" className="text-slate-600 border-slate-300">Close Viewer</Button>
                  <Button onClick={() => handleDownloadCSV(selectedSlip)} className="bg-slate-900 hover:bg-slate-800 text-white"><Download className="w-4 h-4 mr-2"/> Download Corporate CSV</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}