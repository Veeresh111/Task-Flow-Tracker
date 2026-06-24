import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { image } = await req.json();
    if (!image) {
      return new Response(JSON.stringify({ error: "Missing image data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const HF_TOKEN = Deno.env.get("HF_TOKEN");
    if (!HF_TOKEN) {
      return new Response(
        JSON.stringify({ error: "HF_TOKEN not configured", ai_disabled: true }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const base64Data = image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    let detectedObjects: string[] = [];
    try {
      const objRes = await fetch(
        "https://api-inference.huggingface.co/models/facebook/detr-resnet-50",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ inputs: image, parameters: { threshold: 0.6 } })
        }
      );
      if (objRes.ok) {
        const objData = await objRes.json();
        if (Array.isArray(objData)) {
          const CHEATING_LABELS = ["cell phone", "laptop", "book", "remote", "tv", "monitor", "keyboard", "mouse"];
          detectedObjects = objData
            .filter((item: any) => {
              const label = (item.label || "").toLowerCase();
              return CHEATING_LABELS.some(cl => label.includes(cl));
            })
            .map((item: any) => item.label);
        }
      }
    } catch (objErr) {
      console.error("Object detection error:", objErr);
    }

    let faceCount = 0;
    let faceCentered = true;
    try {
      const faceRes = await fetch(
        "https://api-inference.huggingface.co/models/rizvandwiki/face-detection",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ inputs: image })
        }
      );
      if (faceRes.ok) {
        const faceData = await faceRes.json();
        if (Array.isArray(faceData)) {
          faceCount = faceData.length;
          if (faceCount > 0) {
            const primaryFace = faceData[0];
            const box = primaryFace.box || primaryFace;
            const xmin = box.xmin ?? 0;
            const ymin = box.ymin ?? 0;
            const xmax = box.xmax ?? 0;
            const ymax = box.ymax ?? 0;

            const faceCenterX = (xmin + xmax) / 2;
            const faceCenterY = (ymin + ymax) / 2;
            const imageCenterX = 160;
            const imageCenterY = 120;

            const offsetX = Math.abs(faceCenterX - imageCenterX) / imageCenterX;
            const offsetY = Math.abs(faceCenterY - imageCenterY) / imageCenterY;

            const faceWidth = xmax - xmin;
            const faceHeight = ymax - ymin;
            const aspectRatio = faceWidth > 0 ? faceHeight / faceWidth : 1;

            faceCentered = offsetX < 0.45 && offsetY < 0.45;
            const faceTurnedAway = aspectRatio > 2.0 || aspectRatio < 0.4;

            if (!faceCentered || faceTurnedAway) {
              faceCount = faceTurnedAway ? -2 : -1;
            }
          }
        }
      }
    } catch (faceErr) {
      console.error("Face detection error:", faceErr);
    }

    const hasPhone = detectedObjects.some(o => o.toLowerCase().includes("cell phone") || o.toLowerCase().includes("phone"));
    const hasBook = detectedObjects.some(o => o.toLowerCase().includes("book"));
    const hasScreen = detectedObjects.some(o => o.toLowerCase().includes("laptop") || o.toLowerCase().includes("monitor") || o.toLowerCase().includes("tv"));
    const multipleFaces = faceCount > 1;
    const noFace = faceCount === 0;
    const faceNotCentered = faceCount === -1;
    const faceTurnedAway = faceCount === -2;

    const suspicious = hasPhone || hasBook || (hasScreen && faceCount > 1) || multipleFaces || noFace || faceNotCentered || faceTurnedAway;

    return new Response(JSON.stringify({
      faceCount: faceCount < 0 ? 1 : faceCount,
      objects: [...new Set(detectedObjects)],
      suspicious,
      alerts: [
        ...(noFace ? ["No face detected in frame — candidate may be looking away or covered"] : []),
        ...(faceNotCentered ? ["Face not centered — candidate may be disengaged or looking away from screen"] : []),
        ...(faceTurnedAway ? ["Face turned away — candidate may be looking off-screen or reading notes"] : []),
        ...(hasPhone ? ["Cell phone detected in frame"] : []),
        ...(hasBook ? ["Book or notes detected in frame"] : []),
        ...(multipleFaces ? [`Multiple faces detected (${faceCount} people in frame)`] : [])
      ]
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, ai_disabled: true }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
