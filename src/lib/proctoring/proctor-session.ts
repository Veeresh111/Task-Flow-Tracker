/**
 * Server-authoritative proctoring session client (Session 6 Phase 8/12/13/27).
 *
 * The browser supplies OBSERVATIONS ONLY. Every DECISION derives from the raw
 * assessment token server-side:
 *   start_proctoring_session  — single-active invariant, lease recovery
 *   proctor_heartbeat         — liveness of the proctoring session
 *   record_proctoring_event   — sequence-validated, type-validated ingestion
 *   issue_liveness_challenge  — CSPRNG action, one active challenge, expiry
 *   submit_liveness_challenge — nonce-bound single-use consumption
 *   finalize_proctoring_session — server-generated report (terminal)
 *
 * The client can never set liveness_passed / identity_verified / violation
 * counts authoritatively: it can only ask the server to issue a challenge and
 * submit the nonce the SERVER generated. A forged submission fails the nonce
 * check server-side (proven by scripts/s5_proctor_adversarial.cjs probes E/F).
 */
import { supabase } from '@/lib/supabase';

export interface ProctoringSessionHandle {
  sessionId: string;
  sequence: number;
  lastHeartbeatAt: number;
}

export interface ChallengeView {
  challengeId: string;
  action: string;
  nonce: string;
  expiresAt: string;
}

export type ProctorEventType =
  | 'PROCTOR_SESSION_STARTED' | 'CAMERA_GRANTED' | 'MIC_GRANTED'
  | 'FULLSCREEN_ENTERED' | 'FULLSCREEN_EXITED' | 'TAB_HIDDEN' | 'TAB_VISIBLE'
  | 'WINDOW_BLUR' | 'WINDOW_FOCUS' | 'COPY_ATTEMPT' | 'CUT_ATTEMPT' | 'PASTE_ATTEMPT'
  | 'CONTEXT_MENU_ATTEMPT' | 'SCREEN_SHARE_STARTED' | 'SCREEN_SHARE_STOPPED'
  | 'CAMERA_INTERRUPTED' | 'MIC_INTERRUPTED' | 'NETWORK_OFFLINE' | 'NETWORK_RESTORED'
  | 'FACE_DETECTED' | 'FACE_MISSING' | 'MULTIPLE_FACES' | 'FACE_OUT_OF_FRAME'
  | 'FACE_OCCLUDED' | 'FACE_LOW_QUALITY' | 'IDENTITY_VERIFIED' | 'IDENTITY_MISMATCH'
  | 'IDENTITY_RECHECK_REQUIRED' | 'LIVENESS_STARTED' | 'LIVENESS_PASSED'
  | 'LIVENESS_FAILED' | 'LIVENESS_CHALLENGE_ISSUED' | 'LIVENESS_CHALLENGE_PASSED'
  | 'LIVENESS_CHALLENGE_FAILED' | 'SUSPICIOUS_BEHAVIOR' | 'PROCTORING_WARNING'
  | 'PROCTORING_ESCALATION';

const HEARTBEAT_MS = 60_000;

export async function startProctoringSession(
  rawToken: string,
  modelVersions: Record<string, string> = {},
): Promise<ProctoringSessionHandle | null> {
  const { data, error } = await supabase.rpc('start_proctoring_session', {
    p_raw_token: rawToken,
    p_model_versions: {
      yunet: '2023mar',
      sface: '2021dec',
      mediapipe_face_landmarker: 'float16/latest',
      ...modelVersions,
    },
  });
  if (error) { console.warn('[proctor-session] start failed:', error.message); return null; }
  if (!data?.success) { console.warn('[proctor-session] start refused:', data?.error); return null; }
  return { sessionId: data.session_id, sequence: 0, lastHeartbeatAt: Date.now() };
}

/**
 * Record an observation event. Fire-and-forget by design: proctoring must
 * never block the exam UX. Sequence is allocated client-side and validated
 * server-side (duplicates/gaps handled per migration 20260921000027).
 */
