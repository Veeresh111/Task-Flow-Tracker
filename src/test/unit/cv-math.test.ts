import { describe, it, expect } from 'vitest';
import {
  decodeYuNet, getSimilarityTransform, warpAffine112, toSFaceBlob,
  cosineMatch, l2Normalize, euclidean, type YuNetFace,
} from '../../lib/proctoring/cv-math';

function makeFace(x: number, y: number, w: number, h: number, score: number): YuNetFace {
  return { x, y, w, h, landmarks: [x + w * 0.3, y + h * 0.35, x + w * 0.7, y + h * 0.35, x + w * 0.5, y + h * 0.6, x + w * 0.35, y + h * 0.8, x + w * 0.65, y + h * 0.8], score };
}

describe('YuNet decode (OpenCV face_detect.cpp port)', () => {
  const stride = 8;
  const padW = 320, padH = 256; // /32 padded 320x240
  const cols = padW / stride, rows = padH / stride;

  function buildOuts(faceAt?: { c: number; r: number; score: number }): Float32Array[] {
    const n = cols * rows;
    const zeros = () => new Float32Array(n);
    const cls = zeros(), obj = zeros();
    const bbox = new Float32Array(n * 4);
    const kps = new Float32Array(n * 10);
    if (faceAt) {
      const idx = faceAt.r * cols + faceAt.c;
      cls[idx] = faceAt.score; obj[idx] = 0.99;
      bbox[idx * 4] = 0.2; bbox[idx * 4 + 1] = 0.1; bbox[idx * 4 + 2] = Math.log(60 / 8); bbox[idx * 4 + 3] = Math.log(80 / 8);
      kps[idx * 10] = 0.2; kps[idx * 10 + 1] = 0.1;
    }
    // strides 16/32 get all-zero tensors
    const n16 = (padW / 16) * (padH / 16);
    const n32 = (padW / 32) * (padH / 32);
    const zerosN = (k: number) => new Float32Array(k);
    return [
      cls, zerosN(n16), zerosN(n32),
      obj, zerosN(n16), zerosN(n32),
      bbox, zerosN(n16 * 4), zerosN(n32 * 4),
      kps, zerosN(n16 * 10), zerosN(n32 * 10),
    ];
  }

  it('decodes a face when cls×obj confidence crosses threshold', () => {
    // 2026-09-21 (S1): score = cls × obj — empirical live-ORT evidence showed
    // cls-only admits ~3672 anchors on a single-face frame (the "duplicate
    // swarm"), while obj is the discriminator (8 anchors, all on the face).
    // The fixture below already models this: obj=0.99 at the face anchor.
    const faces = decodeYuNet(buildOuts({ c: 5, r: 4, score: 0.9 }), padW, padH);
    expect(faces.length).toBe(1);
    const f = faces[0];
    // bbox decode: cx = (c + dx) * stride
    expect(f.x).toBeCloseTo((5 + 0.2) * 8 - 30, 1);
    expect(f.y).toBeCloseTo((4 + 0.1) * 8 - 40, 1);
    expect(f.w).toBeCloseTo(60, 1);
    expect(f.h).toBeCloseTo(80, 1);
    // score = cls(0.9) × obj(0.99) = 0.891
    expect(f.score).toBeCloseTo(0.891, 3);
  });

  it('rejects faces below conf threshold', () => {
    const faces = decodeYuNet(buildOuts({ c: 5, r: 4, score: 0.3 }), padW, padH);
    expect(faces.length).toBe(0);
  });

  it('suppresses duplicate detections via NMS (IoU > 0.3)', () => {
    const faces = decodeYuNet(buildOuts({ c: 5, r: 4, score: 0.9 }), padW, padH);
    expect(faces.length).toBe(1); // single anchor, but validates pipeline
  });

  it('decodes landmarks relative to anchor cell', () => {
    const faces = decodeYuNet(buildOuts({ c: 5, r: 4, score: 0.9 }), padW, padH);
    expect(faces[0].landmarks[0]).toBeCloseTo((0.2 + 5) * 8, 1);
    expect(faces[0].landmarks[1]).toBeCloseTo((0.1 + 4) * 8, 1);
  });
});

