/**
 * MediaPipe Face Landmarker temporal analysis — real landmark inference in the
 * browser (Apache-2.0 model + runtime; $0 cost).
 *
 * AUTHORITY BOUNDARY (Session 6): landmarks produce OBSERVATIONS ONLY —
 * head orientation, eye blink, mouth state, geometry consistency. These are
 * probabilistic signals feeding proctoring EVENTS. They are NEVER identity
 * embeddings (that is SFace + server RPC) and never an authorization decision.
 *
 * Model: public/models/mediapipe/face_landmarker/face_landmarker.task
 * (Apache-2.0 — see public/models/LICENSE.md). WASM runtime resolved from the
 * jsdelivr mirror of @mediapipe/tasks-vision (same Apache-2.0 package).
 *
 * Thresholds are documented as EXPERIMENTAL (Session 6 Phase 9 rule): they are
 * initial engineering values, not scientifically validated accuracy claims.
 */
import { FilesetResolver, FaceLandmarker, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';

const WASM_BASE =
  // Self-hosted, version-matched wasm (copied from node_modules at build
  // time into public/mediapipe/wasm). Avoids CDN version-drift, which
  // produced JS/wasm mismatches that silently yielded zero detections.
  '/mediapipe/wasm';
const MODEL_URL = '/models/mediapipe/face_landmarker/face_landmarker.task';

/**
 * EXPERIMENTAL thresholds — initial values, NOT calibrated. Documented per
 * Phase 9: signal, expected range, false-positive/false-negative risk.
 */
export const LANDMARK_THRESHOLDS = {
  /**
   * Head-yaw proxy (nose offset from cheek midpoint, normalized). |yaw| above
   * this = "looking away" candidate signal.
   * FP risk: off-center framing, narrow faces. FN risk: slow deliberate turns
   * just under threshold. Configurable via constant only.
   */
  yawAway: 0.55,
  /** Eye Aspect Ratio below this = eye closed (classic EAR; ~0.16 typical). */
  earClosed: 0.16,
  /** Mouth open when inner-lip distance / face height > this. */
  mouthOpen: 0.055,
  /** Consecutive samples before an observation becomes a sustained signal. */
  samplesPerEvent: 3,
} as const;

/** MediaPipe FaceMesh landmark indices (468-point topology). */
const L_LEFT_EYE_H = [33, 133];   // horizontal corners
const L_LEFT_EYE_V = [159, 145];  // vertical lids
const L_RIGHT_EYE_H = [362, 263];
const L_RIGHT_EYE_V = [386, 374];
const L_MOUTH_V = [13, 14];       // inner lips
const L_FACE_H = [234, 454];      // cheek extremes
const L_CHIN = 152;
const L_FOREHEAD = 10;

export interface LandmarkObservation {
  ran: boolean;
  error: string | null;
  inferenceMs: number;
  faceCount: number;
  /** Eye Aspect Ratios (left, right) — blink signal. */
  earLeft: number | null;
  earRight: number | null;
  /** Normalized mouth openness (0..1). */
  mouthOpen: number | null;
  /** Head-yaw proxy in [-1, 1]; |yaw| > threshold = looking away. */
  yaw: number | null;
  blink: boolean;
  mouthActive: boolean;
  lookingAway: boolean;
}

export interface LandmarkTemporalState {
  closedEyeSamples: number;
  openMouthSamples: number;
  awaySamples: number;
  blinkCount: number;
  lastEyeClosed: boolean;
}

export function createLandmarkTemporalState(): LandmarkTemporalState {
  return {
    closedEyeSamples: 0, openMouthSamples: 0, awaySamples: 0,
    blinkCount: 0, lastEyeClosed: false,
  };
}

let landmarker: FaceLandmarker | null = null;
let loadPromise: Promise<boolean> | null = null;

export async function loadLandmarkEngine(): Promise<boolean> {
  if (landmarker) return true;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numFaces: 2,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
      return true;
    } catch (e) {
      console.error('[landmark-engine] load failed:', e);
      landmarker = null;
      return false;
    }
  })();
  return loadPromise;
}

export function isLandmarkEngineReady(): boolean {
  return !!landmarker;
}

function ear(v: Float32Array | number[], h0: number, h1: number, v0: number, v1: number): number {
  const dh = Math.hypot(v[h0 * 3] - v[h1 * 3], v[h0 * 3 + 1] - v[h1 * 3 + 1]);
  const dv = Math.hypot(v[v0 * 3] - v[v1 * 3], v[v0 * 3 + 1] - v[v1 * 3 + 1]);
  return dh > 0 ? dv / dh : 1;
}

