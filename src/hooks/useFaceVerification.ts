/**
 * Face verification for proctored assessments.
 *
 * PRIMARY ENGINE (Session 6): real ONNX inference in the browser —
 *   YuNet detection + SFace 128-d recognition embeddings
 *   (opencv/opencv_zoo, Apache-2.0; see public/models/opencv-zoo/LICENSE).
 * FALLBACK: face-api.js (real 128-d embeddings).
 * REMOVED: MediaPipe BlazeFace pseudo-descriptors (keypoint-derived vectors
 * are NOT recognition embeddings and must not back an identity decision).
 *
 * AUTHORITY BOUNDARY: this module produces OBSERVATIONS (faces, embeddings).
 * Every identity DECISION is made server-side:
 *   anonymous exam path → enroll_candidate_biometric_token(raw_token, ...)
 *                          verify_candidate_biometric_face_token(raw_token, ...)
 *   authenticated path  → enroll_authenticated_biometric(descriptor, ...)
 * The client never supplies candidate identity and never decides "verified".
 */

import * as faceapi from 'face-api.js';
import {
  loadCvEngine, isCvEngineReady, analyzeFrame,
  type FrameAnalysis,
} from '../lib/proctoring/cv-engine';

const FACE_API_MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

export interface FaceVerificationState {
  modelsLoaded: boolean;
  modelsLoading: boolean;
  loadError: string | null;
  /** 'onnx' = YuNet+SFace primary engine; 'faceapi' = fallback. */
  engine: 'onnx' | 'faceapi' | null;
}

export interface FaceDetectionResult {
  detected: boolean;
  /** SFace 128-d embedding (primary) or face-api.js 128-d descriptor (fallback). */
  descriptor: Float32Array | null;
  confidence: number;
  faceCount: number;
  multipleFaces: boolean;
  /** Raw analysis when the ONNX engine ran (landmarks, timing, quality). */
  analysis?: FrameAnalysis;
}

let faceApiReady = false;
let engineState: FaceVerificationState = {
  modelsLoaded: false, modelsLoading: false, loadError: null, engine: null,
};

/**
 * Initialize the CV stack: ONNX YuNet+SFace first, face-api.js as fallback.
 */
export async function loadFaceModels(): Promise<boolean> {
  if (engineState.modelsLoaded) return true;

  engineState = { ...engineState, modelsLoading: true };

  // Attempt 1: real YuNet + SFace via onnxruntime-web.
  const onnxReady = await loadCvEngine();
  if (onnxReady) {
    engineState = {
      modelsLoaded: true, modelsLoading: false, loadError: null, engine: 'onnx',
    };
    console.info('[FaceVerification] ONNX YuNet+SFace engine ready');
    return true;
  }

  // Attempt 2: face-api.js fallback (real embeddings, weaker detector).
  try {
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_API_MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL),
    ]);
    faceApiReady = true;
    engineState = {
      modelsLoaded: true, modelsLoading: false, loadError: null, engine: 'faceapi',
    };
    console.info('[FaceVerification] face-api.js fallback loaded');
    return true;
  } catch (faceApiErr) {
    const message = faceApiErr instanceof Error ? faceApiErr.message : 'Failed to load face detection models';
    engineState = {
      modelsLoaded: false, modelsLoading: false, loadError: message, engine: null,
    };
    console.error('[FaceVerification] All face engines failed:', message);
    return false;
  }
}

export function getFaceVerificationState(): FaceVerificationState {
  return engineState;
}

/**
 * Detect faces and compute a recognition embedding for the given element.
 * Primary path runs actual YuNet + SFace ONNX inference on the element's pixels.
 */
export async function detectFace(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<FaceDetectionResult> {
  if (!engineState.modelsLoaded) {
    return { detected: false, descriptor: null, confidence: 0, faceCount: 0, multipleFaces: false };
  }

  // ---- Primary: real YuNet + SFace ONNX inference ----
  if (engineState.engine === 'onnx' && isCvEngineReady()) {
    // Normalize the input to a canvas with pixel data.
    let canvas: HTMLCanvasElement;
    if (input instanceof HTMLCanvasElement) {
      canvas = input;
    } else {
      const w = input instanceof HTMLVideoElement ? input.videoWidth : (input as HTMLImageElement).naturalWidth;
      const h = input instanceof HTMLVideoElement ? input.videoHeight : (input as HTMLImageElement).naturalHeight;
      if (!w || !h) {
        return { detected: false, descriptor: null, confidence: 0, faceCount: 0, multipleFaces: false };
      }
      canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const c2d = canvas.getContext('2d');
      if (!c2d) return { detected: false, descriptor: null, confidence: 0, faceCount: 0, multipleFaces: false };
      c2d.drawImage(input, 0, 0);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return { detected: false, descriptor: null, confidence: 0, faceCount: 0, multipleFaces: false };
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const analysis = await analyzeFrame(imageData.data, canvas.width, canvas.height);

    if (analysis.error || analysis.faceCount === 0) {
      return {
        detected: false, descriptor: null, confidence: 0,
        faceCount: analysis.faceCount, multipleFaces: analysis.faceCount > 1,
        analysis,
      };
    }
    const best = analysis.faces.reduce((a, b) => (b.score > a.score ? b : a));
    return {
      detected: true,
      descriptor: analysis.primaryEmbedding,
      confidence: best.score,
      faceCount: analysis.faceCount,
      multipleFaces: analysis.faceCount > 1,
      analysis,
    };
  }

  // ---- Fallback: face-api.js (real 128-d embeddings) ----
  if (engineState.engine === 'faceapi' && faceApiReady) {
    try {
      const allDetections = await faceapi
        .detectAllFaces(input)
        .withFaceLandmarks()
        .withFaceDescriptors();

      const faceCount = allDetections.length;
      if (faceCount === 0) {
        return { detected: false, descriptor: null, confidence: 0, faceCount: 0, multipleFaces: false };
      }
      const best = allDetections.reduce((a, b) =>
        a.detection.score > b.detection.score ? a : b
      );
      return {
        detected: true,
        descriptor: best.descriptor,
        confidence: best.detection.score,
        faceCount,
        multipleFaces: faceCount > 1,
      };
    } catch (err) {
      console.warn('[FaceVerification] face-api.js detection error:', err);
      return { detected: false, descriptor: null, confidence: 0, faceCount: 0, multipleFaces: false };
    }
  }

  return { detected: false, descriptor: null, confidence: 0, faceCount: 0, multipleFaces: false };
}

// NOTE: localStorage-based descriptor storage was REMOVED (Sessions 5–6).
// The browser is never the authoritative biometric store.

/**
 * Compare two face descriptors.
 * SFace embeddings match on cosine similarity (threshold 0.363, opencv_zoo
 * benchmark); face-api.js descriptors match on Euclidean distance (< 0.6).
 * Distance/similarity are observations — the server decides authorization.
 */
export function compareFaceDescriptors(
  descriptor1: Float32Array,
  descriptor2: Float32Array
): { match: boolean; distance: number } {
  let sum = 0;
  const len = Math.min(descriptor1.length, descriptor2.length);
  for (let i = 0; i < len; i++) {
    const diff = descriptor1[i] - descriptor2[i];
    sum += diff * diff;
  }
  const distance = Math.sqrt(sum);

  // SFace embeddings are L2-normalized by the caller; distance range differs
  // from face-api.js. Keep the legacy 0.6 threshold for face-api.js vectors.
  const threshold = engineState.engine === 'onnx' ? 1.1 : 0.6;

  return {
    match: distance < threshold,
    distance,
  };
}
