import * as faceapi from 'face-api.js';

const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
const STORAGE_KEY = 'face_descriptor';

export interface FaceVerificationState {
  modelsLoaded: boolean;
  modelsLoading: boolean;
  loadError: string | null;
}

export interface FaceDetectionResult {
  detected: boolean;
  descriptor: Float32Array | null;
  confidence: number;
}

let modelsLoaded = false;
let modelsLoading = false;
let loadError: string | null = null;
let loadPromise: Promise<boolean> | null = null;

export async function loadFaceModels(): Promise<boolean> {
  if (modelsLoaded) return true;
  if (loadPromise) return loadPromise;

  modelsLoading = true;
  loadPromise = (async () => {
    try {
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      modelsLoaded = true;
      loadError = null;
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load face detection models';
      loadError = message;
      console.warn('[FaceVerification] Model load failed:', loadError);
      return false;
    } finally {
      modelsLoading = false;
    }
  })();
  return loadPromise;
}

export function getFaceVerificationState(): FaceVerificationState {
  return { modelsLoaded, modelsLoading, loadError };
}

export async function detectFace(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<FaceDetectionResult> {
  if (!modelsLoaded) {
    return { detected: false, descriptor: null, confidence: 0 };
  }

  try {
    const result = await faceapi
      .detectSingleFace(input)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!result) {
      return { detected: false, descriptor: null, confidence: 0 };
    }

    return {
      detected: true,
      descriptor: result.descriptor,
      confidence: result.detection.score,
    };
  } catch (err) {
    console.warn('[FaceVerification] Detection error:', err);
    return { detected: false, descriptor: null, confidence: 0 };
  }
}

export function storeFaceDescriptor(descriptor: Float32Array): void {
  try {
    const data = JSON.stringify(Array.from(descriptor));
    localStorage.setItem(STORAGE_KEY, data);
  } catch (err) {
    console.warn('[FaceVerification] Failed to store descriptor:', err);
  }
}

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

export function clearStoredFaceDescriptor(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function compareFaceDescriptors(
  descriptor1: Float32Array,
  descriptor2: Float32Array
): { match: boolean; distance: number } {
  const distance = faceapi.euclideanDistance(descriptor1, descriptor2);
  return {
    match: distance < 0.6,
    distance,
  };
}