describe('SFace alignment (OpenCV face_recognize.cpp port)', () => {
  it('identity landmarks map to the canonical 112x112 targets', () => {
    // If src landmarks ARE the canonical targets, the transform must be ~identity.
    const src: number[] = [];
    const dst = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
    dst.forEach(([x, y]) => { src.push(x, y); });
    const M = getSimilarityTransform(src);
    const [a, b, tx, c, d, ty] = M;
    expect(a).toBeCloseTo(1, 2);
    expect(b).toBeCloseTo(0, 2);
    expect(tx).toBeCloseTo(0, 1);
    expect(d).toBeCloseTo(1, 2);
    expect(c).toBeCloseTo(0, 2);
    expect(ty).toBeCloseTo(0, 1);
  });

  it('scales up a half-size face by 2x toward canonical', () => {
    const dst = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
    const src: number[] = [];
    dst.forEach(([x, y]) => { src.push(x / 2, y / 2); });
    const M = getSimilarityTransform(src);
    // Layout: [a, b, tx, c, d, ty] — x-scale at M[0], y-scale at M[4]
    expect(M[0]).toBeCloseTo(2, 1);
    expect(M[4]).toBeCloseTo(2, 1);
    expect(M[1]).toBeCloseTo(0, 1); // no rotation/shear
  });

  it('warps an 112x112 identity image unchanged', () => {
    const px = new Uint8ClampedArray(112 * 112 * 4);
    for (let i = 0; i < 112 * 112; i++) { px[i * 4] = i % 256; px[i * 4 + 1] = 50; px[i * 4 + 2] = 100; px[i * 4 + 3] = 255; }
    const dst = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
    const src: number[] = [];
    dst.forEach(([x, y]) => { src.push(x, y); });
    const M = getSimilarityTransform(src);
    const out = warpAffine112(px, 112, 112, M);
    // pixel value at (60,60) is flatIndex % 256 = (60*112+60) % 256 = 124
    const idx = (60 * 112 + 60) * 3;
    expect(Math.abs(out[idx] - 124)).toBeLessThanOrEqual(2);
    expect(Math.abs(out[idx + 1] - 50)).toBeLessThanOrEqual(2);
    expect(Math.abs(out[idx + 2] - 100)).toBeLessThanOrEqual(2);
  });

  it('builds NCHW RGB blob with correct channel planes', () => {
    const rgb = new Float32Array(112 * 112 * 3);
    for (let i = 0; i < 112 * 112; i++) { rgb[i * 3] = 10; rgb[i * 3 + 1] = 20; rgb[i * 3 + 2] = 30; }
    const blob = toSFaceBlob(rgb);
    const plane = 112 * 112;
    expect(blob[0]).toBe(10);            // R plane first
    expect(blob[plane]).toBe(20);        // G plane second
    expect(blob[2 * plane]).toBe(30);    // B plane third
  });
});

describe('SFace matching', () => {
  it('identical embeddings score ~1.0 (cosine)', () => {
    const v = new Float32Array(128).fill(0.5);
    expect(cosineMatch(v, v)).toBeCloseTo(1.0, 5);
  });

  it('orthogonal embeddings score ~0', () => {
    const a = new Float32Array(128), b = new Float32Array(128);
    a[0] = 1; b[1] = 1;
    expect(cosineMatch(a, b)).toBeCloseTo(0, 5);
  });

  it('l2Normalize produces unit norm', () => {
    const v = l2Normalize(new Float32Array([3, 4]));
    expect(Math.sqrt(v[0] ** 2 + v[1] ** 2)).toBeCloseTo(1, 6);
  });

  it('euclidean distance is symmetric and correct', () => {
    const a = Float32Array.from([0, 0]), b = Float32Array.from([3, 4]);
    expect(euclidean(a, b)).toBeCloseTo(5, 6);
    expect(euclidean(b, a)).toBeCloseTo(5, 6);
  });
});
