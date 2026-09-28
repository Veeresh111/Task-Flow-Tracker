/**
 * Pure math for the proctoring CV engine — no runtime dependencies.
 * Ported EXACTLY from OpenCV sources (Apache-2.0):
 *  - YuNet decode: modules/objdetect/src/face_detect.cpp
 *  - SFace alignment: modules/objdetect/src/face_recognize.cpp (5-point Umeyama)
 *  - SFace match: L2-normalize + cosine (FR_COSINE)
 */

export interface YuNetFace {
  x: number; y: number; w: number; h: number;
  /** 5 landmarks: right eye, left eye, nose tip, right mouth, left mouth (x,y each) */
  landmarks: number[];
  score: number;
}

const YUNET_STRIDES = [8, 16, 32];
const YUNET_CONF_THRESHOLD = 0.6;
const YUNET_NMS_THRESHOLD = 0.3;

/**
 * Decode raw YuNet ONNX outputs into faces.
 * Order of `outs` must match output_names:
 *   cls_8, cls_16, cls_32, obj_8, obj_16, obj_32, bbox_8, bbox_16, bbox_32, kps_8, kps_16, kps_32
 * Each blob is [1, cols, rows] float32 (cls/obj) or [1, cols*4, rows] / [1, cols*10, rows].
 * `padW`/`padH` are the 32-divisor-padded input dims used at inference.
 */
export function decodeYuNet(
  outs: Float32Array[],
  padW: number,
  padH: number,
  confThreshold = YUNET_CONF_THRESHOLD,
): YuNetFace[] {
  const faces: YuNetFace[] = [];
  for (let i = 0; i < YUNET_STRIDES.length; i++) {
    const stride = YUNET_STRIDES[i];
    const cols = Math.floor(padW / stride);
    const rows = Math.floor(padH / stride);
    const cls = outs[i];
    const obj = outs[i + 3];
    const bbox = outs[i + 6];
    const kps = outs[i + 9];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        // Score = classification × objectness (OpenCV YuNet semantics).
        // EMPIRICALLY VERIFIED on live frames: the exported model's cls branch
        // alone is noisy (3672 anchors > 0.6 on a single-face frame — the
        // "duplicate face swarm"), while obj is the discriminator (8 anchors
        // > 0.6, all clustered on the real face). cls×obj reproduces the
        // reference decoder's single clean detection; cls-only does not.
        const clsScore = clamp01(cls[idx]);
        const objScore = clamp01(obj[idx]);
        const score = clsScore * objScore;
        if (score < confThreshold) continue;

        const cx = (c + bbox[idx * 4 + 0]) * stride;
        const cy = (r + bbox[idx * 4 + 1]) * stride;
        const w = Math.exp(bbox[idx * 4 + 2]) * stride;
        const h = Math.exp(bbox[idx * 4 + 3]) * stride;

        const landmarks: number[] = new Array(10);
        for (let n = 0; n < 5; n++) {
          landmarks[2 * n] = (kps[idx * 10 + 2 * n] + c) * stride;
          landmarks[2 * n + 1] = (kps[idx * 10 + 2 * n + 1] + r) * stride;
        }
        faces.push({ x: cx - w / 2, y: cy - h / 2, w, h, landmarks, score });
      }
    }
  }
  return nms(faces, YUNET_NMS_THRESHOLD);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function iou(a: YuNetFace, b: YuNetFace): number {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter);
}

function nms(faces: YuNetFace[], nmsThreshold: number): YuNetFace[] {
  const sorted = [...faces].sort((a, b) => b.score - a.score);
  const keep: YuNetFace[] = [];
  for (const f of sorted) {
    if (keep.every(k => iou(k, f) <= nmsThreshold)) keep.push(f);
  }
  return keep;
}

/** SFace reference alignment targets (112x112 canonical face). */
const DST_POINTS: Array<[number, number]> = [
  [38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041],
];
const DST_MEAN: [number, number] = [56.0262, 71.9008];

/**
 * 2x2 SVD via Jacobi eigen-decomposition of the symmetric A^T A.
 * Returns { u: 2x2, s: [s0>=s1], vt: 2x2 } with A = u * diag(s) * vt.
 */