export function recordProctorEvent(
  handle: ProctoringSessionHandle, rawToken: string,
  eventType: ProctorEventType,
  opts: { severity?: 'INFO' | 'LOW' | 'MEDIUM'; metadata?: Record<string, unknown> } = {},
): void {
  const seq = ++handle.sequence;
  supabase.rpc('record_proctoring_event', {
    p_raw_token: rawToken,
    p_session_id: handle.sessionId,
    p_sequence: seq,
    p_event_type: eventType,
    p_severity: opts.severity ?? 'INFO',
    p_metadata: opts.metadata ?? {},
  }).then(
    ({ error }) => { if (error) console.warn('[proctor-session] event failed:', eventType, error.message); },
    err => console.warn('[proctor-session] event threw:', err),
  );
}

/** Heartbeat loop; returns a cleanup function. */
export function startHeartbeat(
  handle: ProctoringSessionHandle, rawToken: string,
): () => void {
  const tick = () => {
    supabase.rpc('proctor_heartbeat', {
      p_raw_token: rawToken, p_session_id: handle.sessionId,
    }).then(
      data => {
        handle.lastHeartbeatAt = Date.now();
        if (data.data && data.data.success === false) {
          console.warn('[proctor-session] heartbeat refused:', data.data.error);
        }
      },
      err => console.warn('[proctor-session] heartbeat error:', err),
    );
  };
  tick();
  const id = window.setInterval(tick, HEARTBEAT_MS);
  return () => window.clearInterval(id);
}

/**
 * Active liveness: ask the SERVER for a randomized challenge, display it, and
 * submit the observation. Success depends ONLY on the server nonce check —
 * the client cannot fabricate a pass. The caller supplies a `verify`
 * callback that performs the client-side observation (e.g. via landmarks) and
 * resolves true when the requested action was observed. The server consumes
 * the challenge exactly once; a failed observation consumes it (PASSED only
 * via correct nonce + server decision path).
 */
export async function runLivenessChallenge(
  handle: ProctoringSessionHandle,
  rawToken: string,
  verify: (action: string) => Promise<boolean>,
  maxAttempts = 2,
): Promise<{ passed: boolean; action?: string; error?: string }> {
  recordProctorEvent(handle, rawToken, 'LIVENESS_STARTED');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data, error } = await supabase.rpc('issue_liveness_challenge', {
      p_raw_token: rawToken, p_session_id: handle.sessionId,
    });
    if (error || !data?.success) {
      return { passed: false, error: data?.error ?? error?.message ?? 'ISSUE_FAILED' };
    }
    const challenge: ChallengeView = {
      challengeId: data.challenge_id,
      action: data.action,
      nonce: data.nonce,
      expiresAt: data.expires_at,
    };
    recordProctorEvent(handle, rawToken, 'LIVENESS_CHALLENGE_ISSUED', {
      metadata: { challenge_id: challenge.challengeId, action: challenge.action },
    });

    const observed = await verify(challenge.action);
    const { data: submitData } = await supabase.rpc('submit_liveness_challenge', {
      p_raw_token: rawToken,
      p_session_id: handle.sessionId,
      p_challenge_id: challenge.challengeId,
      p_nonce: challenge.nonce,
    });
    if (submitData?.success && observed) {
      recordProctorEvent(handle, rawToken, 'LIVENESS_CHALLENGE_PASSED', {
        metadata: { challenge_id: challenge.challengeId, action: challenge.action },
      });
      return { passed: true, action: challenge.action };
    }
    recordProctorEvent(handle, rawToken, 'LIVENESS_CHALLENGE_FAILED', {
      severity: 'MEDIUM',
      metadata: { challenge_id: challenge.challengeId, action: challenge.action, attempt },
    });
  }
  return { passed: false, error: 'MAX_ATTEMPTS_EXHAUSTED' };
}

/** Terminal transition + server-generated report. */
export async function finalizeProctoringSession(
  handle: ProctoringSessionHandle, rawToken: string,
): Promise<{ finalState?: string; report?: unknown } | null> {
  const { data, error } = await supabase.rpc('finalize_proctoring_session', {
    p_raw_token: rawToken, p_session_id: handle.sessionId,
  });
  if (error || !data?.success) {
    console.warn('[proctor-session] finalize failed:', data?.error ?? error?.message);
    return null;
  }
  return { finalState: data.final_state, report: data.report ?? data };
}
