/**
 * Enterprise Face Verification Module
 * 
 * Uses @mediapipe/tasks-vision FaceDetector for production-grade face detection
 * during proctored assessments. Falls back to face-api.js if MediaPipe
 * initialization fails.
 * 
 * Features:
 * - High-accuracy face detection via MediaPipe BlazeFace model
 * - Multi-face detection (flags if more than one person detected)
 * - Confidence scoring for identity verification
 * - Face descriptor storage for session continuity
 * - Graceful fallback to face-api.js
 */

import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import * as faceapi from 'face-api.js';

const FACE_API_MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
const STORAGE_KEY = 'face_descriptor';

export interface FaceVerificationState {
  modelsLoaded: boolean;
  modelsLoading: boolean;
  loadError: string | null;
  engine: 'mediapipe' | 'faceapi' | null;
}

export interface FaceDetectionResult {
  detected: boolean;
  descriptor: Float32Array | null;
  confidence: number;
  faceCount: number;
  multipleFaces: boolean;
}

let modelsLoaded = false;
let modelsLoading = false;
let loadError: string | null = null;
let loadPromise: Promise<boolean> | null = null;
let activeEngine: 'mediapipe' | 'faceapi' | null = null;

let mediapipeDetector: FaceDetector | null = null;
let faceApiReady = false;

/**
 * Initialize MediaPipe FaceDetector as primary engine.
 * Falls back to face-api.js if MediaPipe fails to load.
 */
export async function loadFaceModels(): Promise<boolean> {
  if (modelsLoaded) return true;
  if (loadPromise) return loadPromise;

  modelsLoading = true;
  loadPromise = (async () => {
    // Attempt 1: MediaPipe (preferred — faster, more accurate)
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      mediapipeDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
      });
      activeEngine = 'mediapipe';
      modelsLoaded = true;
      loadError = null;
      console.info('[FaceVerification] MediaPipe FaceDetector initialized successfully');
      return true;
    } catch (mediapipeErr) {
      console.warn('[FaceVerification] MediaPipe initialization failed, falling back to face-api.js:', mediapipeErr);
    }

    // Attempt 2: face-api.js fallback
    try {
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_API_MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL),
      ]);
      faceApiReady = true;
      activeEngine = 'faceapi';
      modelsLoaded = true;
      loadError = null;
      console.info('[FaceVerification] face-api.js models loaded as fallback');
      return true;
    } catch (faceApiErr) {
      const message = faceApiErr instanceof Error ? faceApiErr.message : 'Failed to load face detection models';
      loadError = message;
      console.error('[FaceVerification] All face detection engines failed:', loadError);
      return false;
    }
  })().finally(() => {
    modelsLoading = false;
  });

  return loadPromise;
}

export function getFaceVerificationState(): FaceVerificationState {
  return { modelsLoaded, modelsLoading, loadError, engine: activeEngine };
}

/**
 * Detect faces in the given video/canvas/image element.
 * Returns detection result with face count for multi-person flagging.
 */
export async function detectFace(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<FaceDetectionResult> {
  if (!modelsLoaded) {
    return { detected: false, descriptor: null, confidence: 0, faceCount: 0, multipleFaces: false };
  }

  // MediaPipe detection path
  if (activeEngine === 'mediapipe' && mediapipeDetector) {
    try {
      const detections = mediapipeDetector.detect(input);
      const faceCount = detections.detections.length;

      if (faceCount === 0) {
        return { detected: false, descriptor: null, confidence: 0, faceCount: 0, multipleFaces: false };
      }

      const bestDetection = detections.detections.reduce((best, d) =>
        (d.categories[0]?.score ?? 0) > (best.categories[0]?.score ?? 0) ? d : best
      );

      // MediaPipe doesn't provide face descriptors for matching,
      // so we generate a pseudo-descriptor from keypoints for session continuity
      const keypoints = bestDetection.keypoints || [];
      const descriptorArray = new Float32Array(128);
      for (let i = 0; i < Math.min(keypoints.length * 2, 128); i++) {
        const kp = keypoints[Math.floor(i / 2)];
        descriptorArray[i] = i % 2 === 0 ? (kp?.x ?? 0) : (kp?.y ?? 0);
      }

      return {
        detected: true,
        descriptor: descriptorArray,
        confidence: bestDetection.categories[0]?.score ?? 0,
        faceCount,
        multipleFaces: faceCount > 1,
      };
    } catch (err) {
      console.warn('[FaceVerification] MediaPipe detection error:', err);
      return { detected: false, descriptor: null, confidence: 0, faceCount: 0, multipleFaces: false };
    }
  }

  // face-api.js detection path (fallback)
  if (activeEngine === 'faceapi' && faceApiReady) {
    try {
      const allDetections = await faceapi
        .detectAllFaces(input)
        .withFaceLandmarks()
        .withFaceDescriptors();

      const faceCount = allDetections.length;

      if (faceCount === 0) {
        return { detected: false, descriptor: null, confidence: 0, faceCount: 0, multipleFaces: false };
      }

      // Use the highest-confidence detection
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

/**
 * Store a face descriptor in localStorage for session verification.
 */
export function storeFaceDescriptor(descriptor: Float32Array): void {
  try {
    const data = JSON.stringify(Array.from(descriptor));
    localStorage.setItem(STORAGE_KEY, data);
  } catch (err) {
    console.warn('[FaceVerification] Failed to store descriptor:', err);
  }
}

/**
 * Retrieve a previously stored face descriptor.
 */
export function getStoredFaceDescriptor(): Float32Array | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    const arr = JSON.parse(data) as number[];
    return new Float32Array(arr);
  } catch {
    return null;
  }
}

/**
 * Clear stored face descriptor (call on assessment completion or logout).
 */
export function clearStoredFaceDescriptor(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Compare two face descriptors using Euclidean distance.
 * For MediaPipe pseudo-descriptors, the threshold is more lenient.
 */
export function compareFaceDescriptors(
  descriptor1: Float32Array,
  descriptor2: Float32Array
): { match: boolean; distance: number } {
  // Compute Euclidean distance
  let sum = 0;
  const len = Math.min(descriptor1.length, descriptor2.length);
  for (let i = 0; i < len; i++) {
    const diff = descriptor1[i] - descriptor2[i];
    sum += diff * diff;
  }
  const distance = Math.sqrt(sum);

  // MediaPipe keypoint-based descriptors use a more lenient threshold
  const threshold = activeEngine === 'mediapipe' ? 0.8 : 0.6;

  return {
    match: distance < threshold,
    distance,
  };
}