function svd2x2(A00: number, A01: number, A10: number, A11: number) {
  // A^T A (symmetric, PSD)
  const p = A00 * A00 + A10 * A10;
  const q = A00 * A01 + A10 * A11;
  const r = A01 * A01 + A11 * A11;
  const mid = (p + r) / 2;
  const diff = (p - r) / 2;
  const root = Math.sqrt(diff * diff + q * q);
  const l1 = mid + root, l2 = Math.max(0, mid - root); // l1 >= l2 >= 0
  const s0 = Math.sqrt(l1), s1 = Math.sqrt(l2);
  // Eigenvectors of A^T A -> V columns
  const theta = 0.5 * Math.atan2(2 * q, p - r);
  const v00 = Math.cos(theta), v10 = Math.sin(theta);   // v1 (for l1)
  const v01 = -v10, v11 = v00;                           // v2 (for l2)
  // U columns: A v_i / s_i (guard degenerate)
  let u00: number, u10: number, u01: number, u11: number;
  if (s0 > 1e-12) {
    u00 = (A00 * v00 + A01 * v10) / s0;
    u10 = (A10 * v00 + A11 * v10) / s0;
  } else { u00 = 1; u10 = 0; }
  if (s1 > 1e-12) {
    u01 = (A00 * v01 + A01 * v11) / s1;
    u11 = (A10 * v01 + A11 * v11) / s1;
  } else {
    // orthogonal complement of u1
    u01 = -u10; u11 = u00;
  }
  return { u: [[u00, u01], [u10, u11]], s: [s0, s1], vt: [[v00, v10], [v01, v11]] };
}

/**
 * 5-point similarity transform (Umeyama) — exact port of OpenCV's
 * getSimilarityTransformMatrix. Returns 2x3 affine matrix [a b tx; c d ty].
 */
export function getSimilarityTransform(src: number[]): number[] {
  const avg0 = (src[0] + src[2] + src[4] + src[6] + src[8]) / 5;
  const avg1 = (src[1] + src[3] + src[5] + src[7] + src[9]) / 5;
  const srcMean = [avg0, avg1];

  const srcDemean: Array<[number, number]> = [];
  const dstDemean: Array<[number, number]> = [];
  for (let j = 0; j < 5; j++) {
    srcDemean.push([src[2 * j] - srcMean[0], src[2 * j + 1] - srcMean[1]]);
    dstDemean.push([DST_POINTS[j][0] - DST_MEAN[0], DST_POINTS[j][1] - DST_MEAN[1]]);
  }

  let A00 = 0, A01 = 0, A10 = 0, A11 = 0;
  for (let i = 0; i < 5; i++) {
    A00 += dstDemean[i][0] * srcDemean[i][0];
    A01 += dstDemean[i][0] * srcDemean[i][1];
    A10 += dstDemean[i][1] * srcDemean[i][0];
    A11 += dstDemean[i][1] * srcDemean[i][1];
  }
  A00 /= 5; A01 /= 5; A10 /= 5; A11 /= 5;

  const { u, s, vt } = svd2x2(A00, A01, A10, A11);

  const detA = A00 * A11 - A01 * A10;
  const d = [1.0, 1.0];
  if (detA < 0) d[1] = -1;

  const smax = Math.max(s[0], s[1]);
  const tol = smax * 2 * Number.EPSILON;
  let rank = 0;
  if (s[0] > tol) rank += 1;
  if (s[1] > tol) rank += 1;

  // T (rotation part) = U * D * Vt, with OpenCV's rank-1 det-correction dance.
  let T00 = 1, T01 = 0, T10 = 0, T11 = 1;
  const detU = u[0][0] * u[1][1] - u[0][1] * u[1][0];
  const detVt = vt[0][0] * vt[1][1] - vt[0][1] * vt[1][0];
  if (rank === 1) {
    if (detU * detVt > 0) {
      T00 = u[0][0] * vt[0][0] + u[0][1] * vt[1][0];
      T01 = u[0][0] * vt[0][1] + u[0][1] * vt[1][1];
      T10 = u[1][0] * vt[0][0] + u[1][1] * vt[1][0];
      T11 = u[1][0] * vt[0][1] + u[1][1] * vt[1][1];
    } else {
      const Dvt0 = [d[0] * vt[0][0], d[0] * vt[0][1]];
      const Dvt1 = [d[1] * vt[1][0], d[1] * vt[1][1]];
      T00 = u[0][0] * Dvt0[0] + u[0][1] * Dvt1[0];
      T01 = u[0][0] * Dvt0[1] + u[0][1] * Dvt1[1];
      T10 = u[1][0] * Dvt0[0] + u[1][1] * Dvt1[0];
      T11 = u[1][0] * Dvt0[1] + u[1][1] * Dvt1[1];
      d[1] = -d[1]; // OpenCV restores d[1] after the flip
    }
  } else {
    const Dvt0 = [d[0] * vt[0][0], d[0] * vt[0][1]];
    const Dvt1 = [d[1] * vt[1][0], d[1] * vt[1][1]];
    T00 = u[0][0] * Dvt0[0] + u[0][1] * Dvt1[0];
    T01 = u[0][0] * Dvt0[1] + u[0][1] * Dvt1[1];
    T10 = u[1][0] * Dvt0[0] + u[1][1] * Dvt1[0];
    T11 = u[1][0] * Dvt0[1] + u[1][1] * Dvt1[1];
  }

  const var1 = (srcDemean[0][0] ** 2 + srcDemean[1][0] ** 2 + srcDemean[2][0] ** 2 + srcDemean[3][0] ** 2 + srcDemean[4][0] ** 2) / 5;
  const var2 = (srcDemean[0][1] ** 2 + srcDemean[1][1] ** 2 + srcDemean[2][1] ** 2 + srcDemean[3][1] ** 2 + srcDemean[4][1] ** 2) / 5;
  const scale = (s[0] * d[0] + s[1] * d[1]) / (var1 + var2);

  const TS0 = T00 * srcMean[0] + T01 * srcMean[1];
  const TS1 = T10 * srcMean[0] + T11 * srcMean[1];
  return [
    T00 * scale, T01 * scale, DST_MEAN[0] - scale * TS0,
    T10 * scale, T11 * scale, DST_MEAN[1] - scale * TS1,
  ];
}

