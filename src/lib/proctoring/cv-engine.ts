/**
 * Real computer-vision proctoring engine — actual ONNX inference in the browser.
 *
 * Models (Apache-2.0, opencv/opencv_zoo):
 *  - YuNet  face_detection_yunet_2023mar.onnx   (detection + 5 landmarks)
 *  - SFace  face_recognition_sface_2021dec.onnx (128-d embeddings)
 *
 * AUTHORITY BOUNDARY (per Session 6 spec): the browser computes OBSERVATIONS
 * (face count, landmarks, embeddings). All identity/liveness DECISIONS remain
 * server-side (proctoring RPCs + grader). This engine never sets
 * identity_verified/liveness_passed locally.
 */
import * as ort from 'onnxruntime-web';
import {
  decodeYuNet, getSimilarityTransform, warpAffine112, toSFaceBlob,
  cosineMatch, type YuNetFace,
} from './cv-math';

const YUNET_URL = '/models/opencv-zoo/face_detection_yunet_2023mar.onnx';
const SFACE_URL = '/models/opencv-zoo/face_recognition_sface_2021dec.onnx';
/**
 * YuNet 2023mar graph input is FIXED at 640x640 (verified against ORT:
 * "Got invalid dimensions ... Expected: 640"). All frames are resized into
 * that geometry; YuNetFace coordinates are scaled back to frame space.
 */
const YUNET_INPUT_W = 640;
const YUNET_INPUT_H = 640;

export interface FrameAnalysis {
  faceCount: number;
  faces: YuNetFace[];
  primaryEmbedding: Float32Array | null;
  /** Alignment quality of the primary face (bbox area fraction). */
  faceSizeRatio: number;
  inferenceMs: number;
  engineReady: boolean;
  error: string | null;
}

/** Documented, experimental (not scientifically calibrated) thresholds. */
export const CV_THRESHOLDS = {
  /** SFace FR_COSINE documented similarity threshold (opencv_zoo benchmark). */
  sfaceCosineMatch: 0.363,
  /** bbox min width in px on the analysis canvas. */
  minFaceWidthPx: 40,
  yunetConf: 0.72,
  /**
   * Face width range sanity (px, in ORIGINAL frame space): rejects anchor
   * noise (≤ stride px) and frame-wide hallucinations from aspect-stretched
   * inference. EXPERIMENTAL — tuned against live YuNet 2023mar output.
   */
  maxFaceWidthRatio: 0.85,
  maxFaceHeightRatio: 0.85,
} as const;

let yunetSession: ort.InferenceSession | null = null;
let sfaceSession: ort.InferenceSession | null = null;
// Cached offscreen canvases for the bilinear blob resample (see analyzeFrame).
let blobSrcCanvas: HTMLCanvasElement | null = null;
let blobSrcCtx: CanvasRenderingContext2D | null = null;
let blobDstCanvas: HTMLCanvasElement | null = null;
let blobDstCtx: CanvasRenderingContext2D | null = null;
let engineLoadPromise: Promise<boolean> | null = null;

