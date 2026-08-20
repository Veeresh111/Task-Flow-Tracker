/**
 * Enterprise Continuous 24/7 Employee Activity Telemetry & Fair Performance Marks Engine
 * 
 * Non-intrusively tracks employee engagement indicators during active work shifts,
 * calculates a transparent, multi-factor performance score (0-100 marks), and persists
 * updates to `profiles.performance_score` and `work_logs`.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { SlidingWindowAggregator } from "@/lib/dsa/SlidingWindow";

interface ActivityTelemetryOptions {
  userId: string | null;
  activeLogId: string | null;
  isClockedIn: boolean;
}

export function useActivityMonitoring({ userId, activeLogId, isClockedIn }: ActivityTelemetryOptions) {
  const [performanceScore, setPerformanceScore] = useState<number>(85);
  const [focusRatio, setFocusRatio] = useState<number>(100);
  const [interactionDensity, setInteractionDensity] = useState<number>(75);

  const aggregatorRef = useRef(new SlidingWindowAggregator(60));
  const activeSecondsRef = useRef(0);
  const totalSecondsRef = useRef(0);
  const keypressCountRef = useRef(0);
  const clickCountRef = useRef(0);

  const calculateScore = useCallback(async () => {
    if (!userId || !isClockedIn) return;

    totalSecondsRef.current += 10;
    const focusRatioPercent = totalSecondsRef.current > 0
      ? Math.min(100, Math.round((activeSecondsRef.current / totalSecondsRef.current) * 100))
      : 100;
    setFocusRatio(focusRatioPercent);

    // Calculate interaction density score from recent activity window
    const recentEvents = aggregatorRef.current.getEventCount();
    const densityScore = Math.min(100, Math.round((recentEvents / 20) * 100));
    setInteractionDensity(densityScore);

    // 1. Task Execution Score (Max 35 Marks)
    let taskMarks = 28;
    try {
      const { data: userTasks } = await supabase
        .from("tasks")
        .select("status, due_date")
        .eq("assigned_to", userId);

      const tasks = userTasks || [];
      if (tasks.length > 0) {
        const completed = tasks.filter(t => t.status === "Completed").length;
        const completionRate = completed / tasks.length;
        const now = new Date();
        const overdueCount = tasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== "Completed").length;
        
        taskMarks = Math.round(completionRate * 35) - (overdueCount * 3);
        taskMarks = Math.max(10, Math.min(35, taskMarks));
      }
    } catch {
      taskMarks = 28;
    }

    // 2. Shift Attendance & Consistency Score (Max 25 Marks)
    const shiftMarks = 23; // Baseline active shift attendance mark

    // 3. Output Velocity Score (Max 20 Marks)
    const velocityMarks = Math.min(20, Math.round((densityScore / 100) * 20));

    // 4. Focus Ratio Score (Max 10 Marks)
    const focusMarks = Math.round((focusRatioPercent / 100) * 10);

    // 5. Interaction Score (Max 10 Marks)
    const interactionMarks = Math.round((densityScore / 100) * 10);

    const totalMarks = taskMarks + shiftMarks + velocityMarks + focusMarks + interactionMarks;
    const boundedScore = Math.max(50, Math.min(100, totalMarks));
    setPerformanceScore(boundedScore);

    // Persist real performance score to user profile in Supabase
    try {
      await supabase
        .from("profiles")
        .update({ performance_score: boundedScore })
        .eq("id", userId);
    } catch (e) {
      // Ignore background sync errors
    }

    // Sync score into active work log notes/metadata if log ID exists
    if (activeLogId) {
      try {
        await supabase
          .from("work_logs")
          .update({
            notes: `AI TELEMETRY | Marks: ${boundedScore}/100 (Tasks: ${taskMarks}/35, Attendance: ${shiftMarks}/25, Velocity: ${velocityMarks}/20, Focus: ${focusMarks}/10, Active: ${interactionMarks}/10)`,
          })
          .eq("id", activeLogId);
      } catch (e) {
        // Ignore background sync errors
      }
    }
  }, [userId, activeLogId, isClockedIn]);

  useEffect(() => {
    if (!isClockedIn || !userId) return;

    const handleUserActivity = () => {
      activeSecondsRef.current += 1;
      aggregatorRef.current.addSample(1);
    };

    const handleKeyDown = () => {
      keypressCountRef.current += 1;
      handleUserActivity();
    };

    const handleClick = () => {
      clickCountRef.current += 1;
      handleUserActivity();
    };

    const handleMouseMove = () => {
      handleUserActivity();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("click", handleClick);
    window.addEventListener("mousemove", handleMouseMove);

    // Run scoring calculation every 15 seconds
    const interval = window.setInterval(() => {
      calculateScore();
    }, 15000);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("mousemove", handleMouseMove);
      window.clearInterval(interval);
    };
  }, [isClockedIn, userId, calculateScore]);

  return {
    performanceScore,
    focusRatio,
    interactionDensity,
  };
}
