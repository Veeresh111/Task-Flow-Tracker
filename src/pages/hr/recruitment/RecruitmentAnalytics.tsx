import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { Loader2, Users, Calendar, CheckCircle, XCircle, TrendingUp, DollarSign, Clock } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444"];

export default function RecruitmentAnalytics() {
  const [loading, setLoading] = useState(true);
  const [pipelineData, setPipelineData] = useState<any[]>([]);
  const [monthlyHires, setMonthlyHires] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({
    totalApplicants: 0,
    totalInterviews: 0,
    totalOffers: 0,
    totalHired: 0,
    offerAcceptanceRate: 0,
    interviewPassRate: 0,
    avgTimeToHire: 0
  });

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const { data: allApps } = await supabase.from("job_applications").select("status, created_at, candidate_id");

      if (!allApps) return;

      const stageCounts: Record<string, number> = {};
      let offerAccepted = 0;
      let offerDeclined = 0;
      let totalOffersMade = 0;
      let interviewCleared = 0;
      let interviewTotal = 0;
      let totalDaysToHire = 0;
      let hiredCount = 0;

      const monthlyBuckets: Record<string, { hired: number; applied: number }> = {};

      for (const app of allApps) {
        const status = app.status || "Applied";
        stageCounts[status] = (stageCounts[status] || 0) + 1;

        if (status === "Offer Accepted") offerAccepted++;
        if (status === "Offer Declined") offerDeclined++;
        if (status === "Offer Generated" || status === "Offer Accepted") totalOffersMade++;

        if (app.created_at) {
          const month = new Date(app.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short" });
          if (!monthlyBuckets[month]) monthlyBuckets[month] = { hired: 0, applied: 0 };
          monthlyBuckets[month].applied++;
        }
      }

      // Interview and time-to-hire from interview_sessions
      const { data: sessions } = await supabase.from("interview_sessions").select("created_at, status, application_id");
      if (sessions) {
        interviewTotal = sessions.length;
        interviewCleared = sessions.filter(s => s.status === "Completed").length;
      }

      // Time-to-hire from candidate_onboarding
      const { data: onboardings } = await supabase
        .from("candidate_onboarding")
        .select("created_at, candidate_id");

      if (onboardings) {
        hiredCount = onboardings.length;
        for (const ob of onboardings) {
          if (ob.created_at) {
            const month = new Date(ob.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short" });
            if (!monthlyBuckets[month]) monthlyBuckets[month] = { hired: 0, applied: 0 };
            monthlyBuckets[month].hired++;
          }
          // Find application for this candidate to calc time-to-hire
          const app = allApps.find(a => a.candidate_id === ob.candidate_id);
          if (app?.created_at) {
            const days = Math.round((new Date(ob.created_at).getTime() - new Date(app.created_at).getTime()) / (1000 * 60 * 60 * 24));
            totalDaysToHire += days;
          }
        }
      }

      const pipelineStages = [
        { name: "Applied/Screening", value: (stageCounts["Applied"] || 0) + (stageCounts["Screening"] || 0), fill: "#6366f1" },
        { name: "Shortlisted", value: (stageCounts["Shortlisted"] || 0) + (stageCounts["ATS Shortlisted"] || 0) + (stageCounts["Recruiter Screening"] || 0), fill: "#8b5cf6" },
        { name: "Assessment", value: (stageCounts["Assessment Assigned"] || 0) + (stageCounts["Assessment Passed"] || 0) + (stageCounts["Assessment Completed"] || 0), fill: "#ec4899" },
        { name: "Interview", value: (stageCounts["Interview Scheduled"] || 0) + (stageCounts["Interview Cleared"] || 0), fill: "#f59e0b" },
        { name: "Offer", value: totalOffersMade, fill: "#10b981" },
        { name: "Hired", value: hiredCount, fill: "#3b82f6" },
        { name: "Rejected", value: (stageCounts["Rejected"] || 0) + (stageCounts["Offer Declined"] || 0), fill: "#ef4444" },
      ];

      setPipelineData(pipelineStages);
      setMonthlyHires(Object.entries(monthlyBuckets).map(([month, data]) => ({ month, ...data })));

      setMetrics({
        totalApplicants: allApps.length,
        totalInterviews: interviewTotal,
        totalOffers: totalOffersMade,
        totalHired: hiredCount,
        offerAcceptanceRate: totalOffersMade > 0 ? Math.round((offerAccepted / totalOffersMade) * 100) : 0,
        interviewPassRate: interviewTotal > 0 ? Math.round((interviewCleared / interviewTotal) * 100) : 0,
        avgTimeToHire: hiredCount > 0 ? Math.round(totalDaysToHire / hiredCount) : 0
      });
    } catch (err) {
      console.error("Analytics fetch error:", err);
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Recruitment Analytics</h1>
        <p className="text-slate-500 mt-1">Pipeline metrics, hiring trends, and recruitment KPIs.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <Users className="w-5 h-5 text-indigo-600 mb-2" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Applicants</p>
            <h2 className="text-2xl font-black mt-1">{metrics.totalApplicants}</h2>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Calendar className="w-5 h-5 text-amber-600 mb-2" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Interviews</p>
            <h2 className="text-2xl font-black mt-1">{metrics.totalInterviews}</h2>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <CheckCircle className="w-5 h-5 text-emerald-600 mb-2" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Offer Acceptance</p>
            <h2 className="text-2xl font-black mt-1">{metrics.offerAcceptanceRate}%</h2>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Clock className="w-5 h-5 text-purple-600 mb-2" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg Time-to-Hire</p>
            <h2 className="text-2xl font-black mt-1">{metrics.avgTimeToHire} <span className="text-sm font-bold text-slate-400">days</span></h2>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <CheckCircle className="w-5 h-5 text-emerald-600 mb-2" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Interview Pass Rate</p>
            <h2 className="text-2xl font-black mt-1">{metrics.interviewPassRate}%</h2>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <TrendingUp className="w-5 h-5 text-blue-600 mb-2" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Hired</p>
            <h2 className="text-2xl font-black mt-1">{metrics.totalHired}</h2>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Funnel Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Hiring Pipeline Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={12} width={120} />
                <RechartsTooltip />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {pipelineData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Monthly Hiring Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Monthly Hiring Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyHires} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <RechartsTooltip />
                  <Legend />
                  <Bar dataKey="applied" name="Applied" fill="#6366f1" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="hired" name="Hired" fill="#10b981" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Distribution Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pipeline Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pipelineData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {pipelineData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Source Effectiveness */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sourcing Channel Effectiveness</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Source tracking requires applications to include a `source` field. Currently shows direct/in-app applications.</p>
        </CardContent>
      </Card>
    </div>
  );
}
