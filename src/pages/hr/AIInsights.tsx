import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, BrainCircuit, TrendingUp, Users, Target } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { callCorporateAI } from "@/lib/ai";

export default function HRAIInsights() {
  const [prompt, setPrompt] = useState("");
  const [insight, setInsight] = useState("");
  const [loading, setLoading] = useState(false);

  const generateInsight = async (type: string, customPrompt?: string) => {
    setLoading(true);
    try {
      let basePrompt = "";
      if (type === "attrition") basePrompt = "Analyze the FWC global database for employee attrition patterns. Identify the top 2 reasons employees leave within the first 6 months and suggest actionable retention strategies.";
      else if (type === "hiring") basePrompt = "Analyze our current talent acquisition funnel. Provide a 3-point strategy on how to reduce Time-To-Hire by 20% while maintaining candidate quality.";
      else if (type === "diversity") basePrompt = "Evaluate our corporate Diversity, Equity, and Inclusion (DEI) metrics. Suggest 3 specific initiatives to improve leadership diversity over the next 4 quarters.";
      else basePrompt = `As an Elite HR Executive AI: ${customPrompt}`;

      // Fetch real data from database for context
      const { count: profileCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { data: recentLogs } = await supabase.from('work_logs').select('created_at').limit(5);
      const dataContext = `\n\nReal organizational data — Active profiles: ${profileCount ?? 'N/A'}, Recent work log entries: ${recentLogs?.length ?? 0}.`;

      const result = await callCorporateAI({
        prompt: basePrompt + dataContext,
        systemInstruction: "You are an elite HR executive AI assistant."
      });

      setInsight(result);
    } catch (e: any) {
      console.error("AI Insight Core Failure:", e);
      setInsight("Error connecting to FWC AI Neural Engine.");
    }
    setLoading(false);
  };

  return (
    <DashboardLayout role="hr">
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 bg-gradient-to-r from-slate-900 to-indigo-900 text-white">
          <h1 className="text-3xl font-black flex items-center gap-3"><BrainCircuit className="w-8 h-8 text-indigo-400"/> FWC Neural HR Insights</h1>
          <p className="text-indigo-200 mt-2 font-medium">Predictive corporate analytics and strategic human capital intelligence.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="hover:shadow-md transition-all cursor-pointer border-slate-200" onClick={() => generateInsight('attrition')}>
            <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
              <div className="p-3 bg-red-100 text-red-600 rounded-full"><TrendingUp className="w-6 h-6"/></div>
              <h3 className="font-bold text-slate-800">Predictive Attrition</h3>
              <p className="text-xs text-slate-500">AI Prediction — Analyze flight risks and generate retention strategies.</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-all cursor-pointer border-slate-200" onClick={() => generateInsight('hiring')}>
            <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-full"><Target className="w-6 h-6"/></div>
              <h3 className="font-bold text-slate-800">Acquisition Velocity</h3>
              <p className="text-xs text-slate-500">AI Recommendation — Optimize pipeline to reduce Time-To-Hire metrics.</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-all cursor-pointer border-slate-200" onClick={() => generateInsight('diversity')}>
            <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
              <div className="p-3 bg-purple-100 text-purple-600 rounded-full"><Users className="w-6 h-6"/></div>
              <h3 className="font-bold text-slate-800">DEI Matrix</h3>
              <p className="text-xs text-slate-500">AI Prediction — Evaluate and improve leadership diversity metrics.</p>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="bg-slate-50 border-b pb-4">
            <CardTitle className="text-lg text-slate-800 flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-600"/> Custom Neural Query</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <Textarea placeholder="E.g., Design a modern compensation strategy to retain senior developers..." className="h-32 resize-none" value={prompt} onChange={e=>setPrompt(e.target.value)} />
            <Button onClick={() => generateInsight('custom', prompt)} disabled={!prompt || loading} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold h-12">
              {loading ? <Loader2 className="w-5 h-5 animate-spin"/> : "Generate Analysis"}
            </Button>
          </CardContent>
        </Card>

        {insight && (
          <Card className="shadow-xl border-indigo-200 bg-gradient-to-br from-indigo-50 to-white animate-in slide-in-from-bottom-4">
            <CardHeader className="border-b border-indigo-100 pb-4">
              <CardTitle className="text-lg text-indigo-900 flex items-center gap-2"><BrainCircuit className="w-5 h-5"/> AI Strategic Output (Qwen 3)</CardTitle>
            </CardHeader>
            <CardContent className="p-8 whitespace-pre-wrap text-slate-700 leading-relaxed font-medium text-sm">
              {insight}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}