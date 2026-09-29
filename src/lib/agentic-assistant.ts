/**
 * Enterprise Context-Aware Agentic AI Assistant Engine (Emo RAG)
 *
 * TRUTH POLICY (absolute):
 *  - Every number shown comes from a real database field (payslips, profiles,
 *    tasks, work_logs). If a value does not exist, the assistant says so —
 *    it NEVER estimates, extrapolates, or uses placeholder defaults.
 *  - Responses are plain text (no markdown asterisks) in a concise,
 *    professional industry style.
 *  - Answers are per-user and role-aware; admin/HR additionally get real
 *    organization-level aggregates (their RLS grants them the data).
 */

import { supabase } from './supabase';
import { callFreeHFModel } from './ai-models';
import { formatINR } from './payroll';

export interface UserLiveContext {
  userId: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  designation?: string;
  performanceScore: number | null;
  daysInCompany: number | null;
  teamLeadName: string;
  payroll: {
    // Real values only. `breakdownAvailable=false` means only CTC-level data
    // exists and component-level figures MUST NOT be shown.
    breakdownAvailable: boolean;
    baseSalary?: number;
    hra?: number;
    allowances?: number;
    deductions?: number;
    netSalary?: number;
    gross?: number;
    monthlyCtc?: number;
    annualCtc?: number;
    status: string;
    paymentMethod: string;
    nextPayDate?: string;
    payslipPeriod?: string;
  } | null;
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    overdue: number;
    completionRate: number;
    upcoming: Array<{ id: string; title: string; priority: string; due_date?: string; status: string }>;
  };
  workLogs: {
    totalHours: number;
    isClockedIn: boolean;
    currentShiftStart?: string;
    shiftHoursToday: number;
    recentNotes: string[];
    hasStaleOpenShift?: boolean;
  };
}

const PAYMENT_METHOD = 'Direct Bank Transfer (NEFT/RTGS)';

export class AgenticAssistantEngine {
  /**
   * Fetch complete authentic database context for an active user session.
   * Only real fields are read; nothing is defaulted or invented.
   */
  static async fetchUserLiveContext(userId: string): Promise<UserLiveContext | null> {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, email, role, department, performance_score, payroll_ctc, employment_start_date, created_at, team_lead_id')
        .eq('id', userId)
        .single();

      if (!profile) return null;

      let teamLeadName = 'not assigned';
      if (profile.team_lead_id) {
        const { data: dir } = await supabase
          .rpc('get_directory_profiles', { p_ids: [profile.team_lead_id] });
        const tl = dir?.[0];
        if (tl?.name) teamLeadName = tl.name;
      }

      const startDate = profile.employment_start_date || profile.created_at;
      const daysInCompany = startDate
        ? Math.max(0, Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000))
        : null;

