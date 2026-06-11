import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, Timer, Award, AlertCircle, Lock, Camera, Monitor, AlertTriangle, Key } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface PublicQuestion {
  question: string;
  options: string[];
}

export default function AssessmentAccess() {
  const { toast } = useToast();
  const navigate = useNavigate();

  // Video Streaming Reference Nodes
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Lifecycle & Layout States
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isSubmittingAssessment, setIsSubmittingAssessment] = useState(false); // CRITICAL FIX: Submission latch
  const [assessmentMeta, setAssessmentMeta] = useState<any>(null);
  const [publicQuestions, setPublicQuestions] = useState<PublicQuestion[]>([]);
  const [resolvedCandidateId, setResolvedCandidateId] = useState<string | null>(null);
  const [targetApplicationId, setTargetApplicationId] = useState<string | null>(null);
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);

  // Secure Token Input Storage State
  const [inputTokenText, setInputTokenText] = useState("");
  const [validatedSecureToken, setValidatedSecureToken] = useState<string | null>(null);

  // Proctoring, Security & Violation States
  const [currentStep, setCurrentStep] = useState<'authenticate' | 'instructions' | 'test' | 'result'>('authenticate');
  const [hardwareApproved, setHardwareApproved] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);

  // Exam Engine States
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [examResult, setExamResult] = useState<any>(null);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  // Reference hooks to keep listeners sync-locked with latest states
  const violationCountRef = useRef(0);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    violationCountRef.current = violationCount;
  }, [violationCount]);

  useEffect(() => {
    isSubmittingRef.current = isSubmittingAssessment;
  }, [isSubmittingAssessment]);

  // Recover state tokens silently out of local browser sessions on initial mount
  useEffect(() => {
    const cachedToken = sessionStorage.getItem("assessment_secure_session_token");
    if (cachedToken) {
      console.log("Cached assessment workspace token resolved out of session memory.");
      executeTokenHandshakeVerification(cachedToken);
    }
  }, []);

  // Re-attach media stream when switching to test screen
  useEffect(() => {
    if (
      currentStep === "test" &&
      webcamVideoRef.current &&
      mediaStreamRef.current
    ) {
      webcamVideoRef.current.srcObject = mediaStreamRef.current;
      webcamVideoRef.current.play().catch(console.error);
    }
  }, [currentStep]);

  // DevTools / Keyboard Shortcut Protection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isSubmittingRef.current) return; // Ignore if submitting
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J")) ||
        (e.ctrlKey && e.key === "u")
      ) {
        e.preventDefault();
        executeViolationLogIncident("Developer Tools Access Attempt");
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Copy/Paste Protection - ONLY during test
  useEffect(() => {
    if (currentStep !== "test") return;

    const prevent = (e: ClipboardEvent) => {
      if (isSubmittingRef.current) return;
      e.preventDefault();
      executeViolationLogIncident("Clipboard Access Attempt");
    };

    document.addEventListener("copy", prevent);
    document.addEventListener("paste", prevent);

    return () => {
      document.removeEventListener("copy", prevent);
      document.removeEventListener("paste", prevent);
    };
  }, [currentStep]);

  // Right Click Protection - ONLY during test
  useEffect(() => {
    if (currentStep !== "test") return;

    const block = (e: MouseEvent) => {
      if (isSubmittingRef.current) return;
      e.preventDefault();
      executeViolationLogIncident("Right Click Attempt");
    };

    document.addEventListener("contextmenu", block);

    return () => {
      document.removeEventListener("contextmenu", block);
    };
  }, [currentStep]);

  // Browser Resize / DevTools Window Detection - ONLY during test
  useEffect(() => {
    if (currentStep !== "test") return;

    const handler = () => {
      if (isSubmittingRef.current) return;
      if (window.outerWidth - window.innerWidth > 200 || window.outerHeight - window.innerHeight > 200) {
        executeViolationLogIncident("Developer Tools Window or Resize Detected");
      }
    };

    const interval = setInterval(handler, 2000);
    return () => clearInterval(interval);
  }, [currentStep]);

  // Anti-Cheating Hardware Monitor Loops
  useEffect(() => {
    if (currentStep !== 'test' || !mediaStreamRef.current) return;

    const streamTrackMonitor = setInterval(() => {
      if (isSubmittingRef.current) return;
      if (mediaStreamRef.current) {
        const videoTrack = mediaStreamRef.current.getVideoTracks()[0];
        const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
        if ((videoTrack && !videoTrack.enabled) || (audioTrack && !audioTrack.enabled)) {
          executeViolationLogIncident("Proctored Media Stream Disabled Manually");
        }
      }
    }, 5000);

    return () => clearInterval(streamTrackMonitor);
  }, [currentStep]);

  // Tab Blur Focus & Fullscreen Interceptors
  useEffect(() => {
    if (currentStep !== 'test') return;

    const handleWindowBlurViolation = () => {
      if (isSubmittingRef.current) return; // BYPASS SECURED: submission locks out spurious focus drops
      executeViolationLogIncident("Tab Switch / Window Focus Lost");
    };

    const handleFullscreenChangeAudit = () => {
      if (isSubmittingRef.current) return; // BYPASS SECURED: programmatic screen expansion exit ignored
      const isCurrentlyFull = !!document.fullscreenElement;
      setIsFullscreenActive(isCurrentlyFull);
      if (!isCurrentlyFull && currentStep === 'test') {
        executeViolationLogIncident("Exited Proctored Fullscreen Environment Mode");
      }
    };

    window.addEventListener("blur", handleWindowBlurViolation);
    document.addEventListener("visibilitychange", handleWindowBlurViolation);
    document.addEventListener("fullscreenchange", handleFullscreenChangeAudit);

    return () => {
      window.removeEventListener("blur", handleWindowBlurViolation);
      document.removeEventListener("visibilitychange", handleWindowBlurViolation);
      document.removeEventListener("fullscreenchange", handleFullscreenChangeAudit);
    };
  }, [currentStep]);

  // Countdown Watchdog Hooks
  useEffect(() => {
    if (currentStep !== 'test' || timeLeft <= 0) {
      if (timeLeft === 0 && currentStep === 'test' && !submitting && !alreadySubmitted) {
        setAlreadySubmitted(true);
        toast({
          title: "Time Window Concluded",
          description: "MNC Compliance: Evaluation duration threshold reached. Auto-submitting assessment scripts.",
          variant: "destructive"
        });
        executeAssessmentGradingEngine();
      }
      return;
    }

    const timerInterval = setInterval(() => {
      if (isSubmittingRef.current) return;
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [timeLeft, currentStep, submitting, alreadySubmitted]);

  const handleTokenFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputTokenText.trim()) return;
    executeTokenHandshakeVerification(inputTokenText.trim());
  };

  const executeTokenHandshakeVerification = async (targetTokenString: string) => {
    try {
      setLoading(true);
      
      const { data: tokenRecord, error: tokenErr } = await supabase
        .from("assessment_tokens")
        .select("*, assessments(*)")
        .eq("token", targetTokenString)
        .eq("used", false)
        .maybeSingle();

      if (tokenErr) throw tokenErr;

      if (!tokenRecord) {
        toast({
          title: "Token Handshake Denied",
          description: "This invitation hash string is either consumed, closed, expired, or invalid.",
          variant: "destructive"
        });
        sessionStorage.removeItem("assessment_secure_session_token");
        return;
      }

      const rawAssessmentObj = tokenRecord.assessments;
      if (!rawAssessmentObj || rawAssessmentObj.status !== "Active") {
        throw new Error("Target parent evaluation blueprint configuration has been deactivated by administrators.");
      }

      if (Array.isArray(rawAssessmentObj.questions)) {
        const strippedQuestions = rawAssessmentObj.questions.map((q: any) => ({
          question: q.question || "",
          options: Array.isArray(q.options) ? q.options : []
        }));
        setPublicQuestions(strippedQuestions);
      }

      sessionStorage.setItem("assessment_secure_session_token", targetTokenString);
      setValidatedSecureToken(targetTokenString);
      setAssessmentMeta(rawAssessmentObj);
      setResolvedCandidateId(tokenRecord.candidate_id);
      setTargetApplicationId(tokenRecord.application_id || tokenRecord.candidate_applications?.id || null);
      setActiveAttemptId(tokenRecord.attempt_id);
      setTimeLeft((rawAssessmentObj.duration_minutes || 60) * 60);
      
      setCurrentStep('instructions');
    } catch (err: any) {
      toast({ title: "Handshake Refused", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const initializeHardwareProctoringChannels = async () => {
    setSubmitting(true);
    try {
      const streams = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current = streams;
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = streams;
        try {
          await webcamVideoRef.current.play();
        } catch (err) {
          console.error("Video playback failed", err);
        }
      }
      setHardwareApproved(true);
      toast({ title: "Hardware Matrix Validated", description: "Proctored camera and microphone stream locked successfully." });
    } catch (err) {
      toast({
        title: "Peripherals Access Required",
        description: "MNC Anti-Cheating Protocol: You must explicitly approve microphone and webcam permissions to take this exam.",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const launchSecureExamWorkspace = async () => {
    if (!hardwareApproved || !assessmentMeta || !resolvedCandidateId || !validatedSecureToken) return;
    try {
      const element = document.documentElement;
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      }
      
      const { data: ongoingAttemptRow } = await supabase
        .from("assessment_attempts")
        .select("id, started_at")
        .eq("assessment_id", assessmentMeta.id)
        .eq("candidate_id", resolvedCandidateId)
        .is("completed_at", null)
        .maybeSingle();

      let targetAttemptId = null;

      if (ongoingAttemptRow) {
        targetAttemptId = ongoingAttemptRow.id;
        const passedSeconds = Math.floor((Date.now() - new Date(ongoingAttemptRow.started_at).getTime()) / 1000);
        const originalDurationSeconds = (assessmentMeta.duration_minutes || 60) * 60;
        setTimeLeft(Math.max(10, originalDurationSeconds - passedSeconds));
      } else {
        const { data: newAttempt, error: startErr } = await supabase
          .from("assessment_attempts")
          .insert([{
            assessment_id: assessmentMeta.id,
            candidate_id: resolvedCandidateId,
            started_at: new Date().toISOString()
          }])
          .select("id")
          .single();

        if (startErr) throw startErr;
        targetAttemptId = newAttempt.id;
      }
      
      setActiveAttemptId(targetAttemptId);
      setIsFullscreenActive(true);
      setCurrentStep('test');
    } catch (err) {
      toast({ title: "Fullscreen Shell Failure", description: "Browser rejected secure frame locking protocols.", variant: "destructive" });
    }
  };

  const executeViolationLogIncident = async (violationType: string) => {
    if (isSubmittingRef.current) return; // Prevent race conditions during grading execution
    
    const nextCount = violationCountRef.current + 1;
    setViolationCount(nextCount);
    violationCountRef.current = nextCount;
    
    toast({
      title: "Security Violation Logged",
      description: `MNC Compliance Alert: ${violationType} incident captured. Violation index: [${nextCount}/3].`,
      variant: "destructive"
    });

    if (nextCount >= 3 && !alreadySubmitted) {
      setAlreadySubmitted(true);
      executeAssessmentGradingEngine();
    }
  };

  const handleRadioOptionSelect = (questionIndex: number, selectedValue: string) => {
    setSelectedAnswers(prev => ({ ...prev, [questionIndex]: selectedValue }));
  };

  // === SURGICALLY HARDENED GRADEMENT PIPELINE MATRICES PER EXPLICIT DIRECTIVES ===
  const executeAssessmentGradingEngine = async () => {
    // === DEBUG AND EXPLICIT ERROR CAPTURE VALIDATION LOGS INJECTED HERE ===
    console.log("ASSESSMENT SUBMIT DEBUG", {
      assessmentMeta,
      resolvedCandidateId,
      targetApplicationId,
      activeAttemptId,
      validatedSecureToken
    });

    if (!assessmentMeta) {
      throw new Error("assessmentMeta missing");
    }

    if (!resolvedCandidateId) {
      throw new Error("resolvedCandidateId missing");
    }

    if (!targetApplicationId) {
      throw new Error("targetApplicationId missing");
    }

    if (!activeAttemptId) {
      throw new Error("activeAttemptId missing");
    }

    if (!validatedSecureToken) {
      throw new Error("validatedSecureToken missing");
    }
    
    setSubmitting(true);
    setIsSubmittingAssessment(true); // Engages immediate state lockout latch
    isSubmittingRef.current = true;
    setShowConfirmSubmit(false);

    try {
      const { data: freshExamRecord, error: fetchMasterErr } = await supabase
        .from("assessments")
        .select("questions, passing_score")
        .eq("id", assessmentMeta.id)
        .single();

      if (fetchMasterErr || !freshExamRecord || !Array.isArray(freshExamRecord.questions)) {
        throw new Error("Failed to re-verify grading keys matrix out of secure server layers.");
      }

      const masterQuestionsList: any[] = freshExamRecord.questions;
      let correctAnswersCount = 0;

      masterQuestionsList.forEach((q, idx) => {
        const masterAnswerRaw = String(q.correctAnswer || q.correct_option || q.answer || "").trim().toLowerCase();
        const candidateAnswerRaw = String(selectedAnswers[idx] || "").trim().toLowerCase();
        
        if (candidateAnswerRaw && (masterAnswerRaw === candidateAnswerRaw || masterAnswerRaw === String(q.options?.indexOf(selectedAnswers[idx]) + 1))) {
          correctAnswersCount++;
        }
      });

      const evaluatedPercentage = parseFloat(((correctAnswersCount / masterQuestionsList.length) * 100).toFixed(2));
      const roundedScoreValue = Math.round(evaluatedPercentage);
      
      const wasDisqualified = violationCountRef.current >= 3;
      const isPassingGrade = !wasDisqualified && (evaluatedPercentage >= (freshExamRecord.passing_score || 70));
      
      const calculatedWorkflowStatus = isPassingGrade ? "Assessment Passed" : "Rejected";
      const calculatedInterviewStatus = isPassingGrade ? "Pending Scheduling" : "Pending";

      // 1. Commit metrics evaluations directly to Database tables first
      await supabase
        .from("assessment_attempts")
        .update({
          score: evaluatedPercentage,
          total_questions: masterQuestionsList.length,
          correct_answers: correctAnswersCount,
          percentage: evaluatedPercentage,
          passed: isPassingGrade,
          completed_at: new Date().toISOString()
        })
        .eq("id", activeAttemptId);

      if (targetApplicationId) {
        await supabase
          .from("candidate_applications")
          .update({
            status: calculatedWorkflowStatus,
            interview_status: calculatedInterviewStatus, 
            assessment_score: roundedScoreValue 
          })
          .eq("id", targetApplicationId); 
      }

      await supabase
        .from("candidates")
        .update({ stage: calculatedWorkflowStatus })
        .eq("id", resolvedCandidateId);

      await supabase
        .from("assessment_tokens")
        .update({ used: true })
        .eq("token", validatedSecureToken);

      setExamResult({
        score: evaluatedPercentage,
        correct: correctAnswersCount,
        total: masterQuestionsList.length,
        passed: isPassingGrade,
        disqualified: wasDisqualified
      });

      // 2. Teardown device peripherals and exit sandbox environments after database synchronization completes
      terminateMediaProctoringStreams();
      sessionStorage.removeItem("assessment_secure_session_token");
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }

      setCurrentStep('result');
      toast({ title: "Assessment Submitted Successfully" });
    } catch (err: any) {
      toast({ title: "Transaction Commit Failure", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
      setIsSubmittingAssessment(false);
      isSubmittingRef.current = false;
    }
  };

  const formatTimerString = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 py-12 px-4 sm:px-6 lg:px-8 font-sans select-none">
      
      {currentStep === 'authenticate' && (
        <Card className="max-w-md mx-auto shadow-xl border-slate-200 bg-white overflow-hidden rounded-xl animate-fade-in">
          <div className="bg-slate-900 p-6 text-white border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-indigo-400" />
              <h1 className="text-lg font-black tracking-tight">MNC Evaluation Gateway</h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">Please provide your individualized token code string to open your secure environment sandbox.</p>
          </div>
          <CardContent className="p-6 pt-8">
            <form onSubmit={handleTokenFormSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase flex items-center gap-1"><Key className="w-3 h-3 text-indigo-500" /> Individual Invite Token Hash</label>
                <Input 
                  type="text" 
                  required 
                  placeholder="Paste secure UUID invitation token..." 
                  value={inputTokenText} 
                  onChange={e => setInputTokenText(e.target.value)}
                  className="h-10 text-xs font-mono font-bold bg-white border-slate-200 uppercase"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold text-white h-10 text-xs tracking-wider uppercase shadow-md mt-2">
                Verify Invitation Clearance
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {currentStep === 'instructions' && (
        <Card className="max-w-xl mx-auto shadow-xl border-slate-200 bg-white overflow-hidden rounded-xl animate-fade-in">
          <div className="bg-slate-900 p-6 text-white border-b border-slate-800">
            <h1 className="text-base font-black tracking-tight uppercase flex items-center gap-1.5"><Lock className="w-4 h-4 text-indigo-400"/> Proctored Workspace Center</h1>
            <p className="text-xs text-indigo-400 font-bold mt-1">{assessmentMeta?.title}</p>
          </div>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold border-b pb-4">
              <div className="bg-slate-50 p-2.5 rounded-lg border">
                <span className="text-slate-400 block text-[9px] uppercase tracking-wider">Duration</span>
                <span className="text-slate-800 text-sm font-black">{assessmentMeta?.duration_minutes} Min</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border">
                <span className="text-slate-400 block text-[9px] uppercase tracking-wider">Item Slits</span>
                <span className="text-slate-800 text-sm font-black">{publicQuestions.length} Qs</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border">
                <span className="text-slate-400 block text-[9px] uppercase tracking-wider">Pass Grade</span>
                <span className="text-slate-800 text-sm font-black">{assessmentMeta?.passing_score}%</span>
              </div>
            </div>

            <div className="space-y-2 bg-amber-50 border border-amber-200 p-4 rounded-xl text-xs font-semibold text-amber-900 leading-relaxed">
              <p className="font-black flex items-center gap-1.5 text-amber-950 mb-1"><AlertTriangle className="w-4 h-4 text-amber-600"/> Proctored Environment Guard Directives:</p>
              <ul className="list-decimal pl-4 space-y-1">
                <li>Your hardware webcam and microphone feeds must remain engaged for validation auditing logs tracks.</li>
                <li>Exiting proctored fullscreen windows or switching browser tabs logging index points triggers immediate system violation counts.</li>
                <li>Hitting 3 structural window violations forces immediate automated execution submission failures.</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {!hardwareApproved ? (
                <Button onClick={initializeHardwareProctoringChannels} disabled={submitting} className="w-full bg-indigo-600 text-white font-bold h-11 text-xs uppercase tracking-wider">
                  <Camera className="w-4 h-4 mr-2" /> Grant Access & Calibrate Peripherals
                </Button>
              ) : (
                <Button onClick={launchSecureExamWorkspace} className="w-full bg-emerald-600 text-white font-black h-11 text-xs uppercase tracking-widest rounded-xl shadow-md">
                  <Monitor className="w-4 h-4 mr-2" /> Initialize Secure Testing Frame
                </Button>
              )}
            </div>
            
            <div className="w-full bg-slate-900 rounded-xl overflow-hidden aspect-video relative max-w-xs mx-auto border-2 border-slate-800 shadow-inner">
              <video 
                ref={webcamVideoRef} 
                autoPlay 
                playsInline 
                muted 
                disablePictureInPicture
                className="w-full h-full object-cover transform -scale-x-100" 
              />
              {!hardwareApproved && <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center text-[10px] text-slate-500 font-bold uppercase tracking-wider">Webcam Offline</div>}
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 'test' && (
        <div className="max-w-5xl mx-auto grid md:grid-cols-4 gap-6 animate-fade-in relative items-start">
          <div className="md:col-span-3 space-y-4">
            <div className="bg-slate-900 text-white px-6 py-4 rounded-xl shadow-lg border border-slate-800 flex items-center justify-between sticky top-4 z-50">
              <div>
                <h2 className="text-sm font-black tracking-tight truncate max-w-xs sm:max-w-md">{assessmentMeta?.title}</h2>
                <p className="text-[10px] font-bold text-indigo-400 mt-0.5 uppercase tracking-wider">MNC Proctored Examination Sandbox Profile</p>
              </div>
              <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700/60 font-mono text-sm font-bold text-amber-400">
                <Timer className="w-4 h-4" />
                <span>{formatTimerString(timeLeft)}</span>
              </div>
            </div>

            <div className="space-y-4">
              {publicQuestions.map((q: PublicQuestion, qIdx: number) => (
                <Card key={qIdx} className="border-slate-200 bg-white shadow-md rounded-xl overflow-hidden">
                  <CardHeader className="bg-slate-50/60 border-b p-4">
                    <div className="flex items-start gap-2.5">
                      <span className="bg-indigo-50 text-indigo-700 rounded-md font-bold text-xs px-2 py-1 border border-indigo-100 shrink-0">Item {qIdx + 1}</span>
                      <p className="text-sm font-bold text-slate-800 pt-0.5 leading-relaxed">{q.question}</p>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-5 grid sm:grid-cols-2 gap-3">
                    {q.options?.map((opt: string, optIdx: number) => (
                      <label key={optIdx} className={`border rounded-xl p-3 flex items-center gap-3 cursor-pointer transition-all hover:bg-slate-50/80 ${selectedAnswers[qIdx] === opt ? 'border-indigo-600 bg-indigo-50/30 ring-1 ring-indigo-600' : 'border-slate-100 bg-white'}`}>
                        <input 
                          type="radio" 
                          name={`q-${qIdx}`} 
                          checked={selectedAnswers[qIdx] === opt} 
                          onChange={() => handleRadioOptionSelect(qIdx, opt)}
                          className="w-4 h-4 text-indigo-600 border-slate-300" 
                        />
                        <span className="text-xs font-semibold text-slate-700 leading-tight">{opt}</span>
                      </label>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setShowConfirmSubmit(true)} disabled={submitting || alreadySubmitted} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest px-8 py-6 shadow-lg rounded-xl flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> Finalize Examination Scripts
              </Button>
            </div>
          </div>

          <div className="md:col-span-1 space-y-4 md:sticky md:top-24">
            <Card className="border-slate-200 bg-white shadow-md rounded-xl overflow-hidden">
              <CardHeader className="bg-slate-900 text-white p-3 text-center border-b"><span className="text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5"><Camera className="w-3.5 h-3.5 text-indigo-400"/> Live Proctor Stream</span></CardHeader>
              <CardContent className="p-3 space-y-3">
                <div className="w-full bg-slate-950 aspect-video rounded-lg overflow-hidden border shadow-inner">
                  <video 
                    ref={webcamVideoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    disablePictureInPicture
                    className="w-full h-full object-cover transform -scale-x-100" 
                  />
                </div>
                <div className="bg-red-50 border border-red-200 p-2.5 rounded-lg text-[11px] font-bold text-red-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <div>
                    <span>Violations Count: </span>
                    <span className="text-sm font-black text-red-950">[{violationCount} / 3]</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="max-w-sm w-full bg-white shadow-2xl border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-amber-500 p-4 text-white font-black text-sm">
              <span>Verify Submission Parameters</span>
            </div>
            <CardContent className="p-5 space-y-4 pt-6">
              <p className="text-xs font-bold text-slate-600">
                You have addressed <span className="text-indigo-600 text-sm font-black">{Object.keys(selectedAnswers).length}</span> of <span className="text-slate-800 text-sm font-black">{publicQuestions.length}</span> available technical item vectors.
              </p>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button onClick={() => setShowConfirmSubmit(false)} variant="outline" className="text-xs font-bold h-9">Cancel</Button>
                <Button onClick={() => { if(!alreadySubmitted) { setAlreadySubmitted(true); executeAssessmentGradingEngine(); } }} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase">Confirm Dispatch</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {currentStep === 'result' && examResult && (
        <Card className="max-w-md mx-auto shadow-2xl border-slate-200 bg-white overflow-hidden text-center rounded-xl">
          <div className="bg-emerald-600 p-8 text-white relative">
            <h1 className="text-xl font-black tracking-tight uppercase">{examResult.disqualified ? "System Disqualification" : examResult.passed ? "Examination Passed" : "Threshold Failure"}</h1>
          </div>
          <CardContent className="p-6 pt-8 space-y-6">
            {!examResult.disqualified && (
              <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-6">
                <div className="bg-slate-50/80 border rounded-xl p-3">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Score Percentage</span>
                  <span className={`text-2xl font-black ${examResult.passed ? 'text-emerald-600' : 'text-rose-600'} block mt-1`}>{examResult.score}%</span>
                </div>
                <div className="bg-slate-50/80 border rounded-xl p-3">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Correct Items</span>
                  <span className="text-2xl font-black text-slate-700 block mt-1">{examResult.correct} / {examResult.total}</span>
                </div>
              </div>
            )}
            <Button onClick={() => navigate("/login")} variant="outline" className="w-full h-10 font-bold text-xs uppercase text-slate-600">Conclude Session</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}