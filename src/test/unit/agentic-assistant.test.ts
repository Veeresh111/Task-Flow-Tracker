import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgenticAssistantEngine, UserLiveContext } from "@/lib/agentic-assistant";

describe("Agentic AI Assistant (Emo) with Live Database RAG", () => {
  const mockContext: UserLiveContext = {
    userId: "emp-999",
    name: "Alex Morgan",
    email: "alex@fwc.com",
    role: "employee",
    department: "Frontend Engineering",
    designation: "Senior Frontend Engineer",
    performanceScore: 88,
    daysInCompany: 120,
    teamLeadName: "Sarah Jenkins",
    payroll: {
      baseSalary: 75000,
      hra: 30000,
      allowances: 7500,
      deductions: 9000,
      netSalary: 103500,
      status: "Processed",
      paymentMethod: "Direct Bank Transfer (NEFT/RTGS)",
      nextPayDate: "Last Working Day of Month"
    },
    tasks: {
      total: 6,
      completed: 4,
      inProgress: 1,
      pending: 1,
      overdue: 0,
      completionRate: 67,
      upcoming: [
        { id: "t1", title: "Build Chatbot Agentic RAG", priority: "High", due_date: "2026-08-25", status: "In Progress" },
        { id: "t2", title: "Fix Telemetry Marks Engine", priority: "Medium", due_date: "2026-08-28", status: "Pending" }
      ]
    },
    workLogs: {
      totalHours: 145,
      isClockedIn: true,
      currentShiftStart: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      shiftHoursToday: 3.0,
      recentNotes: ["Completed authentication audit"]
    }
  };

  it("answers salary and payroll inquiries with authentic INR figures", async () => {
    const query = "What's my salary and payout status?";
    const response = await AgenticAssistantEngine.answerUserQuery(query, mockContext);

    expect(response).toContain("Alex Morgan");
    expect(response).toContain("1,03,500"); // Net take-home pay formatted in INR
    expect(response).toContain("75,000"); // Base salary
    expect(response).toContain("Direct Bank Transfer");
    expect(response).toContain("Processed");
  });

  it("answers sprint task inquiries with real active backlog items", async () => {
    const query = "What are my pending sprint tasks?";
    const response = await AgenticAssistantEngine.answerUserQuery(query, mockContext);

    expect(response).toContain("6 tasks");
    expect(response).toContain("67% completion rate");
    expect(response).toContain("Build Chatbot Agentic RAG");
    expect(response).toContain("Fix Telemetry Marks Engine");
  });

  it("explains performance marks and surveillance scoring breakdown", async () => {
    const query = "How is my performance score calculated?";
    const response = await AgenticAssistantEngine.answerUserQuery(query, mockContext);

    expect(response).toContain("88 / 100");
    expect(response).toContain("Task Execution (35%)");
    expect(response).toContain("Shift Attendance (25%)");
    expect(response).toContain("Task Velocity (20%)");
    expect(response).toContain("Active Focus (10%)");
  });

  it("answers shift attendance and clock status inquiries", async () => {
    const query = "What is my clock in status today?";
    const response = await AgenticAssistantEngine.answerUserQuery(query, mockContext);

    expect(response).toContain("Clocked In");
    expect(response).toContain("3 hrs");
    expect(response).toContain("145 hrs");
    expect(response).toContain("Sarah Jenkins");
  });

  it("identifies direct manager and organizational reporting line", async () => {
    const query = "Who is my manager?";
    const response = await AgenticAssistantEngine.answerUserQuery(query, mockContext);

    expect(response).toContain("Sarah Jenkins");
    expect(response).toContain("Frontend Engineering");
  });
});
