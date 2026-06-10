import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, BrainCircuit, FileQuestion, Share2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

// === Secure HF Configuration ===
const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";
const HF_TOKEN = import.meta.env.VITE_HF_TOKEN;

const HF_MODEL = "Qwen/Qwen3-32B:groq";

export default function AssessmentCenter() {
  const { toast } = useToast();
  const [aiLoading, setAiLoading] = useState(false);
  const [assessmentTitle, setAssessmentTitle] = useState("");
  const [assessmentDifficulty, setAssessmentDifficulty] = useState("Intermediate");
  const [questionCount, setQuestionCount] = useState(15);        // New
  const [passingScore, setPassingScore] = useState(70);          // New
  const [durationMinutes, setDurationMinutes] = useState(60);    // New
  const [assessmentQuestions, setAssessmentQuestions] = useState<any[] | null>(null);
  const [publishedAssessments, setPublishedAssessments] = useState<any[]>([]);
  const [jdText, setJdText] = useState("");

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const callHF = async (prompt: string) => {
    let attempt = 0;
    const maxRetries = 3;

    while (attempt < maxRetries) {
      try {
        const response = await fetch(HF_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${HF_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: HF_MODEL,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
            max_tokens: 4096,
          }),
        });

        if (!response.ok) throw new Error(`HF API error: ${response.status}`);

        const data = await response.json();
        return data.choices?.[0]?.message?.content ?? "";
      } catch (e: any) {
        attempt++;
        if (attempt >= maxRetries) throw e;
        await sleep(4000 * attempt);
      }
    }
    return "";
  };

  useEffect(() => {
    fetchPublishedAssessments();
  }, []);

  const fetchPublishedAssessments = async () => {
    try {
      const { data, error } = await supabase
        .from('assessments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setPublishedAssessments(data);
    } catch (e: any) {
      console.error("Failed to load published assessments:", e);
    }
  };

  const generateAssessment = async () => {
    if (!HF_TOKEN) {
      toast({
        title: "AI Configuration Error",
        description: "Missing HuggingFace token. Check VITE_HF_TOKEN in your .env file.",
        variant: "destructive"
      });
      return;
    }

    if (!assessmentTitle || !jdText) {
      return toast({ title: "Fields Required", description: "Assessment Title and JD are required.", variant: "destructive" });
    }

    setAiLoading(true);
    try {
      const prompt = `Act as an elite MNC Technical Assessor.
Role: "${assessmentTitle}"
Job Description: "${jdText}"
Difficulty Level: "${assessmentDifficulty}"
Number of Questions: ${questionCount}

Create a highly professional ${questionCount}-question multiple-choice assessment directly based on the technical skills required in the JD.
Output STRICTLY as a raw JSON array. No markdown, no backticks.
Format:
[
  {
    "question": "Clear, detailed technical or aptitude question here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "Option B"
  }
]`;

      const result = await callHF(prompt);
      let cleanText = result.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
      
      const startIdx = cleanText.indexOf('[');
      const endIdx = cleanText.lastIndexOf(']');
      if (startIdx !== -1 && endIdx !== -1) {
        cleanText = cleanText.substring(startIdx, endIdx + 1);
      }

      setAssessmentQuestions(JSON.parse(cleanText));
      toast({ title: "Assessment Generated", description: `Generated ${questionCount} questions. Review and edit before publishing.` });
    } catch (e) {
      toast({ title: "AI Compilation Interrupted", description: "Failed to generate assessment. Please try again.", variant: "destructive" });
    }
    setAiLoading(false);
  };

  const handleManualQuestionEdit = (index: number, key: string, value: any) => {
    if (!assessmentQuestions) return;
    const updated = [...assessmentQuestions];
    if (key === "options") {
      updated[index][key] = value;
    } else {
      updated[index][key] = value;
    }
    setAssessmentQuestions(updated);
  };

  const isValidAssessment = (questions: any[]) => {
    return questions.every(q => 
      q.question?.trim() && 
      Array.isArray(q.options) && 
      q.options.length === 4 && 
      q.options.every((opt: string) => opt?.trim()) &&
      q.correctAnswer?.trim()
    );
  };

  const publishAssessment = async () => {
    if (!assessmentQuestions || !assessmentTitle) {
      return toast({ title: "Incomplete Assessment", variant: "destructive" });
    }

    if (!isValidAssessment(assessmentQuestions)) {
      return toast({ 
        title: "Validation Failed", 
        description: "Please ensure all questions have 4 options and a correct answer.", 
        variant: "destructive" 
      });
    }

    setAiLoading(true);
    try {
      const { data, error } = await supabase
        .from('assessments')
        .insert([{
          title: assessmentTitle,
          jd_text: jdText,
          difficulty: assessmentDifficulty,
          questions: assessmentQuestions,
          passing_score: passingScore,
          duration_minutes: durationMinutes,
          question_count: questionCount,
          status: 'Active'
        }])
        .select()
        .single();

      if (error) throw error;

      const publicLink = `${window.location.origin}/assessment/${data.id}`;
      
      setPublishedAssessments(prev => [{
        id: data.id,
        title: assessmentTitle,
        difficulty: assessmentDifficulty,
        passing_score: passingScore,
        duration_minutes: durationMinutes,
        link: publicLink,
        created_at: new Date().toISOString()
      }, ...prev]);

      toast({ 
        title: "Assessment Published!", 
        description: `Live link: ${publicLink}` 
      });

      setAssessmentQuestions(null);
      setAssessmentTitle("");
      setJdText("");
    } catch (e: any) {
      toast({ 
        title: "Database Error", 
        description: e.message || "Failed to publish assessment.", 
        variant: "destructive" 
      });
    }
    setAiLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-indigo-600"/> Question Framing Config
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <Input 
              placeholder="Assessment Title" 
              value={assessmentTitle} 
              onChange={e => setAssessmentTitle(e.target.value)} 
              className="bg-white" 
            />

            <div className="grid grid-cols-2 gap-3">
              <Select value={assessmentDifficulty} onValueChange={setAssessmentDifficulty}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Beginner">Beginner</SelectItem>
                  <SelectItem value="Intermediate">Intermediate</SelectItem>
                  <SelectItem value="Expert">Expert</SelectItem>
                </SelectContent>
              </Select>

              <Select value={questionCount.toString()} onValueChange={(v) => setQuestionCount(Number(v))}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Questions" />
                </SelectTrigger>
                <SelectContent>
                  {[10, 12, 15, 20].map(n => (
                    <SelectItem key={n} value={n.toString()}>{n} Questions</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Passing Score (%)</label>
                <Input 
                  type="number" 
                  value={passingScore} 
                  onChange={e => setPassingScore(Number(e.target.value))} 
                  className="bg-white" 
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Duration (minutes)</label>
                <Input 
                  type="number" 
                  value={durationMinutes} 
                  onChange={e => setDurationMinutes(Number(e.target.value))} 
                  className="bg-white" 
                />
              </div>
            </div>

            <Textarea 
              placeholder="Paste target profile requirement mapping vectors / Job Description..." 
              className="h-32 text-sm bg-white" 
              value={jdText} 
              onChange={e => setJdText(e.target.value)} 
            />

            <Button 
              onClick={generateAssessment} 
              disabled={aiLoading} 
              className="w-full bg-indigo-600 text-white font-bold"
            >
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <BrainCircuit className="w-4 h-4 mr-2"/>} 
              Generate {questionCount} Questions
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50 border-b flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <FileQuestion className="w-4 h-4 text-indigo-600"/> Generated Question Ledger
            </CardTitle>
            {assessmentQuestions && (
              <Button 
                onClick={publishAssessment} 
                disabled={aiLoading}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Share2 className="w-4 h-4 mr-2"/> Publish Assessment
              </Button>
            )}
          </CardHeader>
          
          <CardContent className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
            {assessmentQuestions?.map((q, i) => (
              <div key={i} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-indigo-600 mt-1">Q{i+1}.</span>
                  <Textarea
                    value={q.question}
                    onChange={(e) => handleManualQuestionEdit(i, "question", e.target.value)}
                    className="text-sm font-medium bg-white min-h-[60px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {q.options?.map((o: string, idx: number) => (
                    <Input
                      key={idx}
                      value={o}
                      onChange={(e) => {
                        const newOptions = [...(q.options || [])];
                        newOptions[idx] = e.target.value;
                        handleManualQuestionEdit(i, "options", newOptions);
                      }}
                      className="bg-white"
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Correct Answer:</span>
                  <Select 
                    value={q.correctAnswer} 
                    onValueChange={(v) => handleManualQuestionEdit(i, "correctAnswer", v)}
                  >
                    <SelectTrigger className="w-48 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {q.options?.map((opt: string, idx: number) => (
                        <SelectItem key={idx} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )) || (
              <p className="text-slate-400 text-xs italic text-center p-12">
                Generate an assessment to begin. Questions will be editable here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Published Assessments */}
      {publishedAssessments.length > 0 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50 border-b">
            <CardTitle className="text-sm font-bold">Published Assessments</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid gap-3">
              {publishedAssessments.map((ass) => (
                <div key={ass.id} className="flex justify-between items-center p-3 bg-white border rounded-lg">
                  <div>
                    <p className="font-medium">{ass.title}</p>
                    <p className="text-xs text-slate-500">
                      {ass.difficulty} • {ass.question_count} Qs • {ass.duration_minutes} min • Pass: {ass.passing_score}%
                    </p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href={ass.link} target="_blank" rel="noopener noreferrer">
                      View Live
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}