export async function loadCvEngine(): Promise<boolean> {
  if (yunetSession && sfaceSession) return true;
  if (engineLoadPromise) return engineLoadPromise;
  engineLoadPromise = (async () => {
    try {
      ort.env.wasm.numThreads = 1; // CPU-safe; avoids COOP/COEP requirement
      // Serve the ORT wasm runtime from self-hosted static assets (copied to
      // public/ort-wasm/). Vite's dep optimizer serves the node_modules copy
      // with the wrong MIME type, which breaks WebAssembly compilation.
      ort.env.wasm.wasmPaths = '/ort-wasm/';
      yunetSession = await ort.InferenceSession.create(YUNET_URL, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      sfaceSession = await ort.InferenceSession.create(SFACE_URL, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      return true;
    } catch (e) {
      console.error('[cv-engine] model load failed:', e);
      yunetSession = null; sfaceSession = null;
      return false;
    }
  })();
  return engineLoadPromise;
}

export function isCvEngineReady(): boolean {
  return !!(yunetSession && sfaceSession);
}

/**
 * Analyze one RGBA frame. Real inference: YuNet detects + aligns + SFace embeds.
 * Returns observations only — never authorization decisions.
 */
export async function analyzeFrame(
  pixels: Uint8ClampedArray, width: number, height: number,
): Promise<FrameAnalysis> {
  const t0 = performance.now();
  const base: FrameAnalysis = {
    faceCount: 0, faces: [], primaryEmbedding: null,
    faceSizeRatio: 0, inferenceMs: 0, engineReady: isCvEngineReady(), error: null,
  };
  if (!isCvEngineReady()) return { ...base, error: 'CV_ENGINE_NOT_LOADED' };

  try {
    // --- YuNet: FIXED 640x640 input — resize the incoming frame into that
    // geometry (stretch; camera aspect is near-square after centering).
    // Build NCHW BGR blob (OpenCV blobFromImage default, scale=1).
    const pw = YUNET_INPUT_W, ph = YUNET_INPUT_H;
    // OpenCV's blobFromImage resizes with INTER_LINEAR (bilinear). Reproduce
    // that with canvas drawImage instead of a hand-rolled nearest-neighbor
    // loop: NN block artifacts measurably produce a duplicate detection
    // swarm (54 boxes for ONE face in live testing) that no sane NMS can
    // collapse, while the bilinear path yields a single clean detection.
    // Offscreen canvases are cached module-side to avoid per-frame GC churn.
    if (!blobSrcCanvas) {
      blobSrcCanvas = document.createElement('canvas');
      blobSrcCtx = blobSrcCanvas.getContext('2d', { willReadFrequently: true });
      blobDstCanvas = document.createElement('canvas');
      blobDstCtx = blobDstCanvas.getContext('2d', { willReadFrequently: true });
    }
    blobSrcCanvas!.width = width; blobSrcCanvas!.height = height;
    blobSrcCtx!.putImageData(new ImageData(pixels, width, height), 0, 0);
    blobDstCanvas!.width = pw; blobDstCanvas!.height = ph;
    // imageSmoothingEnabled=true (default) == bilinear — do NOT disable.
    blobDstCtx!.drawImage(blobSrcCanvas!, 0, 0, pw, ph);
    const rd = blobDstCtx!.getImageData(0, 0, pw, ph).data;
    const blob = new Float32Array(3 * ph * pw);
    const plane = ph * pw;
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const si = (y * pw + x) * 4;
        const di = y * pw + x;
        // OpenCV BGR planar; no scaling (blobFromImage scale=1)
        blob[di] = rd[si + 2];
        blob[plane + di] = rd[si + 1];
        blob[2 * plane + di] = rd[si];
      }
    }
    const feeds: Record<string, ort.Tensor> = {
      input: new ort.Tensor('float32', blob, [1, 3, ph, pw]),
    };
    const out = await yunetSession!.run(feeds);
    // Output names from the ONNX: cls_8..kps_32 — fetch in the documented order.
    const names = yunetSession!.outputNames; // canonical order preserved by ORT
    const ordered = names.map(n => out[n].data as Float32Array);
    // Scale detection coordinates from the 640x640 inference space back to
    // the original frame space FIRST (filters use frame-space geometry).
    const scaleX = width / pw, scaleY = height / ph;
    const iouOf = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => {
      const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
      const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
      const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
      return inter / (a.w * a.h + b.w * b.h - inter);
    };
    /** Fraction of `inner` covered by `outer` (containment, not IoU). */
    const containmentRatio = (inner: { x: number; y: number; w: number; h: number }, outer: { x: number; y: number; w: number; h: number }) => {
      const x1 = Math.max(inner.x, outer.x), y1 = Math.max(inner.y, outer.y);
      const x2 = Math.min(inner.x + inner.w, outer.x + outer.w), y2 = Math.min(inner.y + inner.h, outer.y + outer.h);
      const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
      const area = Math.max(1, inner.w * inner.h);
      return inter / area;
    };
    const scaled = decodeYuNet(ordered, pw, ph, CV_THRESHOLDS.yunetConf).map(f => ({
      ...f,
      x: f.x * scaleX, y: f.y * scaleY,
      w: f.w * scaleX, h: f.h * scaleY,
      landmarks: f.landmarks.map((v, i) => (i % 2 === 0 ? v * scaleX : v * scaleY)),
    }));
    // Size/clamp filters, then greedy duplicate merge (see rationale below).
    const sizeFiltered = scaled
      // Anchor-scale false positives: the live model emits many stride-sized
      // boxes (≈stride px) that pass the confidence threshold on textured
      // input. Real faces at this resolution are ≥40px. EXPERIMENTAL bound.
      .filter(f => f.w >= CV_THRESHOLDS.minFaceWidthPx && f.h >= CV_THRESHOLDS.minFaceWidthPx)
      // Sanity clamp: a "face" filling/overflowing the frame is a stretched
      // inference artifact, not a person. EXPERIMENTAL bound.
      .filter(f => f.w <= width * CV_THRESHOLDS.maxFaceWidthRatio
                && f.h <= height * CV_THRESHOLDS.maxFaceHeightRatio);
    // Merge remaining heavily-overlapping detections. IoU-NMS alone cannot
    // collapse the duplicate swarm the live model emits over one face:
    // offset/scale-variant boxes chain pairwise-IoU < 0.3 while covering
    // the same face, and equal-score duplicates defeat strict-dominance
    // filters. Greedy score-ordered dedup against the KEPT set, discarding
    // any box that overlaps/is-contained/centers-inside a kept box, handles
    // chains and ties. Genuinely distinct faces keep their centers outside
    // each other's boxes → a real second person is still detected (the
    // multi-face gate stays live).
    const faces = [...sizeFiltered].sort((a, b) => b.score - a.score);
    const kept: typeof scaled = [];
    for (const f of faces) {
      const duplicate = kept.some(d => (
        iouOf(d, f) > 0.4
        || containmentRatio(f, d) > 0.55
        || containmentRatio(d, f) > 0.55
        || (f.x + f.w / 2 > d.x && f.x + f.w / 2 < d.x + d.w
          && f.y + f.h / 2 > d.y && f.y + f.h / 2 < d.y + d.h)
      ));
      if (!duplicate) kept.push(f);
    }

    let primaryEmbedding: Float32Array | null = null;
    let faceSizeRatio = 0;
    if (faces.length > 0) {
      const best = faces.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
      faceSizeRatio = (best.w * best.h) / (width * height);
      if (best.w >= CV_THRESHOLDS.minFaceWidthPx) {
        // --- SFace: Umeyama align to 112x112, NCHW RGB, 128-d embedding ---
        const M = getSimilarityTransform(best.landmarks);
        const rgb = warpAffine112(pixels, width, height, M);
        const sblob = toSFaceBlob(rgb);
        // SFace graph input is named 'data' (verified: session.inputNames).
        const sfeed = { data: new ort.Tensor('float32', sblob, [1, 3, 112, 112]) };
        const sres = await sfaceSession!.run(sfeed);
        const embedding = sres[sfaceSession!.outputNames[0]].data as Float32Array;
        primaryEmbedding = embedding; // raw (L2-normalized at match time)
      }
    }

    return {
      faceCount: faces.length,
      faces,
      primaryEmbedding,
      faceSizeRatio,
      inferenceMs: Math.round(performance.now() - t0),
      engineReady: true,
      error: null,
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : 'CV_INFERENCE_FAILED' };
  }
}