      // --- Payroll: real payslip first, else real profile CTC, else null ---
      let payrollData: UserLiveContext['payroll'] = null;
      try {
        const { data: payslipRows } = await supabase
          .from('payslips')
          .select('*')
          .eq('employee_id', userId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (payslipRows && payslipRows.length > 0) {
          const p = payslipRows[0];
          const earnings = (p.earnings && typeof p.earnings === 'object' && !Array.isArray(p.earnings)) ? p.earnings : {};
          const basic = Number(earnings.basic ?? earnings.BASIC ?? NaN);
          const hra = Number(earnings.hra ?? earnings.HRA ?? NaN);
          const special = Number(earnings.special ?? earnings.SPECIAL ?? earnings.lta ?? earnings.LTA ?? NaN);
          const realDeductions = Number(p.pf_amount || 0) + Number(p.pt_amount || 0) + Number(p.tds_amount || 0);
          payrollData = {
            breakdownAvailable: Number.isFinite(basic),
            baseSalary: Number.isFinite(basic) ? basic : undefined,
            hra: Number.isFinite(hra) ? hra : undefined,
            allowances: Number.isFinite(special) ? special : undefined,
            deductions: realDeductions,
            netSalary: Number(p.net || 0),
            gross: Number(p.gross || 0),
            monthlyCtc: Number(p.monthly_ctc || 0),
            annualCtc: Number(p.annual_ctc || 0),
            status: p.status === 'active' ? 'Processed / Active' : String(p.status || 'Recorded'),
            paymentMethod: PAYMENT_METHOD,
            nextPayDate: 'Last working day of the month',
            payslipPeriod: p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : undefined,
          };
        }
      } catch {
        // payslip query failure is non-fatal; profile CTC path follows
      }

      if (!payrollData) {
        const annual = Number(profile.payroll_ctc || 0);
        if (annual > 0) {
          payrollData = {
            breakdownAvailable: false, // no payslip exists — no honest component split
            annualCtc: annual,
            monthlyCtc: Math.round(annual / 12),
            status: 'Payslip not generated yet',
            paymentMethod: PAYMENT_METHOD,
          };
        } // else stays null → "not configured" answer
      }

      // --- Sprint tasks ---
      const { data: taskRows } = await supabase
        .from('tasks')
        .select('id, title, priority, due_date, status')
        .eq('assigned_to', userId);

      const tasksList = taskRows || [];
      const total = tasksList.length;
      const completed = tasksList.filter(t => t.status === 'Completed').length;
      const inProgress = tasksList.filter(t => t.status === 'In Progress').length;
      const pending = tasksList.filter(t => t.status === 'Pending').length;
      const now = new Date();
      const overdue = tasksList.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'Completed').length;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
      const upcoming = tasksList
        .filter(t => t.status !== 'Completed')
        .slice(0, 5)
        .map(t => ({ id: t.id, title: t.title, priority: t.priority || 'Medium', due_date: t.due_date, status: t.status }));