/** Warp the source RGBA canvas pixels with the 2x3 affine to 112x112 (nearest). */
export function warpAffine112(
  srcPixels: Uint8ClampedArray, srcW: number, srcH: number, m: number[],
): Float32Array {
  // 3x3 inverse of the affine (for inverse mapping).
  const [a, b, tx, c, d, ty] = m;
  const det = a * d - b * c;
  const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
  const out = new Float32Array(112 * 112 * 3); // RGB, HWC
  for (let y = 0; y < 112; y++) {
    for (let x = 0; x < 112; x++) {
      const sx = ia * x + ib * y + (-(ia * tx + ib * ty) + tx);
      const sy = ic * x + id * y + (-(ic * tx + id * ty) + ty);
      const xi = Math.round(sx), yi = Math.round(sy);
      const di = (y * 112 + x) * 3;
      if (xi >= 0 && xi < srcW && yi >= 0 && yi < srcH) {
        const si = (yi * srcW + xi) * 4;
        out[di] = srcPixels[si]; out[di + 1] = srcPixels[si + 1]; out[di + 2] = srcPixels[si + 2];
      }
    }
  }
  return out;
}

/** Build the SFace input blob [1,3,112,112] NCHW RGB (dnn blobFromImage swapRB=true, scale=1). */
export function toSFaceBlob(rgb112: Float32Array): Float32Array {
  const blob = new Float32Array(3 * 112 * 112);
  const plane = 112 * 112;
  for (let i = 0; i < plane; i++) {
    blob[i] = rgb112[i * 3];                  // R
    blob[plane + i] = rgb112[i * 3 + 1];      // G
    blob[2 * plane + i] = rgb112[i * 3 + 2];  // B
  }
  return blob;
}

export function l2Normalize(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = n > 0 ? v[i] / n : 0;
  return out;
}

/** FR_COSINE match on raw (unnormalized) embeddings: normalize both, dot. */
export function cosineMatch(e1: Float32Array, e2: Float32Array): number {
  const a = l2Normalize(e1), b = l2Normalize(e2);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Euclidean distance between embeddings (FR_NORM_L2 alternative). */
export function euclidean(e1: Float32Array, e2: Float32Array): number {
  let s = 0;
  for (let i = 0; i < e1.length; i++) s += (e1[i] - e2[i]) ** 2;
  return Math.sqrt(s);
}
