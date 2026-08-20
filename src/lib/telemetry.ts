/**
 * Enterprise Employee Work Style & Efficiency Telemetry Engine
 * 
 * Computes authentic productivity metrics, work style archetypes,
 * burnout risk indices, and standup sentiment analysis using free AI models.
 */

import { SlidingWindowAggregator } from './dsa/SlidingWindow';
import { callFreeHFModel } from './ai-models';

export interface EmployeeTelemetryMetrics {
  userId: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  completionRate: number; // 0 - 100%
  totalClockedHours: number;
  taskVelocity: number; // tasks completed per hour
  focusRatio: number; // 0 - 1.0 (active productive focus)
  burnoutRiskIndex: number; // 0 - 100%
  performanceScore: number; // 1.0 - 5.0
  workStyleArchetype: WorkStyleArchetype;
  positiveAttributes: string[];
  riskFactors: string[];
}

export type WorkStyleArchetype = 
  | 'Deep Focus Architect'
  | 'Velocity Sprinter'
  | 'Steady Execution Specialist'
  | 'Collaborative Accelerator'
  | 'Burnout Risk / Overloaded'
  | 'Ramp-up / Needs Engagement';

export interface StandupPolishResult {
  polishedText: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'STRESS_INDICATOR';
  sentimentScore: number;
  deliverables: string[];
  blockers: string[];
}

export class TelemetryEngine {
  /**
   * Compute comprehensive work style & productivity metrics from database entities.
   */
  static computeEmployeeMetrics(
    userId: string,
    tasks: any[] = [],
    workLogs: any[] = [],
    profileCreatedAt?: string
  ): EmployeeTelemetryMetrics {
    const userTasks = tasks.filter(t => t.assigned_to === userId || t.user_id === userId);
    const userLogs = workLogs.filter(l => l.user_id === userId);

    const totalTasks = userTasks.length;
    const completedTasks = userTasks.filter(t => t.status === 'Completed').length;
    const inProgressTasks = userTasks.filter(t => t.status === 'In Progress').length;
    const pendingTasks = userTasks.filter(t => t.status === 'Pending').length;

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Calculate total hours from work logs
    let totalHours = 0;
    const slidingHours = new SlidingWindowAggregator(30 * 24 * 3600); // 30 day window

    userLogs.forEach(log => {
      if (log.clock_in && log.clock_out) {
        const inTime = new Date(log.clock_in).getTime();
        const outTime = new Date(log.clock_out).getTime();
        if (outTime > inTime) {
          const durationHrs = (outTime - inTime) / 3600000;
          totalHours += durationHrs;
          slidingHours.addSample(durationHrs, outTime);
        }
      }
    });

    const roundedHours = Math.round(totalHours);
    const taskVelocity = totalHours > 0 ? Number((completedTasks / totalHours).toFixed(2)) : 0;

    // Focus Ratio (active time / expected shift time)
    const expectedHours = Math.max(8, userLogs.length * 8);
    const focusRatio = expectedHours > 0 ? Math.min(1.0, Number((totalHours / expectedHours).toFixed(2))) : 0.85;

    // Compute Burnout Risk Index (0 - 100)
    let burnoutScore = 15; // baseline low risk
    if (totalHours > 180) burnoutScore += 35; // heavy overtime (>180 hrs)
    if (inProgressTasks > completedTasks && inProgressTasks >= 3) burnoutScore += 25; // task overload
    if (pendingTasks > 5) burnoutScore += 15; // accumulating backlog
    if (completionRate < 50 && totalTasks > 3) burnoutScore += 15; // delivery frustration
    const burnoutRiskIndex = Math.min(100, Math.max(0, burnoutScore));

    // Performance Score (1.0 to 5.0)
    let rawScore = 3.0;
    if (totalTasks > 0 && totalHours > 0) {
      rawScore = (completionRate / 100) * 2.5 + Math.min(taskVelocity, 0.5) * 3.0 + focusRatio * 1.0;
    } else if (totalTasks > 0 && totalHours === 0) {
      rawScore = 2.0;
    }
    const performanceScore = Number(Math.max(1.0, Math.min(5.0, rawScore)).toFixed(1));

    // Determine Work Style Archetype
    let archetype: WorkStyleArchetype = 'Steady Execution Specialist';
    if (burnoutRiskIndex >= 70) {
      archetype = 'Burnout Risk / Overloaded';
    } else if (taskVelocity >= 0.4 && completionRate >= 75) {
      archetype = 'Velocity Sprinter';
    } else if (totalHours > 120 && completionRate >= 80) {
      archetype = 'Deep Focus Architect';
    } else if (completedTasks >= 8 && pendingTasks <= 2) {
      archetype = 'Collaborative Accelerator';
    } else if (totalTasks === 0 || totalHours < 20) {
      archetype = 'Ramp-up / Needs Engagement';
    }

    // Identify Positive Strengths & Risk Factors
    const positiveAttributes: string[] = [];
    const riskFactors: string[] = [];

    if (performanceScore >= 4.0) positiveAttributes.push("High-Cadence Corporate Performer");
    if (completionRate >= 80) positiveAttributes.push("High Task Resolution Rate (80%+)");
    if (taskVelocity >= 0.3) positiveAttributes.push("Rapid Execution Velocity");
    if (totalHours >= 140) positiveAttributes.push("High Engagement & Time Investment");
    if (pendingTasks === 0 && totalTasks > 0) positiveAttributes.push("Zero Pending Backlog / Reliable");
    if (focusRatio >= 0.85) positiveAttributes.push("Deep Focus & Minimal Context Loss");

    if (burnoutRiskIndex >= 65) riskFactors.push("High Overtime / Burnout Hazard");
    if (completionRate < 50 && totalTasks > 4) riskFactors.push("Low Resolution Rate (<50%)");
    if (pendingTasks > completedTasks) riskFactors.push("Backlog Accumulation Risk");
    if (totalHours < 30 && totalTasks > 5) riskFactors.push("Low Logged Time / Under-utilized");

    return {
      userId,
      totalTasks,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      completionRate,
      totalClockedHours: roundedHours,
      taskVelocity,
      focusRatio,
      burnoutRiskIndex,
      performanceScore,
      workStyleArchetype: archetype,
      positiveAttributes,
      riskFactors
    };
  }