/** Cosine similarity between two raw SFace embeddings (FR_COSINE semantics). */
export function similarity(a: Float32Array, b: Float32Array): number {
  return cosineMatch(a, b);
}

// ---------------------------------------------------------------------------
// Temporal hysteresis: no decision from a single frame.
// ---------------------------------------------------------------------------
export interface TemporalState {
  missingFrames: number;
  multiFaceFrames: number;
  mismatchStreak: number;
  lastEmbedding: Float32Array | null;
}

export function createTemporalState(): TemporalState {
  return { missingFrames: 0, multiFaceFrames: 0, mismatchStreak: 0, lastEmbedding: null };
}

/**
 * Classify a frame into observable signals with temporal persistence.
 * Derived states are OBSERVATIONS; the server decides consequences.
 */
export function classifyTemporal(
  st: TemporalState, analysis: FrameAnalysis,
  enrolled: Float32Array | null, samplesPerDecision = 3,
): {
  faceState: 'NO_FACE' | 'ONE_FACE' | 'MULTIPLE_FACES' | 'FACE_TOO_SMALL' | 'LOW_CONFIDENCE';
  identityState: 'UNKNOWN' | 'MATCH' | 'MISMATCH_STREAK' | 'RECHECK';
} {
  let faceState: TemporalState2 = 'ONE_FACE';
  if (!analysis.engineReady || analysis.error) faceState = 'LOW_CONFIDENCE';
  else if (analysis.faceCount === 0) faceState = 'NO_FACE';
  else if (analysis.faceCount > 1) faceState = 'MULTIPLE_FACES';
  else if (analysis.primaryEmbedding === null) faceState = 'FACE_TOO_SMALL';
  type TemporalState2 = 'NO_FACE' | 'ONE_FACE' | 'MULTIPLE_FACES' | 'FACE_TOO_SMALL' | 'LOW_CONFIDENCE';

  // Update streaks with hysteresis (decisions emerge from consecutive samples)
  if (faceState === 'NO_FACE') st.missingFrames++; else st.missingFrames = 0;
  if (faceState === 'MULTIPLE_FACES') st.multiFaceFrames++; else st.multiFaceFrames = 0;

  let identityState: 'UNKNOWN' | 'MATCH' | 'MISMATCH_STREAK' | 'RECHECK' = 'UNKNOWN';
  if (analysis.primaryEmbedding && enrolled) {
    const sim = similarity(analysis.primaryEmbedding, enrolled);
    if (sim >= CV_THRESHOLDS.sfaceCosineMatch) {
      st.mismatchStreak = 0;
      identityState = 'MATCH';
      st.lastEmbedding = analysis.primaryEmbedding;
    } else {
      st.mismatchStreak++;
      identityState = st.mismatchStreak >= samplesPerDecision ? 'MISMATCH_STREAK' : 'RECHECK';
    }
  }
  return { faceState, identityState };
}
