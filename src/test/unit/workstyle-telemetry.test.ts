import { describe, it, expect } from "vitest";
import { TelemetryEngine } from "@/lib/telemetry";

describe("Employee Work Style & Telemetry Engine", () => {
  it("computes accurate task velocity and completion rate from authentic DB records", () => {
    const userId = "emp-101";
    const now = Date.now();

    const mockTasks = [
      { id: "1", assigned_to: userId, status: "Completed" },
      { id: "2", assigned_to: userId, status: "Completed" },
      { id: "3", assigned_to: userId, status: "Completed" },
      { id: "4", assigned_to: userId, status: "Completed" },
      { id: "5", assigned_to: userId, status: "In Progress" },
    ];

    const mockLogs = [
      {
        user_id: userId,
        clock_in: new Date(now - 10 * 3600 * 1000).toISOString(),
        clock_out: new Date(now - 2 * 3600 * 1000).toISOString() // 8 hours
      }
    ];

    const metrics = TelemetryEngine.computeEmployeeMetrics(userId, mockTasks, mockLogs);

    expect(metrics.totalTasks).toBe(5);
    expect(metrics.completedTasks).toBe(4);
    expect(metrics.completionRate).toBe(80);
    expect(metrics.totalClockedHours).toBe(8);
    // 4 tasks / 8 hours = 0.5 tasks/hr
    expect(metrics.taskVelocity).toBe(0.5);
    expect(metrics.performanceScore).toBeGreaterThanOrEqual(3.5);
    expect(metrics.workStyleArchetype).toBe("Velocity Sprinter");
  });

  it("detects heavy overtime and assigns Burnout Risk archetype", () => {
    const userId = "emp-202";
    const now = Date.now();

    const mockTasks = [
      { id: "1", assigned_to: userId, status: "In Progress" },
      { id: "2", assigned_to: userId, status: "In Progress" },
      { id: "3", assigned_to: userId, status: "In Progress" },
      { id: "4", assigned_to: userId, status: "Pending" },
      { id: "5", assigned_to: userId, status: "Pending" },
      { id: "6", assigned_to: userId, status: "Pending" },
    ];

    // Simulate 200 logged hours
    const mockLogs = [
      {
        user_id: userId,
        clock_in: new Date(now - 200 * 3600 * 1000).toISOString(),
        clock_out: new Date(now).toISOString()
      }
    ];

    const metrics = TelemetryEngine.computeEmployeeMetrics(userId, mockTasks, mockLogs);

    expect(metrics.totalClockedHours).toBe(200);
    expect(metrics.burnoutRiskIndex).toBeGreaterThanOrEqual(70);
    expect(metrics.workStyleArchetype).toBe("Burnout Risk / Overloaded");
    expect(metrics.riskFactors).toContain("High Overtime / Burnout Hazard");
  });

  it("polishes daily standup notes and identifies blockers", async () => {
    const rawNotes = "Finished PR 45 for auth service. Fixing unit tests now. Stuck on rate limit issue in proxy.";
    const result = await TelemetryEngine.polishStandupNotes(rawNotes);

    expect(result.polishedText).toBeDefined();
    expect(result.polishedText.length).toBeGreaterThan(20);
    expect(result.sentiment).toBe("STRESS_INDICATOR");
  });
});
