import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Camera, RefreshCw, CheckCircle2, AlertCircle, Upload, User, ScanFace } from "lucide-react";
import { loadFaceModels, detectFace, storeFaceDescriptor, getFaceVerificationState } from "@/hooks/useFaceVerification";

interface IdentityEnrollmentProps {
  candidateId: string;
  userId: string;
  onComplete?: () => void;
}

export default function IdentityEnrollment({ candidateId, userId, onComplete }: IdentityEnrollmentProps) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"select" | "capture" | "preview" | "complete">("select");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState<boolean | null>(null);
  const [faceModelsReady, setFaceModelsReady] = useState(false);
  const [faceConfidence, setFaceConfidence] = useState(0);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    (async () => {
      const state = getFaceVerificationState();
      if (state.modelsLoaded) {
        setFaceModelsReady(true);
        setIsInitializing(false);
        return;
      }
      if (state.modelsLoading || state.loadError) {
        setIsInitializing(false);
        return;
      }
      const loaded = await loadFaceModels();
      setFaceModelsReady(loaded);
      setIsInitializing(false);
    })();
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setFaceDetected(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
      setStep("capture");

      setTimeout(async () => {
        if (videoRef.current && faceModelsReady) {
          const result = await detectFace(videoRef.current);
          setFaceDetected(result.detected);
          setFaceConfidence(result.confidence);
        }
      }, 500);
    } catch {
      setError("Camera access denied. Please use photo upload instead.");
    }
  }, [faceModelsReady]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
  }, [stream]);

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    setCapturedImage(dataUrl);
    stopCamera();
    setStep("preview");

    if (faceModelsReady) {
      const img = new Image();
      img.onload = async () => {
        const result = await detectFace(img);
        if (result.detected && result.descriptor) {
          storeFaceDescriptor(result.descriptor);
          setFaceDetected(true);
          setFaceConfidence(result.confidence);
        } else {
          setFaceDetected(false);
          toast({
            title: "No Face Detected",
            description: "Please ensure your face is clearly visible in the photo.",
            variant: "destructive",
          });
        }
      };
      img.src = dataUrl;
    }
  }, [stopCamera, faceModelsReady, toast]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("File too large. Maximum 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setCapturedImage(dataUrl);
      setStep("preview");

      if (faceModelsReady) {
        const img = new Image();
        img.onload = async () => {
          const result = await detectFace(img);
          if (result.detected && result.descriptor) {
            storeFaceDescriptor(result.descriptor);
            setFaceDetected(true);
            setFaceConfidence(result.confidence);
          } else {
            setFaceDetected(false);
            toast({
              title: "No Face Detected",
              description: "Please upload a clear photo where your face is visible.",
              variant: "destructive",
            });
          }
        };
        img.src = dataUrl;
      }
    };
    reader.readAsDataURL(file);
  }, [faceModelsReady, toast]);

  const submitPhoto = async () => {
    if (!capturedImage) return;
    setIsLoading(true);
    setError(null);

    try {
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_url: capturedImage })
        .eq("id", userId);

      if (updateErr) throw updateErr;

      setStep("complete");
      toast({ title: "Identity Photo Saved", description: "Your photo has been enrolled successfully." });
      onComplete?.();
    } catch (err: any) {
      setError(err.message || "Failed to save photo");
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setCapturedImage(null);
    setError(null);
    setFaceDetected(null);
    setFaceConfidence(0);
    setStep("select");
    stopCamera();
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <User className="w-5 h-5 text-blue-600" /> Identity Enrollment
        </CardTitle>
        <CardDescription>Capture or upload a clear photo of yourself for identity verification.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "select" && (
          <div className="grid grid-cols-2 gap-4">
            <Button onClick={startCamera} variant="outline" className="h-24 flex flex-col gap-2 border-dashed">
              <Camera className="w-8 h-8 text-blue-600" />
              <span className="text-xs font-medium">Use Webcam</span>
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="h-24 flex flex-col gap-2 border-dashed">
              <Upload className="w-8 h-8 text-blue-600" />
              <span className="text-xs font-medium">Upload Photo</span>
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
          </div>
        )}

        {step === "capture" && (
          <div className="space-y-3">
            <div className="relative bg-black rounded-lg overflow-hidden">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-64 object-cover" />
              {faceDetected !== null && (
                <div className={`absolute bottom-2 left-2 px-2 py-1 rounded text-xs font-bold ${
                  faceDetected ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                }`}>
                  {faceDetected ? `Face Detected (${(faceConfidence * 100).toFixed(0)}%)` : 'No Face Detected'}
                </div>
              )}
              {faceDetected === null && isInitializing && (
                <div className="absolute bottom-2 left-2 px-2 py-1 rounded text-xs font-bold bg-yellow-500 text-white">
                  Initializing face detection...
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={capturePhoto} className="flex-1 bg-blue-600 text-white gap-2">
                <Camera className="w-4 h-4" /> Capture Photo
              </Button>
              <Button onClick={reset} variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" /> Cancel
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && capturedImage && (
          <div className="space-y-3">
            <div className="bg-slate-100 rounded-lg overflow-hidden flex justify-center">
              <img src={capturedImage} alt="Captured" className="max-h-64 object-contain" />
            </div>
            {faceDetected === true && (
              <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                <ScanFace className="w-4 h-4 shrink-0" />
                Face verified ({(faceConfidence * 100).toFixed(0)}% confidence)
              </div>
            )}
            {faceDetected === false && (
              <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                No face detected. Please retake with your face clearly visible.
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={submitPhoto} disabled={isLoading || faceDetected === false} className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2">
                {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirm & Save
              </Button>
              <Button onClick={reset} variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" /> Retake
              </Button>
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="text-center py-6 space-y-3">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <p className="font-medium text-green-800">Identity Photo Enrolled Successfully</p>
            <p className="text-sm text-slate-500">Your photo will be used for identity verification during assessments.</p>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