/** Analyze one video frame at a wall-clock timestamp (VIDEO running mode). */
export function analyzeLandmarks(
  video: HTMLVideoElement, timestampMs: number,
): LandmarkObservation {
  const base: LandmarkObservation = {
    ran: false, error: null, inferenceMs: 0, faceCount: 0,
    earLeft: null, earRight: null, mouthOpen: null, yaw: null,
    blink: false, mouthActive: false, lookingAway: false,
  };
  if (!landmarker || !video.videoWidth) return { ...base, error: 'LANDMARK_ENGINE_NOT_LOADED' };
  try {
    const t0 = performance.now();
    const res: FaceLandmarkerResult = landmarker.detectForVideo(video, timestampMs);
    const ms = Math.round(performance.now() - t0);
    const faces = res.faceLandmarks ?? [];
    if (faces.length === 0) return { ...base, ran: true, inferenceMs: ms, faceCount: 0 };

    const v = faces[0] as unknown as Float32Array | number[];
    const earL = ear(v, L_LEFT_EYE_H[0], L_LEFT_EYE_H[1], L_LEFT_EYE_V[0], L_LEFT_EYE_V[1]);
    const earR = ear(v, L_RIGHT_EYE_H[0], L_RIGHT_EYE_H[1], L_RIGHT_EYE_V[0], L_RIGHT_EYE_V[1]);
    const mouth = Math.hypot(v[L_MOUTH_V[0] * 3] - v[L_MOUTH_V[1] * 3], v[L_MOUTH_V[0] * 3 + 1] - v[L_MOUTH_V[1] * 3 + 1]);
    const faceH = Math.hypot(v[L_FOREHEAD * 3] - v[L_CHIN * 3], v[L_FOREHEAD * 3 + 1] - v[L_CHIN * 3 + 1]);
    const faceW = Math.hypot(v[L_FACE_H[0] * 3] - v[L_FACE_H[1] * 3], v[L_FACE_H[0] * 3 + 1] - v[L_FACE_H[1] * 3 + 1]);
    // Head-yaw proxy: nose-tip horizontal offset from the cheek midpoint,
    // normalized by face width. Frontal ≈ 0; strong turn approaches ±1.
    const noseX = v[1 * 3];
    const cheekMidX = (v[L_FACE_H[0] * 3] + v[L_FACE_H[1] * 3]) / 2;
    const yaw = faceW > 0 ? Math.max(-1, Math.min(1, (noseX - cheekMidX) / (faceW * 0.35))) : 0;
    const mouthOpenNorm = faceH > 0 ? mouth / faceH : 0;

    return {
      ran: true, error: null, inferenceMs: ms, faceCount: faces.length,
      earLeft: earL, earRight: earR, mouthOpen: mouthOpenNorm, yaw,
      blink: earL < LANDMARK_THRESHOLDS.earClosed && earR < LANDMARK_THRESHOLDS.earClosed,
      mouthActive: mouthOpenNorm > LANDMARK_THRESHOLDS.mouthOpen,
      lookingAway: Math.abs(yaw) > LANDMARK_THRESHOLDS.yawAway,
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : 'LANDMARK_INFERENCE_FAILED' };
  }
}

/**
 * Temporal aggregation — one noisy frame never becomes an event
 * (Session 6 Phase 10). Returns observation flags; the server decides.
 */
export function classifyLandmarksTemporal(
  st: LandmarkTemporalState, obs: LandmarkObservation,
): LandmarkObservation & { sustainedAway: boolean; sustainedMouth: boolean; blinkObserved: boolean } {
  if (!obs.ran || obs.faceCount === 0) {
    // Reset streaks when no landmarks (tracking lost) — face presence itself
    // is handled by the YuNet temporal path, not duplicated here.
    st.closedEyeSamples = 0; st.openMouthSamples = 0; st.awaySamples = 0;
    return { ...obs, sustainedAway: false, sustainedMouth: false, blinkObserved: false };
  }
  if (obs.blink && !st.lastEyeClosed) st.blinkCount++;
  st.lastEyeClosed = obs.blink;

  st.closedEyeSamples = obs.blink ? st.closedEyeSamples + 1 : 0;
  st.openMouthSamples = obs.mouthActive ? st.openMouthSamples + 1 : 0;
  st.awaySamples = obs.lookingAway ? st.awaySamples + 1 : 0;

  const n = LANDMARK_THRESHOLDS.samplesPerEvent;
  return {
    ...obs,
    sustainedAway: st.awaySamples >= n,
    sustainedMouth: st.openMouthSamples >= n,
    blinkObserved: st.blinkCount >= 1,
  };
}