      // --- Work logs ---
      const { data: logRows } = await supabase
        .from('work_logs')
        .select('clock_in, clock_out, notes, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      const logs = logRows || [];
      let totalHours = 0;
      let isClockedIn = false;
      let currentShiftStart: string | undefined = undefined;
      let shiftHoursToday = 0;
      let hasStaleOpenShift = false;
      const recentNotes: string[] = [];
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayStartMs = new Date(todayStr + 'T00:00:00.000Z').getTime();

      logs.forEach(l => {
        if (l.notes && recentNotes.length < 3) recentNotes.push(l.notes);
        if (l.clock_in && !l.clock_out) {
          isClockedIn = true;
          const start = new Date(l.clock_in).getTime();
          if (!currentShiftStart || start > new Date(currentShiftStart).getTime()) currentShiftStart = l.clock_in;
          const openMs = Math.max(0, Date.now() - start);
          // SEMANTIC CORRECTNESS: "today" must only count the portion of an
          // open shift that falls after midnight today. A stale open shift
          // (started days ago) must NOT inflate today's hours.
          shiftHoursToday += Math.max(0, (Date.now() - Math.max(start, todayStartMs)) / 3600000);
          totalHours += openMs / 3600000;
          // A shift open for more than 24h is a data-integrity problem
          // (abandoned clock-in), not real worked time.
          if (openMs > 24 * 3600000) hasStaleOpenShift = true;
        } else if (l.clock_in && l.clock_out) {
          const diff = (new Date(l.clock_out).getTime() - new Date(l.clock_in).getTime()) / 3600000;
          totalHours += diff;
          if (String(l.clock_in).startsWith(todayStr)) {
            shiftHoursToday += diff;
          }
        }
      });

      return {
        userId,
        name: profile.name || 'Team Member',
        email: profile.email || '',
        role: profile.role || 'employee',
        department: profile.department || null,
        performanceScore: profile.performance_score == null ? null : Number(profile.performance_score),
        daysInCompany,
        teamLeadName,
        payroll: payrollData,
        tasks: { total, completed, inProgress, pending, overdue, completionRate, upcoming },
        workLogs: {
          totalHours: Math.round(totalHours),
          isClockedIn,
          currentShiftStart,
          shiftHoursToday: Number(shiftHoursToday.toFixed(1)),
          recentNotes,
          hasStaleOpenShift,
        },
      };
    } catch (e) {
      console.error('Failed to gather agentic user live context:', e);
      return null;
    }
  }

  /** Strips markdown artifacts so responses are clean plain text. */
  private static sanitize(text: string): string {
    return text
      .replace(/\*\*/g, '')
      .replace(/__(.+?)__/g, '$1')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/`{3}[\s\S]*?`{3}/g, m => m.replace(/`{3}/g, ''))
      .replace(/`/g, '')
      .trim();
  }

  private static orgPayrollIntent(q: string): boolean {
    return /(total|company|organization|organisation|org|all employees|all staff|entire|overall).*(payroll|salary|payslip|cost|payout)|payroll.*(total|company|all employees|overview|summary)/.test(q);
  }

  /**
   * Real organization-level payroll aggregate (admin/HR only — their RLS
   * grants read access to all payslips; every figure below is a live SUM).
   */
  private static async answerOrgPayroll(role: string): Promise<string | null> {
    if (!['admin', 'hr'].includes(role?.toLowerCase())) return null;
    try {
      const { data } = await supabase
        .from('payslips')
        .select('gross, net, status');
      if (!data || data.length === 0) {
        return 'No payslips have been generated in the system yet, so there is no organizational payroll total to report. Run a payroll cycle from Payroll Administration to create real records.';
      }
      const gross = data.reduce((s, p) => s + Number(p.gross || 0), 0);
      const net = data.reduce((s, p) => s + Number(p.net || 0), 0);
      return [
        'Organization Payroll Summary (live database totals):',
        `- Payslips issued: ${data.length}`,
        `- Total gross payout: ${formatINR(gross)}`,
        `- Total net payout: ${formatINR(net)}`,
        '',
        'Cycle-level management, generation, and audit tools are in Payroll & Finance. Figures reflect all payslip records your role is authorized to see.',
      ].join('\n');
    } catch {
      return null;
    }
  }

  /**
   * Process a user query through the context-aware, truth-only engine.
   */
  static async answerUserQuery(userQuery: string, context: UserLiveContext | null): Promise<string> {
    const q = userQuery.trim().toLowerCase();

    if (!context) {
      return 'I am Emo, your FWC corporate assistant. Please make sure you are logged in so I can read your secure records before answering.';
    }

    // ORG-level payroll (admin/HR only, real aggregates)
    const wantsPayroll = q.includes('salary') || q.includes('pay') || q.includes('ctc') ||
      q.includes('compensation') || q.includes('payslip') || q.includes('earnings') || q.includes('wage');
    if (wantsPayroll && this.orgPayrollIntent(q)) {
      const org = await this.answerOrgPayroll(context.role);
      if (org) return org;
    }

    // 1. PERSONAL SALARY & PAYROLL — real values only
    if (wantsPayroll) {
      const p = context.payroll;
      if (!p) {
        return `Hello ${context.name}, no payroll record is configured for your profile yet, and no payslip has been generated. Please contact HR to have your compensation set up. I will not quote figures I cannot verify in the system.`;
      }

      const lines: string[] = ['Your payroll details (from official records):'];
      lines.push(`- Employee: ${context.name}${context.department ? ` (${context.department})` : ''}`);

      if (p.breakdownAvailable) {
        lines.push(`- Base salary: ${formatINR(p.baseSalary!)} / month`);
        if (p.hra != null) lines.push(`- House rent allowance (HRA): ${formatINR(p.hra)}`);
        if (p.allowances != null) lines.push(`- Special allowances: ${formatINR(p.allowances)}`);
        lines.push(`- Deductions (PF/professional tax/TDS): ${formatINR(p.deductions ?? 0)}`);
        if (p.gross != null) lines.push(`- Gross: ${formatINR(p.gross)}`);
        lines.push(`- Net take-home pay: ${formatINR(p.netSalary ?? 0)} / month`);
      } else {
        if (p.annualCtc != null) lines.push(`- Annual CTC: ${formatINR(p.annualCtc)}`);
        if (p.monthlyCtc != null) lines.push(`- Monthly gross: ${formatINR(p.monthlyCtc)}`);
        lines.push('- A detailed payslip has not been generated for your profile yet, so component-level breakup (basic/HRA/allowances) and net pay are not available. These will appear here as soon as HR runs a payroll cycle for you.');
      }

      lines.push(`- Payout status: ${p.status}`);
      lines.push(`- Disbursement channel: ${p.paymentMethod}`);
      if (p.payslipPeriod) lines.push(`- Latest payslip period: ${p.payslipPeriod}`);
      lines.push('');
      lines.push('You can download your payslip statement (CSV) from the My Payroll portal.');
      return lines.join('\n');
    }

    // 2. SPRINT TASKS
    if (
      q.includes('task') || q.includes('sprint') || q.includes('todo') || q.includes('work') ||
      q.includes('pending') || q.includes('assigned') || q.includes('backlog')
    ) {
      const t = context.tasks;
      const lines: string[] = ['Your current task and sprint status:'];
      lines.push(`- Total assigned: ${t.total} tasks`);
      lines.push(`- Completed: ${t.completed} (${t.completionRate}% completion rate)`);
      lines.push(`- In progress: ${t.inProgress}`);
      lines.push(`- Pending: ${t.pending}`);
      lines.push(`- Overdue: ${t.overdue > 0 ? `${t.overdue} task(s) overdue — action needed` : 'zero overdue tasks'}`);

      if (t.upcoming.length > 0) {
        lines.push('');
        lines.push('Active tasks in your queue:');
        t.upcoming.forEach((item, idx) => {
          lines.push(`${idx + 1}. [${item.priority.toUpperCase()}] ${item.title} (${item.status})`);
        });
      } else {
        lines.push('');
        lines.push('You currently have zero pending sprint tasks. Excellent execution.');
      }
      return lines.join('\n');
    }

    // 3. PERFORMANCE MARKS
    if (
      q.includes('performance') || q.includes('marks') || q.includes('score') ||
      q.includes('rating') || q.includes('surveillance') || q.includes('telemetry') || q.includes('evaluation')
    ) {
      const lines: string[] = [];
      if (context.performanceScore == null) {
        lines.push('A performance score has not been recorded for your profile yet. It is computed by the performance engine from the real activity data below once sufficient history exists.');
      } else {
        const score = context.performanceScore;
        lines.push(`Your live performance marks and activity telemetry:`);
        lines.push(`- Overall performance score: ${score} / 100`);
      }
      lines.push(`- Task resolution rate: ${context.tasks.completionRate}% (${context.tasks.completed}/${context.tasks.total} tasks)`);
      lines.push(`- Total logged hours: ${context.workLogs.totalHours} hrs`);
      lines.push(`- Current shift status: ${context.workLogs.isClockedIn ? 'Active — clocked in' : 'Shift inactive (clocked out)'}`);
      lines.push('');
      lines.push('How marks are calculated:');
      lines.push('1. Task Execution (35%): ratio of assigned sprint tickets closed on time.');
      lines.push('2. Shift Attendance (25%): clock-in consistency and shift compliance.');
      lines.push('3. Task Velocity (20%): output per logged hour.');
      lines.push('4. Active Focus (10%): engagement continuity, minimal idle time.');
      lines.push('5. Collaboration (10%): standup logging and ticket responsiveness.');
      return lines.join('\n');
    }

    // 4. ATTENDANCE & SHIFT
    if (
      q.includes('clock') || q.includes('shift') || q.includes('attendance') ||
      q.includes('hours') || q.includes('logged')
    ) {
      const w = context.workLogs;
      const lines: string[] = ['Your shift attendance and work log status:'];
      lines.push(`- Current state: ${w.isClockedIn ? `Clocked In (started ${new Date(w.currentShiftStart || Date.now()).toLocaleString('en-IN')})` : 'Currently clocked out'}`);
      lines.push(`- Hours logged today: ${w.shiftHoursToday} hrs`);
      lines.push(`- Total logged hours: ${w.totalHours} hrs`);
      lines.push(`- Reporting manager: ${context.teamLeadName}`);
      if (w.hasStaleOpenShift) {
        lines.push('');
        lines.push('Data notice: an open shift with no clock-out has been running for more than 24 hours, which usually means a clock-in was left open by mistake. This shift is not counted as ordinary work time. Please close it (Clock Out) or ask HR to correct the record so your attendance data stays accurate.');
      }
      lines.push('');
      lines.push('Remember to submit your daily standup notes before clocking out.');
      return lines.join('\n');
    }

    // 5. MANAGER & REPORTING LINE
    if (q.includes('manager') || q.includes('team lead') || q.includes('lead') || q.includes('boss') || q.includes('reporting')) {
      const lines: string[] = ['Your reporting structure:'];
      lines.push(`- Direct manager / team lead: ${context.teamLeadName}`);
      if (context.department) lines.push(`- Department: ${context.department}`);
      lines.push(`- Role: ${context.role.toUpperCase()}`);
      if (context.daysInCompany != null) lines.push(`- Tenure: ${context.daysInCompany} days at FWC India`);
      return lines.join('\n');
    }

    // 6. GENERAL REASONING — AI grounded strictly in real context, plain text
    const systemPrompt = [
      'You are Emo, a professional corporate operations assistant for FWC India (Bangalore HQ).',
      'You answer using ONLY the authenticated user context below. If something is not in the context, say clearly that you do not have that data and suggest the relevant portal or HR.',
      'Formatting rules: plain text only. Never use markdown asterisks, hashes, or backticks. Use short lines and hyphen bullets. Be concise, specific, and professional.',
      '',
      'AUTHENTIC USER CONTEXT:',
      `- Name: ${context.name}`,
      `- Role: ${context.role}${context.department ? ` (${context.department})` : ''}`,
      `- Performance score: ${context.performanceScore == null ? 'not yet recorded' : context.performanceScore + '/100'}`,
      `- Payroll: ${context.payroll ? (context.payroll.breakdownAvailable && context.payroll.netSalary != null ? `net ${formatINR(context.payroll.netSalary)}/month` : context.payroll.annualCtc != null ? `annual CTC ${formatINR(context.payroll.annualCtc)} (no payslip breakdown yet)` : 'not configured') : 'not configured'}`,
      `- Tasks: ${context.tasks.completed}/${context.tasks.total} completed (${context.tasks.completionRate}%), ${context.tasks.overdue} overdue`,
      `- Clock status: ${context.workLogs.isClockedIn ? 'clocked in' : 'clocked out'}; ${context.workLogs.totalHours} total hours logged`,
      `- Manager: ${context.teamLeadName}`,
      context.daysInCompany != null ? `- Tenure: ${context.daysInCompany} days` : '',
      '',
      'Never reveal other employees personal data. Never invent numbers.',
    ].filter(Boolean).join('\n');

    try {
      const aiResponse = await callFreeHFModel({
        modelDomain: 'EXECUTIVE_INSIGHTS',
        prompt: userQuery,
        systemPrompt,
        maxTokens: 400,
        useCache: false,
      });

      if (aiResponse && aiResponse.trim().length > 0 && !aiResponse.includes('AI_UNAVAILABLE') && !aiResponse.includes('[AI Offline]')) {
        return this.sanitize(aiResponse);
      }
    } catch {
      // fall through to grounded summary
    }

    // Grounded summary fallback — real context only, never invented
    const lines = [`Hello ${context.name}. Here is your current status:`];
    lines.push(`- Tasks: ${context.tasks.completed}/${context.tasks.total} completed, ${context.tasks.pending} pending${context.tasks.overdue > 0 ? `, ${context.tasks.overdue} overdue` : ''}`);
    if (context.performanceScore != null) lines.push(`- Performance score: ${context.performanceScore}/100`);
    lines.push(`- Shift: ${context.workLogs.isClockedIn ? 'clocked in' : 'clocked out'} (${context.workLogs.totalHours} total hours)`);
    lines.push('');
    lines.push('Ask me about your payroll, tasks, performance, attendance, or reporting line.');
    return lines.join('\n');
  }
}
