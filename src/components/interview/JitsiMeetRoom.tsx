import { useRef, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface JitsiMeetRoomProps {
  roomName: string;
  displayName: string;
  email?: string;
  onReady?: () => void;
  onLeave?: () => void;
  width?: string | number;
  height?: string | number;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

export default function JitsiMeetRoom({
  roomName,
  displayName,
  email,
  onReady,
  onLeave,
  width = "100%",
  height = 600,
}: JitsiMeetRoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);

  const sanitizedRoomName = roomName
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .substring(0, 50);

  const initJitsi = useCallback(() => {
    if (!containerRef.current || !window.JitsiMeetExternalAPI) return;

    if (apiRef.current) {
      apiRef.current.dispose();
      apiRef.current = null;
    }

    const domain = "meet.jit.si";
    const options = {
      roomName: sanitizedRoomName,
      width,
      height,
      parentNode: containerRef.current,
      userInfo: {
        displayName: displayName || "Participant",
        email: email || "",
      },
      configOverrides: {
        startWithAudioMuted: true,
        startWithVideoMuted: false,
        disableDeepLinking: true,
        prejoinPageEnabled: false,
        toolbarButtons: [
          "microphone", "camera", "desktop", "chat",
          "raisehand", "tileview", "fullscreen",
          "settings", "download", "help",
        ],
      },
      interfaceConfigOverrides: {
        TOOLBAR_ALWAYS_VISIBLE: true,
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
      },
    };

    try {
      apiRef.current = new window.JitsiMeetExternalAPI(domain, options);
      apiRef.current.addListener("readyToClose", () => onLeave?.());
      apiRef.current.addListener("videoConferenceJoined", () => onReady?.());
    } catch (err) {
      console.warn("[Jitsi] Failed to initialize:", err);
    }
  }, [sanitizedRoomName, displayName, email, width, height, onReady, onLeave]);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.onload = initJitsi;
    document.body.appendChild(script);

    return () => {
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [initJitsi]);

  return (
    <div className="relative" style={{ width, height }}>
      <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-xl">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-2 text-sm font-medium text-slate-500">Connecting to meeting...</span>
      </div>
      <div
        ref={containerRef}
        className="relative z-10 rounded-xl overflow-hidden border border-slate-200 shadow-lg"
        style={{ width, height }}
      />
    </div>
  );
}
