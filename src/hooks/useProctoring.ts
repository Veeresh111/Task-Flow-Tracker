import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface ProctorEvent {
  type: string;
  timestamp: string;
  severity: "info" | "warning" | "critical";
  detail?: string;
}

interface UseProctoringOptions {
  assessmentTokenId: string;
  candidateId: string;
  onViolation?: (event: ProctorEvent) => void;
  maxWarnings?: number;
}

export function useProctoring({ assessmentTokenId, candidateId, onViolation, maxWarnings = 5 }: UseProctoringOptions) {
  const [warningCount, setWarningCount] = useState(0);
  const [isFlagged, setIsFlagged] = useState(false);
  const [isDisqualified, setIsDisqualified] = useState(false);
  const eventsRef = useRef<ProctorEvent[]>([]);
  const warningCountRef = useRef(0);

  const logViolation = useCallback(async (event: ProctorEvent) => {
    eventsRef.current.push(event);
    warningCountRef.current += event.severity === "critical" ? 2 : 1;
    setWarningCount(warningCountRef.current);
    onViolation?.(event);

    if (warningCountRef.current >= maxWarnings) {
      setIsDisqualified(true);
      await supabase.from("assessment_tokens").update({ status: "Disqualified" }).eq("id", assessmentTokenId);
    } else if (warningCountRef.current >= maxWarnings - 2) {
      setIsFlagged(true);
    }
  }, [assessmentTokenId, maxWarnings, onViolation]);

  const logEvent = useCallback(async (type: string, severity: ProctorEvent["severity"], detail?: string) => {
    const event: ProctorEvent = { type, timestamp: new Date().toISOString(), severity, detail };
    eventsRef.current.push(event);

    await supabase.from("proctoring_logs").insert({
      assessment_token_id: assessmentTokenId,
      candidate_id: candidateId,
      violation_type: type,
      timestamp: event.timestamp,
      severity,
      detail: detail || null,
    }).catch(() => {});

    if (severity !== "info") {
      warningCountRef.current += severity === "critical" ? 2 : 1;
      setWarningCount(warningCountRef.current);
      onViolation?.(event);

      if (warningCountRef.current >= maxWarnings) {
        setIsDisqualified(true);
        await supabase.from("assessment_tokens").update({ status: "Disqualified" }).eq("id", assessmentTokenId);
      } else if (warningCountRef.current >= maxWarnings - 2) {
        setIsFlagged(true);
      }
    }
  }, [assessmentTokenId, candidateId, maxWarnings, onViolation]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        logEvent("tab_switch", "warning", "Candidate switched away from assessment tab");
      }
    };

    const handleBlur = () => {
      logEvent("window_blur", "warning", "Assessment window lost focus");
    };

    const handleFocus = () => {
      logEvent("window_focus", "info", "Assessment window regained focus");
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      logEvent("copy_attempt", "warning", "Copy action prevented");
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      logEvent("paste_attempt", "warning", "Paste action prevented");
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      logEvent("right_click", "warning", "Right-click prevented");
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        logEvent("fullscreen_exit", "critical", "Candidate exited fullscreen mode");
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.fullscreenElement) {
        logEvent("fullscreen_exit_attempt", "warning", "Candidate attempted to exit fullscreen via Escape");
      }
      if (e.ctrlKey && e.shiftKey && ["I", "J", "C", "U"].includes(e.key.toUpperCase())) {
        e.preventDefault();
        logEvent("devtools_attempt", "critical", "Developer tools shortcut prevented");
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [logEvent]);

  return {
    warningCount,
    isFlagged,
    isDisqualified,
    events: eventsRef.current,
    logEvent,
  };
}
