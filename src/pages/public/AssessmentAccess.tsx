import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, Timer, Award, AlertCircle, Lock, Camera, Monitor, AlertTriangle, Key, ScanFace } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { notificationService } from "@/lib/notifications";
import { loadFaceModels, detectFace, getFaceVerificationState } from "@/hooks/useFaceVerification";
import { startProctoringSession, recordProctorEvent, startHeartbeat, runLivenessChallenge, finalizeProctoringSession, type ProctoringSessionHandle, type ProctorEventType } from "@/lib/proctoring/proctor-session";
import { loadLandmarkEngine, analyzeLandmarks, classifyLandmarksTemporal, createLandmarkTemporalState, type LandmarkTemporalState } from "@/lib/proctoring/landmark-engine";

interface PublicQuestion {
  question: string;
  options: string[];
}

export default function AssessmentAccess() {
  useEffect(() => { document.title = "Assessment - FWC"; }, []);
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
  const alreadySubmittedRef = useRef(false);

  // Face verification state
  const [faceVerified, setFaceVerified] = useState(false);
  const [faceCheckLoading, setFaceCheckLoading] = useState(false);
  const [faceCheckError, setFaceCheckError] = useState<string | null>(null);
  // Mirror for non-React readers (auto-check retry loop reads the latest
  // decision without a stale-closure).
  const faceCheckErrorRef = useRef<string | null>(null);
  const [faceModelsReady, setFaceModelsReady] = useState(false);
  const [faceMatchDistance, setFaceMatchDistance] = useState<number | null>(null);

  // Audio proctoring reference nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioDataRef = useRef<Uint8Array | null>(null);

  // Face detection interval reference
  const faceDetectionIntervalRef = useRef<number | null>(null);

  // Violation history with timestamps
  const [violationHistory, setViolationHistory] = useState<{ type: string; time: string }[]>([]);

  // Reference hooks to keep listeners sync-locked with latest states
  const violationCountRef = useRef(0);
  const isSubmittingRef = useRef(false);

  // Structured proctor log for server-side persistence (assessment_tokens.proctor_log)
  const proctorLogRef = useRef<{ type: string; timestamp: string; time: string }[]>([]);

  // Server-authoritative proctoring session (Session 6)
  const proctorHandleRef = useRef<ProctoringSessionHandle | null>(null);
  const stopHeartbeatRef = useRef<(() => void) | null>(null);
  const landmarkTemporalRef = useRef<LandmarkTemporalState>(createLandmarkTemporalState());
  const landmarkReadyRef = useRef(false);

  // Corporate proctoring: grace period + dedup tracking
  const examStartTimeRef = useRef<number | null>(null);
  const lastViolationTimeRef = useRef<Record<string, number>>({});
  const VIOLATION_GRACE_PERIOD_MS = 45000;
  const VIOLATION_DEDUP_WINDOW_MS = 30000;
  const getMaxViolations = () => assessmentMeta?.max_violations || 5;

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

      executeTokenHandshakeVerification(cachedToken);
    }
  }, []);

  // Load face verification models
  useEffect(() => {
    (async () => {
      const state = getFaceVerificationState();
      if (state.modelsLoaded) { setFaceModelsReady(true); return; }
      if (state.modelsLoading) return;
      if (state.loadError) { console.warn('[Assessment] Face models unavailable:', state.loadError); return; }
      const loaded = await loadFaceModels();
      setFaceModelsReady(loaded);
      // Landmark engine is observation-only (blink/head/mouth signals); load
      // opportunistically. Its absence must never block the exam.
      loadLandmarkEngine().then(ok => { landmarkReadyRef.current = ok; });
    })();
  }, []);

  // Cleanup audio context on unmount
  useEffect(() => {
    return () => {
      terminateMediaProctoringStreams();
    };
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

    // CAMERA-FAILURE / NETWORK OBSERVERS (Session 6 Phase 12/14): camera
    // death and network loss must produce SERVER-VISIBLE events, never
    // silently continue.
    const h = proctorHandleRef.current;
    const token = validatedSecureToken;
    const trackHandlers: Array<{ track: MediaStreamTrack; onEnd: () => void; onMute: () => void }> = [];
    if (h && token) {
      mediaStreamRef.current.getVideoTracks().forEach(track => {
        const onEnd = () => recordProctorEvent(h, token, "CAMERA_INTERRUPTED", { severity: "MEDIUM", metadata: { reason: "track_ended" } });
        const onMute = () => recordProctorEvent(h, token, "CAMERA_INTERRUPTED", { severity: "LOW", metadata: { reason: "track_muted" } });
        track.addEventListener("ended", onEnd);
        track.addEventListener("mute", onMute);
        trackHandlers.push({ track, onEnd, onMute });
      });
      mediaStreamRef.current.getAudioTracks().forEach(track => {
        const onEnd = () => recordProctorEvent(h, token, "MIC_INTERRUPTED", { severity: "MEDIUM", metadata: { reason: "track_ended" } });
        track.addEventListener("ended", onEnd);
        trackHandlers.push({ track, onEnd, onMute: onEnd });
      });
      const goOffline = () => recordProctorEvent(h, token, "NETWORK_OFFLINE", { severity: "MEDIUM" });
      const goOnline = () => recordProctorEvent(h, token, "NETWORK_RESTORED", { severity: "LOW" });
      window.addEventListener("offline", goOffline);
      window.addEventListener("online", goOnline);
      return () => {
        clearInterval(streamTrackMonitor);
        trackHandlers.forEach(({ track, onEnd, onMute }) => {
          track.removeEventListener("ended", onEnd);
          track.removeEventListener("mute", onMute);
        });
        window.removeEventListener("offline", goOffline);
        window.removeEventListener("online", goOnline);
      };
    }

    return () => clearInterval(streamTrackMonitor);
  }, [currentStep]);

  // Tab Blur Focus & Fullscreen Interceptors with corporate debounce
  useEffect(() => {
    if (currentStep !== 'test') return;

    let blurTimer: number | null = null;
    let fsTimer: number | null = null;

    const handleWindowBlurViolation = () => {
      if (isSubmittingRef.current) return;
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        if (!isSubmittingRef.current) {
          executeViolationLogIncident("Tab Switch / Window Focus Lost");
        }
      }, 2000);
    };

    const handleWindowFocusRestored = () => {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }
    };

    const handleFullscreenChangeAudit = () => {
      if (isSubmittingRef.current) return;
      const isCurrentlyFull = !!document.fullscreenElement;
      setIsFullscreenActive(isCurrentlyFull);
      if (!isCurrentlyFull) {
        if (fsTimer) clearTimeout(fsTimer);
        fsTimer = window.setTimeout(() => {
          if (!document.fullscreenElement && !isSubmittingRef.current) {
            executeViolationLogIncident("Exited Proctored Fullscreen Environment Mode");
          }
        }, 3000);
      } else {
        if (fsTimer) {
          clearTimeout(fsTimer);
          fsTimer = null;
        }
      }
    };

    window.addEventListener("blur", handleWindowBlurViolation);
    window.addEventListener("focus", handleWindowFocusRestored);
    document.addEventListener("visibilitychange", handleWindowBlurViolation);
    document.addEventListener("fullscreenchange", handleFullscreenChangeAudit);

    return () => {
      window.removeEventListener("blur", handleWindowBlurViolation);
      window.removeEventListener("focus", handleWindowFocusRestored);
      document.removeEventListener("visibilitychange", handleWindowBlurViolation);
      document.removeEventListener("fullscreenchange", handleFullscreenChangeAudit);
      if (blurTimer) clearTimeout(blurTimer);
      if (fsTimer) clearTimeout(fsTimer);
    };
  }, [currentStep]);

  // Audio monitoring + face detection loop during test
  useEffect(() => {
    if (currentStep !== 'test' || !audioAnalyserRef.current || !audioDataRef.current) return;

    const checkAudioLevel = () => {
      if (isSubmittingRef.current) return;
      const analyser = audioAnalyserRef.current;
      const data = audioDataRef.current! as Uint8Array<ArrayBuffer>;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const val = data[i] - 128;
        sum += val * val;
        if (Math.abs(val) > peak) peak = Math.abs(val);
      }
      const rms = Math.sqrt(sum / data.length);
      // Corporate threshold: require sustained loud audio indicative of speaking
      if (rms > 85 && peak > 100) {
        executeViolationLogIncident("Suspicious Audio Activity Detected");
      }

      // Frequency spectrum analysis — detect pre-recorded playback vs live speech
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freqData);
      let freqSum = 0;
      let freqCount = 0;
      let lowBand = 0, midBand = 0, highBand = 0;
      const binCount = freqData.length;
      for (let i = 0; i < binCount; i++) {
        freqSum += freqData[i];
        if (freqData[i] > 0) freqCount++;
        if (i < binCount * 0.25) lowBand += freqData[i];
        else if (i < binCount * 0.65) midBand += freqData[i];
        else highBand += freqData[i];
      }
      const avgFreq = freqSum / binCount;
      const activeBinRatio = binCount > 0 ? freqCount / binCount : 0;
      // Pre-recorded/ambient playback heuristic: flat spectrum with almost all bins active
      if (activeBinRatio > 0.85 && avgFreq > 50 && avgFreq < 120 && midBand > lowBand * 2 && highBand > lowBand * 0.5) {
        executeViolationLogIncident("Pre-recorded Audio Playback Detected");
      }
    };

    const audioInterval = setInterval(checkAudioLevel, 3000);

    // AI-powered proctoring via HuggingFace vision models
    let proctorFrameCount = 0;
    const attemptAIFrameAnalysis = async () => {
      if (isSubmittingRef.current) return;
      const video = webcamVideoRef.current;
      if (!video || !video.videoWidth) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, 320, 240);
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.7);

        // Send to AI proctoring edge function (anon key satisfies VERIFY_JWT)
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proctor-ai`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({ image: imageBase64 })
          }
        );

        if (response.ok) {
          const result = await response.json();
          if (result.suspicious) {
            result.alerts?.forEach((alert: string) => {
              executeViolationLogIncident(alert);
            });
          } else if (result.ai_disabled) {
            console.warn("AI proctoring unavailable: model not configured");
          }
        }
      } catch (proctorErr) {
        console.error("AI proctoring error:", proctorErr);
      }
    };

    // Periodic face re-verification during test (15s cadence for temporal CV)
    const faceRecheckInterval = window.setInterval(async () => {
      if (isSubmittingRef.current || !faceModelsReady || !mediaStreamRef.current) return;
      const video = webcamVideoRef.current;
      if (!video || !video.videoWidth) return;
      // Capture at 640×480 — YuNet's small-face recall collapses below this
      // resolution (empirically verified: 320×240 input drops real faces to
      // sub-threshold ~20px boxes).
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 640, 480);
      const result = await detectFace(canvas);

      // --- Temporal YuNet observations → typed proctoring events (Phase 10):
      // transient noise never escalates; sustained states do.
      const h = proctorHandleRef.current;
      const tok = validatedSecureToken;
      if (h && tok) {
        if (!result.detected) recordProctorEvent(h, tok, "FACE_MISSING", { severity: "LOW" });
        else if (result.multipleFaces) recordProctorEvent(h, tok, "MULTIPLE_FACES", { severity: "MEDIUM" });
        else recordProctorEvent(h, tok, "FACE_DETECTED");

        // --- MediaPipe landmark signals (observation-only)
        if (landmarkReadyRef.current) {
          const obs = analyzeLandmarks(video, performance.now());
          const cls = classifyLandmarksTemporal(landmarkTemporalRef.current, obs);
          if (cls.sustainedAway) recordProctorEvent(h, tok, "FACE_OUT_OF_FRAME", { severity: "LOW", metadata: { signal: "yaw", value: cls.yaw } });
          if (cls.sustainedMouth) recordProctorEvent(h, tok, "SUSPICIOUS_BEHAVIOR", { severity: "LOW", metadata: { signal: "mouth_sustained" } });
        }
      }

      if (!result.detected) {
        executeViolationLogIncident("Face Not Visible During Test");
      } else if (validatedSecureToken && result.descriptor) {
        // Periodic re-verification against the SERVER-enrolled descriptor via
        // the token-bound RPC (candidate identity derived server-side).
        try {
          const { data: serverBio } = await supabase.rpc('verify_candidate_biometric_face_token', {
            p_raw_token: validatedSecureToken,
            p_input_descriptor: Array.from(result.descriptor),
            p_threshold: 0.363
          });
          if (serverBio?.enrolled && !serverBio?.verified) {
            if (h && tok) recordProctorEvent(h, tok, "IDENTITY_MISMATCH", { severity: "MEDIUM", metadata: { similarity: serverBio.similarity } });
            executeViolationLogIncident("Face Match Failed During Test");
          }
        } catch (recheckErr) {
          console.warn("Periodic face recheck unavailable:", recheckErr);
        }
      }
    }, 15000);

    // Run AI vision proctoring every 10 seconds (balanced to avoid rate limits while maintaining security)
    const aiProctorInterval = window.setInterval(() => {
      proctorFrameCount++;
      if (proctorFrameCount % 2 === 0) {
        attemptAIFrameAnalysis();
      }
    }, 5000);
    faceDetectionIntervalRef.current = aiProctorInterval;

    return () => {
      clearInterval(audioInterval);
      clearInterval(aiProctorInterval);
      clearInterval(faceRecheckInterval);
      if (faceDetectionIntervalRef.current) {
        clearInterval(faceDetectionIntervalRef.current);
        faceDetectionIntervalRef.current = null;
      }
    };
  }, [currentStep]);

  // Countdown Watchdog Hooks
  useEffect(() => {
    if (currentStep !== 'test' || timeLeft <= 0) {
      if (timeLeft === 0 && currentStep === 'test' && !submitting && !alreadySubmitted) {
        setAlreadySubmitted(true);
        toast({
          title: "Time Expired",
          description: "Your assessment time has ended. Submitting your answers automatically.",
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
      
      // SERVER-AUTHORITATIVE HANDSHAKE: the token is validated and the
      // assessment blueprint is fetched via SECURITY DEFINER RPC. Anonymous
      // clients have no direct read on assessment_tokens or assessments
      // (answer-key leak closed server-side); the RPC returns sanitized
      // questions only — never answers, hashes or grading metadata.
      const { data: handshake, error: hsErr } = await supabase.rpc("get_assessment_by_token", {
        p_token: targetTokenString
      });

      if (hsErr) throw hsErr;

      if (!handshake?.valid) {
        toast({
          title: "Invalid Assessment Link",
          description: handshake?.error || "This assessment link is no longer valid. It may have expired or already been used.",
          variant: "destructive"
        });
        sessionStorage.removeItem("assessment_secure_session_token");
        return;
      }

      setPublicQuestions(Array.isArray(handshake.questions) ? handshake.questions : []);

      sessionStorage.setItem("assessment_secure_session_token", targetTokenString);
      setValidatedSecureToken(targetTokenString);
      setAssessmentMeta(handshake);
      setResolvedCandidateId(handshake.candidate_id);
      setTargetApplicationId(handshake.application_id || null);
      setActiveAttemptId(null);
      const parsedDuration = Math.max(2, Math.floor(Number(handshake.duration_minutes) || 60));
      setTimeLeft(parsedDuration * 60);
      examStartTimeRef.current = null;
      alreadySubmittedRef.current = false;

      setCurrentStep('instructions');
    } catch (err: any) {
      toast({ title: "Access Denied", description: "Could not load this assessment. It may have been deactivated.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const initializeHardwareProctoringChannels = async () => {
    setSubmitting(true);

    if (!navigator.mediaDevices?.getUserMedia) {
      toast({
        title: "Browser Incompatibility",
        description: "Your browser does not support camera/microphone access required for proctoring. Please use Chrome, Edge, or Firefox.",
        variant: "destructive"
      });
      setSubmitting(false);
      return;
    }
    if (!document.documentElement.requestFullscreen) {
      toast({
        title: "Browser Incompatibility",
        description: "Your browser does not support fullscreen mode required for secure testing.",
        variant: "destructive"
      });
      setSubmitting(false);
      return;
    }

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

      // Initialize audio proctoring analysis
      try {
        const ac = new AudioContext();
        if (ac.state === 'suspended') {
          await ac.resume();
        }
        const src = ac.createMediaStreamSource(streams);
        const analyser = ac.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        audioContextRef.current = ac;
        audioAnalyserRef.current = analyser;
        audioDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      } catch (err) {
        console.error("Audio proctoring init failed", err);
      }

      setHardwareApproved(true);
      toast({ title: "Camera and Microphone Access Granted", description: "Proctoring devices are ready." });

      // Trigger face verification automatically after camera is streaming.
      // Camera warm-up: the very first frames after getUserMedia can be blank
      // (fake device and real hardware both), so retry a bounded number of
      // times before surfacing a decision. Every attempt is a full real CV
      // pass — this is temporal robustness, NOT a threshold weakening.
      setFaceCheckLoading(true);
      setTimeout(async () => {
        const warmupAttempts = 5;
        for (let attempt = 1; attempt <= warmupAttempts; attempt++) {
          const ok = await performFaceCheck();
          const transient = faceCheckErrorRef.current?.includes('No face detected');
          if (ok || !transient || attempt === warmupAttempts) break;
          await new Promise(r => setTimeout(r, 1200));
        }
        setFaceCheckLoading(false);
      }, 1500);
    } catch (err) {
      toast({
        title: "Hardware Access Required",
        description: "Camera and microphone access is required for proctoring. Please allow access in your browser settings.",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const launchSecureExamWorkspace = async () => {
    if (!hardwareApproved || !assessmentMeta || !resolvedCandidateId || !validatedSecureToken) return;

    // Re-verify face before entering test
    const faceOk = await performFaceCheck();
    if (!faceOk) {
      toast({
        title: "Face Verification Failed",
        description: faceCheckError || "Could not verify your identity. Please ensure good lighting and camera positioning.",
        variant: "destructive"
      });
      return;
    }

    // SERVER-ISSUED ACTIVE LIVENESS (Session 6 Phase 8): a randomized
    // challenge from the server must be observed BEFORE the exam starts.
    // The pass decision is the server's (nonce-bound, single-use) — the
    // client only reports the observation.
    if (validatedSecureToken) {
      const handle = proctorHandleRef.current;
      if (handle) {
        const verifyAction = async (action: string): Promise<boolean> => {
          // Observation via MediaPipe landmarks where available; HEAD_* and
          // LOOK_* actions use the yaw proxy, BLINK/MOUTH use EAR/lips.
          if (!landmarkReadyRef.current || !webcamVideoRef.current) return false;
          const wantsAway = action.includes("TURN") || action.includes("LOOK");
          const wantsBlink = action.includes("BLINK");
          const wantsMouth = action.includes("MOUTH") || action.includes("SMILE");
          const deadline = Date.now() + 10000;
          const dirSign = action.includes("LEFT") ? -1 : 1;
          let seen = 0;
          while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 250));
            const obs = analyzeLandmarks(webcamVideoRef.current, performance.now());
            if (obs.ran && obs.faceCount > 0) {
              if (wantsAway && obs.yaw !== null && Math.sign(obs.yaw) === dirSign && Math.abs(obs.yaw) > 0.35) seen++;
              else if (wantsBlink && obs.blink) seen += 2;
              else if (wantsMouth && obs.mouthActive) seen++;
              if (seen >= 3) return true;
            }
          }
          return false;
        };
        const live = await runLivenessChallenge(handle, validatedSecureToken, verifyAction);
        if (!live.passed) {
          toast({
            title: "Liveness Check Failed",
            description: live.action
              ? `Follow the on-screen prompt precisely. (${live.error || "not observed"})`
              : "Liveness challenge could not be issued. Please retry.",
            variant: "destructive"
          });
          return;
        }
        toast({ title: "Liveness Confirmed", description: "Active challenge passed." });
      }
    }
    try {
      const element = document.documentElement;
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      }

      // SERVER-AUTHORITATIVE ATTEMPT START: the server creates/resumes the
      // attempt and returns the authoritative remaining time. The client
      // countdown is UX only — grade-assessment enforces expiry server-side.
      const { data: attemptStart, error: startErr } = await supabase.rpc("start_assessment_attempt", {
        p_token: validatedSecureToken
      });

      if (startErr) throw startErr;
      if (!attemptStart?.success) {
        toast({
          title: "Attempt Not Started",
          description: attemptStart?.error || "The server could not start this attempt.",
          variant: "destructive"
        });
        return;
      }

      setActiveAttemptId(attemptStart.attempt_id);
      setTimeLeft(Math.max(0, Number(attemptStart.remaining_seconds) || 0));
      setIsFullscreenActive(true);
      examStartTimeRef.current = Date.now();

      // SERVER-AUTHORITATIVE PROCTORING SESSION (Session 6): single-active
      // invariant enforced server-side; heartbeat keeps the lease fresh;
      // every observation becomes a typed, sequence-validated event row.
      try {
        const handle = await startProctoringSession(validatedSecureToken);
        if (handle) {
          proctorHandleRef.current = handle;
          stopHeartbeatRef.current = startHeartbeat(handle, validatedSecureToken);
          recordProctorEvent(handle, validatedSecureToken, "FULLSCREEN_ENTERED");
          recordProctorEvent(handle, validatedSecureToken, "CAMERA_GRANTED");
          recordProctorEvent(handle, validatedSecureToken, "MIC_GRANTED");
        } else {
          // Session refused (e.g. another ACTIVE session for this token).
          // Fail closed: the exam cannot start without a proctoring session.
          toast({
            title: "Proctoring Session Refused",
            description: "The server could not start a proctoring session for this token. Close any other active exam windows and try again.",
            variant: "destructive"
          });
          return;
        }
      } catch (sessionErr) {
        console.error("Proctoring session start error:", sessionErr);
        toast({ title: "Proctoring Session Error", description: "Could not establish server-side proctoring.", variant: "destructive" });
        return;
      }

      setCurrentStep('test');
    } catch (err) {
      console.error("launchSecureExamWorkspace error:", err);
      toast({ title: "Fullscreen Mode Error", description: "Unable to enter fullscreen mode. Please check your browser settings.", variant: "destructive" });
    }
  };

  const performFaceCheck = async (): Promise<boolean> => {
    // Single writer keeping both the React state and the retry-loop ref in sync.
    const faceErr = (v: string | null) => { faceCheckErrorRef.current = v; setFaceCheckError(v); };
    if (!faceModelsReady || !mediaStreamRef.current) {
      faceErr("Biometric verification engine is initializing or camera stream is unavailable.");
      return false;
    }

    try {
      const video = webcamVideoRef.current;
      if (!video || !video.videoWidth) {
        faceErr("Camera video stream is not active. Please ensure camera permissions are granted.");
        return false;
      }

      // 640×480 capture — see CV_RESOLUTION note in the recheck loop.
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        faceErr("Image processing context could not be created.");
        return false;
      }
      ctx.drawImage(video, 0, 0, 640, 480);

      const result = await detectFace(canvas);
      if (!result.detected || !result.descriptor) {
        faceErr('No face detected. Please ensure your face is clearly visible and centered.');
        return false;
      }

      if (result.multipleFaces) {
        faceErr('Multiple faces detected! Only the registered candidate may be visible during assessment.');
        return false;
      }

      // SERVER-AUTHORITATIVE identity (Session 6 architecture):
      // - Observations: real YuNet detection + SFace embedding (browser ONNX).
      // - Decisions: token-bound RPCs derive the candidate from the raw
      //   assessment token; the client NEVER supplies candidate identity.
      {
        const { data: serverBio, error: rpcErr } = await supabase.rpc('verify_candidate_biometric_face_token', {
          p_raw_token: validatedSecureToken,
          p_input_descriptor: Array.from(result.descriptor),
          p_threshold: 0.363 // SFace FR_COSINE documented threshold
        });

        if (rpcErr) {
          console.warn('[Assessment] Server biometric RPC unavailable:', rpcErr);
        } else if (serverBio && typeof serverBio === 'object') {
          if (serverBio.enrolled) {
            setFaceMatchDistance(Number(serverBio.similarity) || 0);
            if (!serverBio.verified) {
              faceErr(`Face mismatch detected (similarity: ${serverBio.similarity}). Face does not match registered candidate identity.`);
              return false;
            }
            setFaceVerified(true);
            faceErr(null);
            return true;
          } else if (serverBio.reason === 'NOT_ENROLLED') {
            // First sighting: enroll through the token-bound SECURITY DEFINER
            // RPC. No raw descriptor in localStorage; the server table owns
            // the biometric identity (first-wins, idempotent).
            const { data: enrollRes, error: enrollErr } = await supabase.rpc('enroll_candidate_biometric_token', {
              p_raw_token: validatedSecureToken,
              p_descriptor: Array.from(result.descriptor),
              p_confidence: result.confidence ?? 0.9
            });
            if (enrollErr) {
              console.error("Biometric enrollment failed:", enrollErr);
              faceErr("Biometric enrollment failed. Please try again.");
              return false;
            }
            if (!enrollRes?.success) {
              faceErr(enrollRes?.error || "Biometric enrollment refused.");
              return false;
            }
            setFaceVerified(true);
            faceErr(null);
            return true;
          }
        }
      }

      // The server RPC is the only authoritative path. When it is
      // unreachable we fail closed: without server-side enrollment the
      // candidate identity cannot be verified.
      faceErr("Identity verification service unavailable. Please try again.");
      return false;
    } catch (err: any) {
      console.error('[Assessment] Face check error:', err);
      faceErr('Biometric verification failed: ' + (err.message || 'System error'));
      return false;
    }
  };

  const terminateMediaProctoringStreams = () => {
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
      audioAnalyserRef.current = null;
      audioDataRef.current = null;
    }
    if (faceDetectionIntervalRef.current) {
      clearInterval(faceDetectionIntervalRef.current);
      faceDetectionIntervalRef.current = null;
    }
    stopHeartbeatRef.current?.();
    stopHeartbeatRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    setHardwareApproved(false);
  };

  const executeViolationLogIncident = (violationType: string) => {
      console.debug(`[PROCTOR] Violation: ${violationType}`);
    if (isSubmittingRef.current) return;

    const now = Date.now();
    const timeLabel = new Date().toLocaleTimeString();

    // Corporate grace period: no violations count toward threshold in first 45 seconds
    if (examStartTimeRef.current && (now - examStartTimeRef.current) < VIOLATION_GRACE_PERIOD_MS) {
      setViolationHistory(prev => [...prev, { type: `[WARNING] ${violationType}`, time: timeLabel }]);
      toast({
        title: "Proctoring Notice",
        description: `${violationType}. No action taken.`,
      });
      return;
    }

    // Dedup: same violation type within 30s window counts only once
    const lastTime = lastViolationTimeRef.current[violationType] || 0;
    if ((now - lastTime) < VIOLATION_DEDUP_WINDOW_MS) {
      return;
    }
    lastViolationTimeRef.current[violationType] = now;

    setViolationHistory(prev => [...prev, { type: violationType, time: timeLabel }]);

    // Persist structured log entry for server-side storage in assessment_tokens.proctor_log
    proctorLogRef.current.push({
      type: violationType,
      timestamp: new Date(now).toISOString(),
      time: timeLabel
    });

    // Authoritatively persist violation through the SECURITY DEFINER RPC.
    // The server validates the token binding and stamps server time; the
    // anonymous client cannot write proctoring_logs directly.
    if (validatedSecureToken) {
      // Structured proctoring session event (type-validated, sequence-guarded)
      const h = proctorHandleRef.current;
      if (h) {
        const mapped: ProctorEventType = violationType.includes("Developer") ? "SUSPICIOUS_BEHAVIOR"
          : violationType.includes("Clipboard") ? "COPY_ATTEMPT"
          : violationType.includes("Fullscreen") ? "FULLSCREEN_EXITED"
          : violationType.includes("Tab") || violationType.includes("Blur") || violationType.includes("blur") ? "TAB_HIDDEN"
          : "PROCTORING_WARNING";
        recordProctorEvent(h, validatedSecureToken, mapped, { severity: "MEDIUM", metadata: { detail: violationType } });
      }
      supabase.rpc("log_proctoring_event", {
        p_token: validatedSecureToken,
        p_violation_type: violationType,
        p_severity: violationType.includes("Disabled") || violationType.includes("Developer") ? "critical" : "warning",
        p_detail: `Incident: ${violationType} at ${timeLabel}`
      }).then(({ error: logErr }) => {
        if (logErr) console.warn("Failed to persist incident via RPC:", logErr);
      }, (err: unknown) => console.warn("Failed to persist incident via RPC:", err));
    }

    const nextCount = violationCountRef.current + 1;
    setViolationCount(nextCount);
    violationCountRef.current = nextCount;

    const remainingWarnings = getMaxViolations() - nextCount;
    toast({
      title: "Proctoring Warning",
      description: `${violationType}. ${remainingWarnings} warning(s) remaining.`,
      variant: "destructive"
    });

    if (nextCount >= getMaxViolations() && !alreadySubmittedRef.current) {
      alreadySubmittedRef.current = true;
      setAlreadySubmitted(true);
      toast({
        title: "Assessment Auto-Submitted",
        description: "Maximum warnings reached. Your assessment has been submitted.",
        variant: "destructive"
      });
      executeAssessmentGradingEngine();
    }
  };

  const handleRadioOptionSelect = (questionIndex: number, selectedValue: string) => {
    setSelectedAnswers(prev => ({ ...prev, [questionIndex]: selectedValue }));
  };

  // === AUTHORITATIVE AUTOSAVE ===
  // Persists answers to the server via the SECURITY DEFINER RPC
  // autosave_assessment_answers with monotonic revision guarding. The browser
  // is UX only; the server holds the authoritative attempt + answers.
  const autosaveRevisionRef = useRef(0);
  const autosaveInFlightRef = useRef(false);
  const pendingAutosaveRef = useRef(false);

  const flushAutosave = async () => {
    if (!validatedSecureToken || isSubmittingRef.current) return;
    if (autosaveInFlightRef.current) {
      pendingAutosaveRef.current = true;
      return;
    }
    const answersPayload = Object.entries(selectedAnswers).map(([questionId, answer]) => ({
      questionId: String(questionId),
      answer: String(answer)
    }));
    if (answersPayload.length === 0) return;

    autosaveInFlightRef.current = true;
    try {
      const { data, error } = await supabase.rpc("autosave_assessment_answers", {
        p_token: validatedSecureToken,
        p_answers: answersPayload,
        p_revision: autosaveRevisionRef.current + 1
      });
      if (error) throw error;
      if (data?.success) {
        autosaveRevisionRef.current = Number(data.revision || autosaveRevisionRef.current + 1);
      } else if (data?.stale_revision) {
        // A newer revision already exists server-side; adopt it and retry once.
        autosaveRevisionRef.current = Number(data.current_revision || autosaveRevisionRef.current);
      }
    } catch (saveErr) {
      // Network failure during autosave is retried on the next flush; the
      // final submission remains the authoritative grading path.
      console.warn("Autosave deferred:", saveErr);
    } finally {
      autosaveInFlightRef.current = false;
      if (pendingAutosaveRef.current) {
        pendingAutosaveRef.current = false;
        setTimeout(() => { flushAutosave(); }, 300);
      }
    }
  };

  useEffect(() => {
    if (currentStep !== 'test') return;
    const autosaveInterval = setInterval(() => {
      flushAutosave();
    }, 20000);
    return () => clearInterval(autosaveInterval);
  }, [currentStep, validatedSecureToken, selectedAnswers]);

  // === SURGICALLY HARDENED GRADEMENT PIPELINE MATRICES PER EXPLICIT DIRECTIVES ===
  const executeAssessmentGradingEngine = async () => {
    if (!assessmentMeta || !resolvedCandidateId || !validatedSecureToken) {
      console.warn("Assessment grading skipped: missing core credentials");
      setExamResult({
        score: 0,
        correct: 0,
        total: 0,
        passed: false,
        disqualified: true
      });
      setCurrentStep('result');
      return;
    }
    
    setSubmitting(true);
    setIsSubmittingAssessment(true);
    isSubmittingRef.current = true;
    setShowConfirmSubmit(false);

    try {
      // Delegate all grading to server-side edge function — no correct answers touch the browser
      // Edge Functions verify VERIFY_JWT: the anon key satisfies the platform
      // check (token identity comes from the secureToken payload, not the JWT).
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/grade-assessment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            secureToken: validatedSecureToken,
            candidateAnswers: selectedAnswers,
            violationCount: violationCountRef.current,
            proctorLog: proctorLogRef.current
          })
        }
      );

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || "Assessment grading service unavailable.");
      }

      const gradingPayloadResult = await response.json();

      setExamResult({
        score: gradingPayloadResult.score || 0,
        correct: gradingPayloadResult.correct || 0,
        total: gradingPayloadResult.total || 0,
        passed: gradingPayloadResult.passed || false,
        disqualified: gradingPayloadResult.disqualified || false
      });

      terminateMediaProctoringStreams();
      // Terminal transition + server-generated proctoring report (candidate
      // cannot fabricate the report content).
      if (proctorHandleRef.current && validatedSecureToken) {
        await finalizeProctoringSession(proctorHandleRef.current, validatedSecureToken).catch(err =>
          console.warn("Proctoring finalize failed:", err));
        stopHeartbeatRef.current?.();
        stopHeartbeatRef.current = null;
        proctorHandleRef.current = null;
      }
      sessionStorage.removeItem("assessment_secure_session_token");
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }

      setCurrentStep('result');
      toast({ title: "Assessment Submitted Successfully" });

      // Notify HR and Admin about assessment grading & proctoring results
      await notificationService.sendToRole(['hr', 'admin'], {
        title: "Candidate Assessment Completed",
        message: `Candidate finished examination with score ${gradingPayloadResult.score || 0}%. (${violationCountRef.current} proctor incident flags recorded).`,
        type: "assessment",
        link: "/hr/recruitment/proctoring"
      });
    } catch (err: any) {
      toast({ title: "Submission Failed", description: "Could not submit your assessment. Please try again.", variant: "destructive" });
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
                <li>Your hardware webcam and microphone feeds must remain active throughout the examination.</li>
                <li>Exiting proctored fullscreen windows or switching browser tabs will trigger automatic security violation logs.</li>
                <li>Reaching {getMaxViolations()} total violations will force automated exam disqualification.</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {!hardwareApproved ? (
                <Button onClick={initializeHardwareProctoringChannels} disabled={submitting} className="w-full bg-indigo-600 text-white font-bold h-11 text-xs uppercase tracking-wider">
                  <Camera className="w-4 h-4 mr-2" /> Grant Access & Calibrate Peripherals
                </Button>
              ) : (
                <div className="space-y-3">
                  {faceCheckLoading && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs font-bold text-blue-700">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying face identity...
                    </div>
                  )}
                  {faceVerified && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-xs font-bold text-green-700">
                      <ScanFace className="w-4 h-4" />
                      Face verified {faceMatchDistance !== null ? `(match: ${(1 - faceMatchDistance) * 100}%)` : ''}
                    </div>
                  )}
                  {faceCheckError && !faceCheckLoading && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-bold text-red-700">
                      <AlertCircle className="w-4 h-4" />
                      {faceCheckError}
                    </div>
                  )}
                  {!faceModelsReady && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-700">
                      <AlertTriangle className="w-4 h-4" />
                      Face verification models loading. You can proceed, but periodic identity checks will be limited.
                    </div>
                  )}
                  <Button onClick={launchSecureExamWorkspace} className="w-full bg-emerald-600 text-white font-black h-11 text-xs uppercase tracking-widest rounded-xl shadow-md">
                    <Monitor className="w-4 h-4 mr-2" /> Initialize Secure Testing Frame
                  </Button>
                </div>
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
                    <span className="text-sm font-black text-red-950">[{violationCount} / {getMaxViolations()}]</span>
                  </div>
                </div>
                {violationHistory.length > 0 && (
                  <div className="max-h-28 overflow-y-auto space-y-1 border-t border-slate-100 pt-2">
                    {violationHistory.map((v, i) => (
                      <div key={i} className="text-[9px] font-bold text-red-700 flex items-start gap-1 leading-tight">
                        <span className="text-red-400 shrink-0">{v.time}</span>
                        <span className="text-slate-600">{v.type}</span>
                      </div>
                    ))}
                  </div>
                )}
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