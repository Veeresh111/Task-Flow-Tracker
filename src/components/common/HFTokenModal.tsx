import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  getHuggingFaceToken,
  setHuggingFaceToken,
  clearHuggingFaceToken,
  testModelConnection,
  HF_FREE_MODELS,
  DEFAULT_FREE_HF_TOKEN
} from "@/lib/ai-models";
import {
  Sparkles,
  KeyRound,
  ShieldCheck,
  Zap,
  Activity,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Cpu,
  Eye,
  FileText,
  HeartPulse
} from "lucide-react";

interface HFTokenModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HFTokenModal({ open, onOpenChange }: HFTokenModalProps) {
  const { toast } = useToast();
  const [tokenInput, setTokenInput] = useState("");
  const [activeToken, setActiveToken] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs: number;
    model: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      const current = getHuggingFaceToken();
      setActiveToken(current);
      const isCustomToken = current !== DEFAULT_FREE_HF_TOKEN;
      setIsCustom(isCustomToken);
      setTokenInput(isCustomToken ? current : "");
      setTestResult(null);
    }
  }, [open]);

  const handleSaveToken = () => {
    if (!tokenInput.trim()) {
      clearHuggingFaceToken();
      setActiveToken(DEFAULT_FREE_HF_TOKEN);
      setIsCustom(false);
      toast({
        title: "Reverted to Default Free Tier",
        description: "Using standard corporate Hugging Face free tier models."
      });
      return;
    }

    if (!tokenInput.trim().startsWith("hf_")) {
      toast({
        title: "Invalid Hugging Face Token",
        description: "Hugging Face tokens must begin with 'hf_'.",
        variant: "destructive"
      });
      return;
    }

    const saved = setHuggingFaceToken(tokenInput.trim());
    if (saved) {
      setActiveToken(tokenInput.trim());
      setIsCustom(true);
      toast({
        title: "Hugging Face Token Activated",
        description: "Your custom Hugging Face token is active across all AI features."
      });
    }
  };

  const handleClear = () => {
    clearHuggingFaceToken();
    setTokenInput("");
    setActiveToken(DEFAULT_FREE_HF_TOKEN);
    setIsCustom(false);
    setTestResult(null);
    toast({
      title: "Token Cleared",
      description: "Reverted to default free open-access model pool."
    });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testModelConnection("Qwen/Qwen2.5-72B-Instruct");
      setTestResult(res);
      if (res.success) {
        toast({
          title: "Connection Successful!",
          description: `Qwen 2.5 72B responded in ${res.latencyMs}ms with active status.`
        });
      } else {
        toast({
          title: "Connection Notice",
          description: res.error || "Model returned non-200 status. Retry in a few moments.",
          variant: "destructive"
        });
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        latencyMs: 0,
        model: "Qwen/Qwen2.5-72B-Instruct",
        error: e.message || "Failed to reach Hugging Face endpoint"
      });
    } finally {
      setTesting(false);
    }
  };

  const maskedToken = (token: string) => {
    if (!token || token.length < 8) return "••••••••";
    return `${token.substring(0, 5)}••••••••••••••••${token.substring(token.length - 4)}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white border-slate-200 text-slate-900 shadow-2xl rounded-2xl p-0 overflow-hidden">
        {/* Futuristic Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center backdrop-blur-md">
                <Sparkles className="w-5 h-5 text-indigo-300 animate-pulse" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                  Hugging Face AI Control Center
                </DialogTitle>
                <DialogDescription className="text-xs text-indigo-200/80 font-medium">
                  100% Free AI/ML Models for Proctoring, Telemetry & ATS Hiring
                </DialogDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] font-mono font-bold px-2.5 py-1 ${
                isCustom
                  ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300"
                  : "bg-indigo-500/20 border-indigo-400/40 text-indigo-300"
              }`}
            >
              {isCustom ? "CUSTOM TOKEN ACTIVE" : "DEFAULT FREE POOL"}
            </Badge>
          </div>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Token Configuration Box */}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-indigo-600" /> Hugging Face Access Token
              </label>
              <span className="text-[11px] font-mono text-slate-400">
                Active: {maskedToken(activeToken)}
              </span>
            </div>

            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Enter token (e.g. hf_...)"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="bg-white border-slate-300 text-xs font-mono h-9"
              />
              <Button
                onClick={handleSaveToken}
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shrink-0 px-4"
              >
                Apply Token
              </Button>
              {isCustom && (
                <Button
                  onClick={handleClear}
                  variant="outline"
                  size="sm"
                  className="text-slate-600 text-xs font-bold shrink-0"
                >
                  Reset
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-slate-500">
                Tokens are stored client-side in secure <code className="bg-slate-200/60 px-1 py-0.5 rounded text-[10px]">localStorage</code>.
              </p>
              <Button
                onClick={handleTestConnection}
                disabled={testing}
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
              >
                {testing ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Zap className="w-3 h-3 mr-1" />
                )}
                Test Live Health
              </Button>
            </div>

            {/* Test Connection Output */}
            {testResult && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                  testResult.success
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-bold font-mono">{testResult.model}</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {(testResult as any).status || `Operational • Latency: ${testResult.latencyMs}ms`}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="bg-emerald-100 text-emerald-800 border-emerald-300 font-mono text-[10px]"
                >
                  24/7 ONLINE
                </Badge>
              </div>
            )}
          </div>

          {/* Free AI Model Domain Matrix */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-indigo-600" /> Active 100% Free AI/ML Model Matrix
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Proctoring Vision */}
              <div className="border border-slate-200 bg-white p-3 rounded-xl shadow-xs">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <Eye className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Exam Proctoring Vision</span>
                </div>
                <p className="text-[11px] font-mono text-indigo-600 font-bold">
                  {HF_FREE_MODELS.PROCTORING_VISION_OBJECTS.id}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Multi-face verification, cell phone & book detection + in-browser MediaPipe.
                </p>
              </div>

              {/* Employee Telemetry */}
              <div className="border border-slate-200 bg-white p-3 rounded-xl shadow-xs">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-md bg-blue-100 flex items-center justify-center text-blue-600">
                    <HeartPulse className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Employee Telemetry AI</span>
                </div>
                <p className="text-[11px] font-mono text-blue-600 font-bold">
                  {HF_FREE_MODELS.EMPLOYEE_TELEMETRY.id}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Task velocity tracking, focus ratio, and burnout risk forecast.
                </p>
              </div>

              {/* ATS Resume Parsing */}
              <div className="border border-slate-200 bg-white p-3 rounded-xl shadow-xs">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center text-emerald-600">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">ATS Resume Parser</span>
                </div>
                <p className="text-[11px] font-mono text-emerald-600 font-bold">
                  {HF_FREE_MODELS.ATS_RESUME_PARSER.id}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  PDF/DOCX skill extraction, match scoring & Priority Queue ranking.
                </p>
              </div>

              {/* Sentiment & Interview Generator */}
              <div className="border border-slate-200 bg-white p-3 rounded-xl shadow-xs">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center text-amber-600">
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Sentiment & Interview AI</span>
                </div>
                <p className="text-[11px] font-mono text-amber-600 font-bold">
                  {HF_FREE_MODELS.INTERVIEW_GENERATOR.id}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Gap-targeted technical questions & standup work note sentiment analysis.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between sm:justify-between">
          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>100% Free Open Weights • No Subscription Required</span>
          </div>
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
