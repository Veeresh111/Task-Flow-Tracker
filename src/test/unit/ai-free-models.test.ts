import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getHuggingFaceToken,
  setHuggingFaceToken,
  clearHuggingFaceToken,
  HF_FREE_MODELS,
  callFreeHFModel,
  AI_UNAVAILABLE_MARKER,
  DEFAULT_FREE_HF_TOKEN
} from "@/lib/ai-models";

describe("Hugging Face Free AI Models & Token Manager", () => {
  beforeEach(() => {
    clearHuggingFaceToken();
    vi.restoreAllMocks();
  });

  it("resolves default free token when no custom token is configured", () => {
    const token = getHuggingFaceToken();
    expect(token).toBe(DEFAULT_FREE_HF_TOKEN);
  });

  it("persists and retrieves custom Hugging Face token in localStorage", () => {
    const testCustomToken = "hf_CustomUserTokenForHackathon123456";
    const saved = setHuggingFaceToken(testCustomToken);
    expect(saved).toBe(true);

    const token = getHuggingFaceToken();
    expect(token).toBe(testCustomToken);

    clearHuggingFaceToken();
    expect(getHuggingFaceToken()).toBe(DEFAULT_FREE_HF_TOKEN);
  });

  it("rejects invalid tokens not starting with hf_", () => {
    const saved = setHuggingFaceToken("invalid_token_format");
    expect(saved).toBe(false);
    expect(getHuggingFaceToken()).toBe(DEFAULT_FREE_HF_TOKEN);
  });

  it("configures 100% free models for specialized feature domains", () => {
    expect(HF_FREE_MODELS.ATS_RESUME_PARSER.id).toBe("Qwen/Qwen2.5-72B-Instruct");
    expect(HF_FREE_MODELS.EMPLOYEE_TELEMETRY.id).toBe("meta-llama/Llama-3.2-3B-Instruct");
    expect(HF_FREE_MODELS.PROCTORING_VISION_OBJECTS.id).toBe("facebook/detr-resnet-50");
    expect(HF_FREE_MODELS.PROCTORING_VISION_FACES.id).toBe("rizvandwiki/face-detection");
    expect(HF_FREE_MODELS.SENTIMENT_ANALYZER.id).toBe("distilbert/distilbert-base-uncased-finetuned-sst-2-english");
    expect(HF_FREE_MODELS.INTERVIEW_GENERATOR.id).toBe("mistralai/Mistral-7B-Instruct-v0.3");
  });

  it("returns explicit AI-offline marker (never fabricated content) when network is down", async () => {
    // Force network fetch to fail
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network offline")));

    const result = await callFreeHFModel({
      modelDomain: "EMPLOYEE_TELEMETRY",
      prompt: "stand-up notes review: worked on backend services",
      useCache: false
    });

    // TRUTH POLICY: the offline path must NOT invent analyses, scores, or
    // verdicts. It returns an explicit AI-unavailable notice.
    expect(result).toBeDefined();
    expect(result).toContain("AI Offline");
    expect(result.toLowerCase()).not.toContain("deliverables");
  });

  it("offline JSON fallback is the AI_UNAVAILABLE marker — parse fails into honest error path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Cloud timeout")));

    const result = await callFreeHFModel({
      modelDomain: "ATS_RESUME_PARSER",
      prompt: "Analyze candidate resume against ATS criteria",
      responseFormat: { type: "json_object" },
      useCache: false
    });

    // TRUTH POLICY: no fabricated { score, recommendation } objects. The
    // marker is intentionally non-JSON so callers' JSON.parse throws and
    // their catch path surfaces an honest "AI unavailable" failure.
    expect(result).toBe(AI_UNAVAILABLE_MARKER);
    expect(() => JSON.parse(result)).toThrow();
    expect(result).not.toContain("score");
  });
});
