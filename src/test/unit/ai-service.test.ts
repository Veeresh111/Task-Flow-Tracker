import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { supabase } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockAiResponse = (content: string, status = 200) => {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    json: async () =>
      status >= 200 && status < 300
        ? { content }
        : { error: { message: content } },
  });
};

describe("AI Service (callCorporateAI)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: "test-token" } },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls ai-proxy edge function with prompt", async () => {
    mockAiResponse("Hello from AI");

    const { callCorporateAI } = await import("@/lib/ai");
    const promise = callCorporateAI({ prompt: "Say hello" });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain("/functions/v1/ai-proxy");

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.prompt).toBe("Say hello");

    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders.Authorization).toBe("Bearer test-token");

    expect(result).toBe("Hello from AI");
  });

  it("includes system instruction when provided", async () => {
    mockAiResponse("JSON result");

    const { callCorporateAI } = await import("@/lib/ai");
    const promise = callCorporateAI({
      prompt: "Analyze this",
      systemInstruction: "You are an ATS analyzer. Output JSON.",
      response_format: { type: "json_object" },
    });

    await vi.runAllTimersAsync();
    await promise;

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.systemInstruction).toBe("You are an ATS analyzer. Output JSON.");
    expect(callBody.response_format).toEqual({ type: "json_object" });
  });

  it("retries on 429/503 errors", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "429 Too Many Requests" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "503 Service Unavailable" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: "Success after retries" }),
      });

    const { callCorporateAI } = await import("@/lib/ai");
    const promise = callCorporateAI({ prompt: "Retry test" });

    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(8000);
    await vi.advanceTimersByTimeAsync(12000);

    const result = await promise;
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toBe("Success after retries");
  });

  it("throws after exhausting retries", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "429 Rate limited" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "429 Rate limited" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "429 Rate limited" } }),
      });

    const { callCorporateAI } = await import("@/lib/ai");
    const promise = callCorporateAI({ prompt: "Should fail" });
    promise.catch(() => {}); // suppress unhandled rejection

    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(8000);
    await vi.advanceTimersByTimeAsync(12000);

    await expect(promise).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws immediately on non-retryable errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: "400 Bad Request" } }),
    });

    const { callCorporateAI } = await import("@/lib/ai");
    const promise = callCorporateAI({ prompt: "Bad request" });

    await expect(promise).rejects.toThrow("400 Bad Request");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("propagates fetch network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const { callCorporateAI } = await import("@/lib/ai");
    const promise = callCorporateAI({ prompt: "Network test" });

    await expect(promise).rejects.toThrow("Network failure");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
