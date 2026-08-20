import { describe, it, expect } from "vitest";
import { SlidingWindowAggregator } from "@/lib/dsa/SlidingWindow";

describe("Candidate Assessment Proctoring Telemetry", () => {
  it("deduplicates and rate-limits rapid vision violation events", () => {
    const violationWindow = new SlidingWindowAggregator(10); // 10 second window
    const now = Date.now();

    // Rapid frame detections of cell phone
    violationWindow.addSample(1, now);
    violationWindow.addSample(1, now + 1000);
    violationWindow.addSample(1, now + 2000);

    expect(violationWindow.getEventCount(now + 2000)).toBe(3);
    // Rate limit check
    expect(violationWindow.isRateLimitExceeded(2, now + 2000)).toBe(true);

    // After window expires (10s past last sample at now + 2000)
    expect(violationWindow.getEventCount(now + 15000)).toBe(0);
  });

  it("calculates proctored integrity score with penalty scaling", () => {
    const calculateIntegrity = (violationsCount: number) => {
      const penalty = violationsCount * 15;
      return Math.max(0, 100 - penalty);
    };

    expect(calculateIntegrity(0)).toBe(100);
    expect(calculateIntegrity(1)).toBe(85);
    expect(calculateIntegrity(3)).toBe(55);
    expect(calculateIntegrity(7)).toBe(0);
  });

  it("categorizes proctoring incidents accurately", () => {
    const mockViolations = [
      { type: "Cell phone detected in frame", timestamp: new Date().toISOString() },
      { type: "Multiple faces detected (2 people in frame)", timestamp: new Date().toISOString() },
      { type: "Audio spike / speech detected in exam room", timestamp: new Date().toISOString() }
    ];

    const categories = new Set<string>();
    mockViolations.forEach(v => {
      const t = v.type.toLowerCase();
      if (t.includes("phone") || t.includes("cell")) categories.add("Device Detected");
      if (t.includes("face") || t.includes("multiple")) categories.add("Multiple Faces / Absent");
      if (t.includes("audio") || t.includes("noise") || t.includes("speech")) categories.add("Audio Anomaly");
    });

    expect(categories.has("Device Detected")).toBe(true);
    expect(categories.has("Multiple Faces / Absent")).toBe(true);
    expect(categories.has("Audio Anomaly")).toBe(true);
  });
});