  /**
   * Polish employee standup work notes and evaluate sentiment using free Hugging Face models.
   */
  static async polishStandupNotes(rawNotes: string): Promise<StandupPolishResult> {
    if (!rawNotes || !rawNotes.trim()) {
      return {
        polishedText: "No active deliverables logged for today's standup.",
        sentiment: 'NEUTRAL',
        sentimentScore: 0.5,
        deliverables: [],
        blockers: []
      };
    }

    try {
      const prompt = `Act as an Enterprise Agile Communications Assistant. Analyze and polish these rough employee daily work notes:
"${rawNotes}"

Format as clean, executive-level standup bullet points:
1. Completed Deliverables
2. Active Workstreams & In-Progress
3. Blockers & Dependencies

Return STRICTLY a JSON object matching shape:
{
  "polishedText": "...",
  "sentiment": "POSITIVE | NEUTRAL | STRESS_INDICATOR",
  "sentimentScore": 0.85,
  "deliverables": ["...", "..."],
  "blockers": ["..."]
}`;

      const aiResponse = await callFreeHFModel({
        modelDomain: 'EMPLOYEE_TELEMETRY',
        prompt,
        responseFormat: { type: 'json_object' }
      });

      const hasBlocker = rawNotes.toLowerCase().includes('stuck') || rawNotes.toLowerCase().includes('block') || rawNotes.toLowerCase().includes('fail') || rawNotes.toLowerCase().includes('issue');

      if (aiResponse) {
        const clean = aiResponse.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(clean);
        const sentiment = hasBlocker ? 'STRESS_INDICATOR' : (parsed.sentiment || 'POSITIVE');
        return {
          polishedText: parsed.polishedText || rawNotes,
          sentiment: sentiment,
          sentimentScore: parsed.sentimentScore || (hasBlocker ? 0.3 : 0.8),
          deliverables: Array.isArray(parsed.deliverables) ? parsed.deliverables : [],
          blockers: Array.isArray(parsed.blockers) ? parsed.blockers : (hasBlocker ? ["Impediment flagged"] : [])
        };
      }
    } catch (e) {
      console.warn("Standup polish cloud call failed, using deterministic format:", e);
    }

    // Deterministic fallback
    const lines = rawNotes.split('\n').filter(l => l.trim().length > 0);
    const hasBlocker = rawNotes.toLowerCase().includes('stuck') || rawNotes.toLowerCase().includes('block') || rawNotes.toLowerCase().includes('fail') || rawNotes.toLowerCase().includes('issue');

    return {
      polishedText: `• Daily Execution Deliverables: ${lines.slice(0, 2).join('; ') || 'Standard sprint backlog tasks.'}
• In-Progress Workstreams: Progressing on primary assigned sprint modules.
• Blockers & Risks: ${hasBlocker ? 'Active technical blocker flagged for team lead review.' : 'Zero active blockers identified.'}`,
      sentiment: hasBlocker ? 'STRESS_INDICATOR' : 'POSITIVE',
      sentimentScore: hasBlocker ? 0.3 : 0.8,
      deliverables: lines.slice(0, 3),
      blockers: hasBlocker ? ["Technical impediment logged"] : []
    };
  }
}
