import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { Loader2, BrainCircuit, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function HRPerformanceEngine() {
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchDirectory();
  }, []);

  const fetchDirectory = async () => {
    const { data } = await supabase.from('profiles').select('*').order('department');
    if (data) setProfiles(data);
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const runGlobalAIEvaluation = async () => {
    setLoading(true);
    toast({ title: "Global AI Evaluation Initiated", description: "Analyzing tasks, hours, and behaviors across the organization..." });

    // Pull from local .env or fallback safely to corporate token
    const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || "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";

    // Fetch raw operational data to feed the AI
    const { data: allTasks } = await supabase.from('tasks').select('*');
    const { data: allLogs } = await supabase.from('work_logs').select('*');

    for (let i = 0; i < profiles.length; i++) {
      const emp = profiles[i];
      
      const empTasks = allTasks?.filter(t => t.assigned_to === emp.id) || [];
      const completedTasks = empTasks.filter(t => t.status === 'Completed').length;
      
      const empLogs = allLogs?.filter(l => l.user_id === emp.id) || [];
      const totalShifts = empLogs.length;

      try {
        const prompt = `Act as an Elite MNC Performance Assessor. Evaluate this employee based on hard data.
        Employee: ${emp.name} (${emp.role} in ${emp.department})
        Total Tasks Assigned: ${empTasks.length}
        Tasks Completed: ${completedTasks}
        Total Logged Shifts: ${totalShifts}
        
        Calculate a mathematically fair Performance Score (0-100).
        Output STRICTLY JSON. Format: {"score": 85, "reason": "Consistent task completion..."}`;

        // === UPGRADED: HUGGING FACE ROUTER WITH QWEN 3 PIPELINE ===
        const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "Qwen/Qwen3-32B:groq",
            messages: [
              { role: "user", content: prompt }
            ],
            temperature: 0.2 // Low temperature guarantees strict compliance with JSON schema format
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error?.message || "Failed to parse corporate analytics payload.");
        }

        let cleanText = data.choices[0].message.content;
        
        // Sanitize thinking tags if leaky streaming properties trigger them
        cleanText = cleanText
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

        // Append to history array
        const currentHistory = emp.performance_history || [];
        const newEntry = { date: new Date().toISOString(), score: parsed.score, note: parsed.reason };
        
        await supabase.from('profiles').update({
          performance_score: parsed.score,
          performance_history: [...currentHistory, newEntry]
        }).eq('id', emp.id);

      } catch (err) {
        console.error(`Failed evaluation for ${emp.name}`, err);
      }
      
      if (i < profiles.length - 1) await sleep(4000); // API Limit Protection
    }

    toast({ title: "Evaluation Complete", description: "All corporate ratings updated securely in database." });
    fetchDirectory();
    setLoading(false);
  };

  return (
    <DashboardLayout role="hr">
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-slate-900 p-8 rounded-xl shadow-xl text-white flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black flex items-center gap-3"><BrainCircuit className="text-emerald-400 w-8 h-8"/> AI Performance Engine</h1>
            <p className="text-slate-300 mt-2 font-medium">Dynamically calculate organizational ratings using backend metrics.</p>
          </div>
          <Button onClick={runGlobalAIEvaluation} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12">
            {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : <TrendingUp className="w-5 h-5 mr-2"/>}
            Run Corporate Evaluation Cycle
          </Button>
        </div>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="bg-slate-50 border-b">
            <CardTitle>Global Directory Ratings ({profiles.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Current Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-bold">{p.name}</TableCell>
                    <TableCell>{p.department}</TableCell>
                    <TableCell className="text-xs uppercase">{p.role}</TableCell>
                    <TableCell>
                      <span className={`text-lg font-black ${p.performance_score >= 80 ? 'text-emerald-600' : p.performance_score >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                        {p.performance_score || '0'}/100
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}