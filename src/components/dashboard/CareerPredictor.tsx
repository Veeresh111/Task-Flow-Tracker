import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, AlertTriangle, Sparkles, Target, Clock, CheckCircle2, TrendingDown, BookOpen } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { callCorporateAI } from "@/lib/ai";

const PIE_COLORS = ['#10b981', '#f43f5e', '#f59e0b', '#3b82f6'];

export function CareerPredictor({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [prediction, setPrediction] = useState<any>(null);
  
  // Real-world Data States for Analytics
  const [workHoursData, setWorkHoursData] = useState<any[]>([]);
  const [taskData, setTaskData] = useState<any[]>([]);
  const [contributionRate, setContributionRate] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    fetchAuthenticUserMetrics();
  }, [userId]);

  const fetchAuthenticUserMetrics = async () => {
    setFetchingData(true);
    try {
      // 1. Fetch Profile & Historical Ratings
      const { data: profData } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (profData) setProfile(profData);
      if (profData?.ai_career_prediction) setPrediction(profData.ai_career_prediction);

      // 2. Fetch ALL Work Logs for Login/Logout analytics (Last 7 Days)
      const { data: logs } = await supabase.from('work_logs').select('clock_in, clock_out').eq('user_id', userId).order('clock_in', { ascending: true });
      
      const dailyHours: Record<string, number> = {};
      if (logs) {
        logs.forEach(log => {
          if (log.clock_in && log.clock_out) {
            const date = new Date(log.clock_in).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            const hours = (new Date(log.clock_out).getTime() - new Date(log.clock_in).getTime()) / 3600000;
            dailyHours[date] = (dailyHours[date] || 0) + hours;
          }
        });
      }
      
      const formattedHours = Object.keys(dailyHours).slice(-7).map(date => ({
        date,
        hours: parseFloat(dailyHours[date].toFixed(1))
      }));
      setWorkHoursData(formattedHours);

      // 3. Fetch Tasks for Contribution Analytics
      const { data: tasks } = await supabase.from('tasks').select('status').eq('assigned_to', userId);
      if (tasks) {
        const completed = tasks.filter(t => t.status === 'Completed').length;
        const pending = tasks.filter(t => t.status !== 'Completed').length;
        const total = tasks.length;
        
        setTaskData([
          { name: 'Completed', value: completed },
          { name: 'Pending/In Progress', value: pending }
        ]);

        const rate = total > 0 ? (completed / total) * 100 : 0;
        setContributionRate(parseFloat(rate.toFixed(1)));
      }

    } catch (error) {
      console.error("Data Fetch Error:", error);
    }
    setFetchingData(false);
  };

  // === UPGRADED: HUGGING FACE ROUTER WITH QWEN 3 PIPELINE ===
  const generateDeepPrediction = async () => {
    if (!profile || !taskData) return;
    setLoading(true);
    toast({ title: "Analysis Started", description: "Analyzing your performance data..." });
    
    try {
      const prompt = `Act as an Elite MNC Predictive HR Algorithm. You must mathematically analyze the following exact database metrics for this employee.
      
      Employee: ${profile.name} (Role: ${profile.role})
      Current Performance Rating: ${profile.performance_score}/100
      Total Tasks Assigned: ${taskData.reduce((acc, curr) => acc + curr.value, 0)}
      Contribution/Completion Rate: ${contributionRate}%
      Average Daily Hours Logged: ${workHoursData.length > 0 ? (workHoursData.reduce((acc, curr) => acc + curr.hours, 0) / workHoursData.length).toFixed(1) : 0} hours/day
      
      Based on this data, output a STRICT JSON object answering these exact corporate points:
      {
        "promotion_verdict": "Deserves Promotion" or "Demotion Recommended" or "Maintain Current Level",
        "raise_verdict": "Deserves Raise", "Lower Salary", or "Hold Steady",
        "dry_promotion_chance": 85, 
        "layoff_risk": 15, 
        "training_required": true, 
        "training_topic": "If true, name a specific skill based on data, else 'None'",
        "overall_analysis": "3 sentences detailing their contribution rate vs hours logged."
      }`;

      const raw = await callCorporateAI({
        prompt,
        systemInstruction: "You are an Elite MNC Predictive HR Algorithm. Always output valid JSON.",
        response_format: { type: "json_object" }
      });

      let cleanText = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      const startIdx = cleanText.indexOf('{');
      const endIdx = cleanText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        cleanText = cleanText.substring(startIdx, endIdx + 1);
      }

      const parsed = JSON.parse(cleanText);

      setPrediction(parsed);
      await supabase.from('profiles').update({ ai_career_prediction: parsed }).eq('id', userId);
      toast({ title: "Analysis Complete", description: "Your career prediction has been updated." });
    } catch (e) {
      console.error(e);
      toast({ title: "AI Engine Error", description: "Could not compile prediction. Please try again.", variant: "destructive" });
    }
    setLoading(false);
  };

  if (fetchingData || !profile) {
    return (
      <Card className="shadow-lg border-indigo-100 bg-white min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </Card>
    );
  }

  const ratingHistoryData = (profile.performance_history || []).map((h: any, i: number) => ({
    name: `Cycle ${i+1}`,
    score: h.score
  }));

  return (
    <Card className="shadow-2xl border-slate-200 bg-white w-full">
      <CardHeader className="bg-slate-900 text-white rounded-t-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <CardTitle className="text-xl flex items-center gap-2"><Target className="w-5 h-5 text-emerald-400"/> AI Career & Rating Analytics</CardTitle>
          <p className="text-xs text-slate-400 mt-1">Real-time compilation of {profile.name}'s corporate footprint.</p>
        </div>
        <div className="flex items-center gap-4 bg-slate-800 p-2 rounded-lg border border-slate-700">
          <div className="text-center px-4 border-r border-slate-700">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Global Rating</p>
            <p className={`text-2xl font-black ${profile.performance_score >= 80 ? 'text-emerald-400' : profile.performance_score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {profile.performance_score || '0'}/100
            </p>
          </div>
          <div className="text-center px-4">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Contribution</p>
            <p className="text-2xl font-black text-blue-400">{contributionRate}%</p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-6 space-y-8">
        
        {/* ROW 1: Deep Data Charts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Chart 1: Login/Logout Hours */}
          <div className="md:col-span-1 space-y-2">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Clock className="w-3 h-3"/> Daily Active Hours</h4>
            <div className="h-48 bg-slate-50 rounded-xl p-2 border border-slate-100">
              {workHoursData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={workHoursData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{fontSize: 10}} axisLine={false} tickLine={false}/>
                    <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{fontSize:'12px', borderRadius:'8px'}}/>
                    <Bar dataKey="hours" name="Hours Logged" fill="#6366f1" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="h-full flex items-center justify-center text-xs font-bold text-slate-400">No shift logs found.</div>}
            </div>
          </div>

          {/* Chart 2: Task Contribution */}
          <div className="md:col-span-1 space-y-2">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Task Contribution</h4>
            <div className="h-48 bg-slate-50 rounded-xl p-2 border border-slate-100">
              {taskData[0]?.value > 0 || taskData[1]?.value > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={taskData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={5} dataKey="value" stroke="none">
                      {taskData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{fontSize:'12px', borderRadius:'8px'}}/>
                    <Legend wrapperStyle={{fontSize:'10px'}}/>
                  </PieChart>
                </ResponsiveContainer>
              ) : <div className="h-full flex items-center justify-center text-xs font-bold text-slate-400">No tasks assigned.</div>}
            </div>
          </div>

          {/* Chart 3: Historical Rating Trends */}
          <div className="md:col-span-1 space-y-2">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><TrendingUp className="w-3 h-3"/> Rating Trajectory</h4>
            <div className="h-48 bg-slate-50 rounded-xl p-2 border border-slate-100">
              {ratingHistoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ratingHistoryData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{fontSize: 10}} axisLine={false} tickLine={false}/>
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip contentStyle={{fontSize:'12px', borderRadius:'8px'}}/>
                    <Line type="monotone" dataKey="score" name="AI Score" stroke="#10b981" strokeWidth={3} dot={{r: 4, fill: '#10b981'}} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="h-full flex items-center justify-center text-xs font-bold text-slate-400">No past evaluations.</div>}
            </div>
          </div>

        </div>

        {/* ROW 2: AI Predictive Actions */}
        <div className="border-t border-slate-200 pt-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h3 className="text-lg font-black text-slate-800">Predictive Corporate Matrix</h3>
              <p className="text-xs font-medium text-slate-500">Calculates promotions, raises, layoffs, and dry promotions strictly from database records.</p>
            </div>
            <Button onClick={generateDeepPrediction} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11 w-full sm:w-auto shadow-md">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Sparkles className="w-4 h-4 mr-2"/>} Generate Latest AI Matrix
            </Button>
          </div>

          {prediction ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in zoom-in-95 duration-300">
              {/* Promotion / Demotion Card */}
              <div className={`p-4 rounded-xl border ${prediction.promotion_verdict.includes('Promotion') ? 'bg-emerald-50 border-emerald-200' : prediction.promotion_verdict.includes('Demotion') ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Hierarchy Action</p>
                <p className={`text-base font-black ${prediction.promotion_verdict.includes('Promotion') ? 'text-emerald-700' : prediction.promotion_verdict.includes('Demotion') ? 'text-red-700' : 'text-slate-700'}`}>
                  {prediction.promotion_verdict}
                </p>
              </div>

              {/* Salary Raise Card */}
              <div className={`p-4 rounded-xl border ${prediction.raise_verdict.includes('Raise') ? 'bg-emerald-50 border-emerald-200' : prediction.raise_verdict.includes('Lower') ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Financial Action</p>
                <p className={`text-base font-black ${prediction.raise_verdict.includes('Raise') ? 'text-emerald-700' : prediction.raise_verdict.includes('Lower') ? 'text-red-700' : 'text-slate-700'}`}>
                  {prediction.raise_verdict}
                </p>
              </div>

              {/* Layoff Risk Card */}
              <div className={`p-4 rounded-xl border ${prediction.layoff_risk >= 50 ? 'bg-red-50 border-red-200' : prediction.layoff_risk >= 20 ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1 flex items-center gap-1">Layoff Risk</p>
                <div className="flex items-end gap-2">
                  <p className={`text-2xl font-black ${prediction.layoff_risk >= 50 ? 'text-red-700' : prediction.layoff_risk >= 20 ? 'text-amber-700' : 'text-blue-700'}`}>{prediction.layoff_risk}%</p>
                  <p className="text-xs font-bold text-slate-500 mb-1">Probability</p>
                </div>
              </div>

              {/* Dry Promotion / Training Card */}
              <div className="p-4 rounded-xl border bg-slate-50 border-slate-200 flex flex-col justify-between">
                <div>
                   <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Dry Promotion Risk</p>
                   <p className="text-lg font-black text-slate-800">{prediction.dry_promotion_chance}%</p>
                </div>
                {prediction.training_required && (
                  <div className="mt-2 bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase px-2 py-1 rounded-sm flex items-center gap-1 border border-indigo-200">
                    <BookOpen className="w-3 h-3"/> Training: {prediction.training_topic}
                  </div>
                )}
              </div>
              
              {/* Overall AI Analysis Row */}
              <div className="col-span-2 md:col-span-4 bg-indigo-50 border border-indigo-100 rounded-xl p-5 shadow-inner mt-2">
                 <h4 className="text-xs font-black text-indigo-800 uppercase tracking-widest flex items-center gap-2 mb-2"><Sparkles className="w-4 h-4"/> AI Executive Summary (Qwen 3)</h4>
                 <p className="text-sm font-medium text-indigo-900 leading-relaxed">{prediction.overall_analysis}</p>
              </div>
            </div>
          ) : (
             <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-400 font-bold text-sm">
               Click "Generate Latest AI Matrix" to compile the predictive database report.
             </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
}