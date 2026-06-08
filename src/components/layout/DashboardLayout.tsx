import { useState, useEffect, createContext, useContext } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { authService } from "@/lib/auth";
import { 
  Menu, X, LogOut, Home, Users, Briefcase, MessageSquare, 
  AlertCircle, CheckSquare, Clock, BarChart3, Bell, Settings, UserCircle, CheckCircle, Calendar, ClipboardList, Wallet, Sparkles, Timer, FileText, UserPlus, Loader2, Mail, Inbox, FileCheck
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

let globalProfile: any = null;
let globalClockedIn = false;
let globalLogId: string | null = null;
let globalWorkLoc: string | null = null;
let globalClockInTime: string | null = null; 
let globalBadges = { complaints: 0, approvals: 0, notifications: 0, tasks: 0 };

const LayoutContext = createContext(false);

const navItems: any = {
  admin: [
    { title: "Dashboard", href: "/admin", icon: Home },
    { title: "AI Insights", href: "/admin/ai-insights", icon: Sparkles },
    { title: "Time & Presence", href: "/admin/presence", icon: Clock },
    { title: "HR Directory", href: "/admin/directory", icon: Users },
    { title: "Employees", href: "/admin/employees", icon: Users },
    { title: "Team Leads", href: "/admin/team-leads", icon: UserCircle },
    { title: "Projects", href: "/admin/projects", icon: Briefcase },
    { title: "Approvals", href: "/admin/approvals", icon: CheckCircle, badgeKey: 'approvals' },
    { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    { title: "Payroll & Finance", href: "/admin/payroll", icon: Wallet }, 
    { title: "Office Chat", href: "/admin/chat", icon: MessageSquare },
    { title: "Complaints", href: "/admin/complaints", icon: AlertCircle, badgeKey: 'complaints' },
    { title: "Notifications", href: "/admin/notifications", icon: Bell, badgeKey: 'notifications' },
    { title: "Settings", href: "/admin/settings", icon: Settings },
  ],
  hr: [
    { title: "HR Dashboard", href: "/hr", icon: Home },
    { title: "AI Insights", href: "/hr/ai-insights", icon: Sparkles }, 
    { title: "AI ATS & Recruiting", href: "/hr/recruitment", icon: UserPlus },
    { title: "Application Hub", href: "/hr/applications", icon: Inbox }, 
    { title: "Onboarding Center", href: "/hr/onboarding", icon: FileCheck },
    { title: "Smart Inbox API", href: "/hr/smart-inbox", icon: Mail }, 
    { title: "HR Directory", href: "/hr/directory", icon: Users },
    { title: "Time & Presence", href: "/hr/presence", icon: Clock },
    { title: "Payroll Management", href: "/hr/payroll", icon: Wallet }, 
    { title: "HR Analytics", href: "/hr/analytics", icon: BarChart3 },
    { title: "Approvals", href: "/hr/approvals", icon: CheckCircle, badgeKey: 'approvals' },
    { title: "Office Chat", href: "/hr/chat", icon: MessageSquare }, 
    { title: "Ethics & Complaints", href: "/hr/complaints", icon: AlertCircle, badgeKey: 'complaints' },
    { title: "Settings", href: "/hr/settings", icon: Settings },
  ],
  team_lead: [
    { title: "Dashboard", href: "/team-lead", icon: Home },
    { title: "AI Insights", href: "/team-lead/ai-insights", icon: Sparkles },
    { title: "Work Logs", href: "/team-lead/worklogs", icon: ClipboardList },
    { title: "My Team", href: "/team-lead/team", icon: Users },
    { title: "Projects", href: "/team-lead/projects", icon: Briefcase },
    { title: "Tasks", href: "/team-lead/tasks", icon: CheckSquare, badgeKey: 'tasks' },
    { title: "Approvals", href: "/team-lead/approvals", icon: CheckCircle, badgeKey: 'approvals' },
    { title: "Leaves & HR", href: "/team-lead/leaves", icon: Calendar },
    { title: "Analytics", href: "/team-lead/analytics", icon: BarChart3 },
    { title: "My Payroll", href: "/team-lead/payroll", icon: Wallet }, 
    { title: "Office Chat", href: "/team-lead/chat", icon: MessageSquare },
    { title: "Complaints", href: "/team-lead/complaints", icon: AlertCircle, badgeKey: 'complaints' },
    { title: "Notifications", href: "/team-lead/notifications", icon: Bell, badgeKey: 'notifications' },
    { title: "Settings", href: "/team-lead/settings", icon: Settings },
  ],
  employee: [
    { title: "Dashboard", href: "/employee", icon: Home },
    { title: "AI Insights", href: "/employee/ai-insights", icon: Sparkles },
    { title: "Time & Presence", href: "/employee/presence", icon: Clock },
    { title: "Work Logs", href: "/employee/worklogs", icon: ClipboardList },
    { title: "Projects", href: "/employee/projects", icon: Briefcase },
    { title: "Tasks", href: "/employee/tasks", icon: CheckSquare, badgeKey: 'tasks' },
    { title: "Leaves & HR", href: "/employee/leaves", icon: Calendar },
    { title: "Analytics", href: "/employee/analytics", icon: BarChart3 },
    { title: "My Payroll", href: "/employee/payroll", icon: Wallet }, 
    { title: "Office Chat", href: "/employee/chat", icon: MessageSquare },
    { title: "Complaints", href: "/employee/complaints", icon: AlertCircle },
    { title: "Notifications", href: "/employee/notifications", icon: Bell, badgeKey: 'notifications' },
    { title: "Settings", href: "/employee/settings", icon: Settings },
  ],
  candidate: [
    { title: "Dashboard", href: "/candidate", icon: Home },
    { title: "Office Chat", href: "/candidate/chat", icon: MessageSquare }
  ]
};

function DashboardLayoutCore({ children, role }: { children: React.ReactNode; role?: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const [isClockedIn, setIsClockedIn] = useState(globalClockedIn);
  const [activeLogId, setActiveLogId] = useState(globalLogId);
  const [workLocation, setWorkLocation] = useState(globalWorkLoc); 
  const [userProfile, setUserProfile] = useState<any>(globalProfile);
  const [badges, setBadges] = useState(globalBadges);

  const [clockInTime, setClockInTime] = useState<string | null>(globalClockInTime);
  
  const [elapsedTimer, setElapsedTimer] = useState(() => {
    if (globalClockedIn && globalClockInTime) {
      const start = new Date(globalClockInTime).getTime();
      const now = new Date().getTime();
      const diffMs = now - start;
      if (diffMs > 43200000) return "00:00:00"; 
      const hrs = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return "00:00:00";
  });
  
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [dailyReportData, setDailyReportData] = useState<any>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const currentRole = userProfile?.role?.toLowerCase() || role || "employee";
  const items = navItems[currentRole] || navItems.employee;

  const getStoredTime = (userId: string, key: string) => {
    return localStorage.getItem(`last_viewed_${userId}_${key}`) || new Date(0).toISOString();
  };

  const setStoredTime = (userId: string, key: string) => {
    const now = new Date();
    now.setSeconds(now.getSeconds() + 1); 
    localStorage.setItem(`last_viewed_${userId}_${key}`, now.toISOString());
  };

  useEffect(() => {
    if (!userProfile?.id) return;
    let cleared = false;
    if (location.pathname.includes('/notifications')) { setStoredTime(userProfile.id, 'notifications'); globalBadges.notifications = 0; cleared = true; }
    if (location.pathname.includes('/approvals')) { setStoredTime(userProfile.id, 'approvals'); globalBadges.approvals = 0; cleared = true; }
    if (location.pathname.includes('/complaints')) { setStoredTime(userProfile.id, 'complaints'); globalBadges.complaints = 0; cleared = true; }
    if (location.pathname.includes('/tasks')) { setStoredTime(userProfile.id, 'tasks'); globalBadges.tasks = 0; cleared = true; }
    if (cleared) setBadges({ ...globalBadges });
  }, [location.pathname, userProfile?.id]);

  useEffect(() => {
    const initApp = async () => {
      if (globalProfile) {
        const dbRole = globalProfile.role?.toUpperCase() || '';
        if (dbRole === 'TEAM_LEAD' && !location.pathname.startsWith('/team-lead')) navigate('/team-lead');
        else if (dbRole === 'EMPLOYEE' && !location.pathname.startsWith('/employee')) navigate('/employee');
        else if (dbRole === 'ADMIN' && !location.pathname.startsWith('/admin')) navigate('/admin');
        else if (dbRole === 'HR' && !location.pathname.startsWith('/hr')) navigate('/hr');
        else if (dbRole === 'CANDIDATE' && !location.pathname.startsWith('/candidate')) navigate('/candidate');
        fetchBadgeCounts(globalProfile.role, globalProfile.id);
        return; 
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      const trueRole = user.user_metadata?.role || profile?.role || 'employee';

      if (!profile) {
         await supabase.from('profiles').upsert({
             id: user.id,
             email: user.email || `user-${user.id}@fwc.co.in`,
             name: user.user_metadata?.name || 'Employee',
             role: trueRole,
             department: user.user_metadata?.department || 'Unassigned'
         }, { onConflict: 'id', ignoreDuplicates: true });
      }
      
      if (profile?.role === 'ARCHIVED') {
        handleLogout();
        toast({ title: "Account Disabled", description: "Your access has been revoked.", variant: "destructive" });
        return; 
      }

      if (profile) {
        profile.role = trueRole; 
        globalProfile = profile;
        setUserProfile(profile); 
        
        const dbRole = trueRole.toUpperCase();
        if (dbRole === 'TEAM_LEAD' && !location.pathname.startsWith('/team-lead')) navigate('/team-lead');
        else if (dbRole === 'EMPLOYEE' && !location.pathname.startsWith('/employee')) navigate('/employee');
        else if (dbRole === 'ADMIN' && !location.pathname.startsWith('/admin')) navigate('/admin');
        else if (dbRole === 'HR' && !location.pathname.startsWith('/hr')) navigate('/hr');
        else if (dbRole === 'CANDIDATE' && !location.pathname.startsWith('/candidate')) navigate('/candidate');
      }
      
      const { data: activeLog } = await supabase.from('work_logs').select('id, work_location, clock_in, created_at').eq('user_id', user.id).eq('status', 'Active').maybeSingle();
      
      if (activeLog) { 
        globalClockedIn = true;
        globalLogId = activeLog.id;
        globalWorkLoc = activeLog.work_location || 'WFO';
        globalClockInTime = activeLog.clock_in || activeLog.created_at;

        setIsClockedIn(true); 
        setActiveLogId(activeLog.id); 
        setWorkLocation(activeLog.work_location || 'WFO');
        setClockInTime(activeLog.clock_in || activeLog.created_at);
      } else {
        globalClockedIn = false;
        globalLogId = null;
        globalWorkLoc = null;
        globalClockInTime = null;

        setIsClockedIn(false);
        setActiveLogId(null);
        setWorkLocation(null);
        setClockInTime(null);
      }

      fetchBadgeCounts(trueRole, user.id);
    };

    initApp();

    const channel = supabase.channel('global-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, () => fetchBadgeCounts(currentRole, userProfile?.id))
      .on('postgres_changes', { event: '*', table: 'tasks' }, () => fetchBadgeCounts(currentRole, userProfile?.id))
      .on('postgres_changes', { event: '*', table: 'leaves' }, () => fetchBadgeCounts(currentRole, userProfile?.id))
      .on('postgres_changes', { event: '*', table: 'notifications' }, () => fetchBadgeCounts(currentRole, userProfile?.id))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentRole, location.pathname]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isClockedIn && clockInTime) {
      interval = setInterval(() => {
        const start = new Date(clockInTime).getTime();
        const now = new Date().getTime(); 
        const diffMs = now - start;

        const hrs = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diffMs % (1000 * 60)) / 1000);

        setElapsedTimer(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
      }, 1000);
    } else {
      setElapsedTimer("00:00:00");
    }
    return () => clearInterval(interval);
  }, [isClockedIn, clockInTime]);

  const toggleClock = async (selectedLocation?: string) => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Authentication failed. Please refresh your browser.");

      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email || `user-${user.id}@fwc.co.in`,
        name: user.user_metadata?.name || userProfile?.name || 'Employee',
        role: user.user_metadata?.role || userProfile?.role || 'employee',
        department: user.user_metadata?.department || userProfile?.department || 'Unassigned'
      }, { onConflict: 'id', ignoreDuplicates: true }).then(({error}) => {
         if(error && error.code !== '23505') console.warn("Profile heal warning:", error);
      });
      
      const realNowIso = new Date().toISOString();

      if (!isClockedIn) {
        const { data: existingLog, error: logError } = await supabase.from('work_logs').select('id, clock_in').eq('user_id', user.id).eq('status', 'Active').maybeSingle();
        if (logError) throw new Error("Failed to verify existing shift in database.");

        if (existingLog) {
           globalClockedIn = true;
           globalLogId = existingLog.id;
           globalClockInTime = existingLog.clock_in || realNowIso;
           setIsClockedIn(true);
           setActiveLogId(existingLog.id);
           setClockInTime(existingLog.clock_in || realNowIso);
           return toast({ title: "Already Clocked In", description: "Resuming existing active shift." });
        }

        const { data, error: insertError } = await supabase.from('work_logs').insert([{ user_id: user.id, status: 'Active', clock_in: realNowIso, work_location: selectedLocation || 'WFO' }]).select().maybeSingle();
        
        if (insertError) {
          const { data: recLog } = await supabase.from('work_logs').select('id, clock_in').eq('user_id', user.id).eq('status', 'Active').maybeSingle();
          if (recLog) {
            globalClockedIn = true;
            globalLogId = recLog.id;
            globalClockInTime = recLog.clock_in || realNowIso;
            setIsClockedIn(true);
            setActiveLogId(recLog.id);
            setClockInTime(recLog.clock_in || realNowIso);
            return toast({ title: "Clocked In", description: `Shift synchronized.` });
          }
          throw new Error(insertError.message || "Database rejected the shift log.");
        }

        if (data) {
          globalClockedIn = true;
          globalLogId = data.id;
          globalWorkLoc = selectedLocation || 'WFO';
          globalClockInTime = realNowIso;
          setActiveLogId(data.id);
          setWorkLocation(selectedLocation || 'WFO');
          setClockInTime(realNowIso);
          setIsClockedIn(true);
          toast({ title: "Clocked In", description: `Shift started. Working from ${selectedLocation === 'WFO' ? 'Office' : 'Home'}.` });
        }
      } else {
        if (activeLogId && clockInTime) {
          const outTimeMs = new Date().getTime();
          const startMs = new Date(clockInTime).getTime();
          const hoursWorked = (outTimeMs - startMs) / (1000 * 60 * 60);

          const { error: updateError } = await supabase.from('work_logs').update({ clock_out: new Date(outTimeMs).toISOString(), status: 'Completed' }).eq('id', activeLogId);
          if (updateError) throw new Error("Failed to clock out. Database error.");
          
          const empName = userProfile?.name || "Employee";
          generateEndOfDayReport(hoursWorked, activeLogId, empName);
        }
        resetClockState();
      }
    } catch (error: any) {
      console.error("Clock Execution Error:", error);
      toast({ title: "Action Failed", description: error.message || "An unexpected error occurred. Please try again.", variant: "destructive" });
    }
  };

  const generateEndOfDayReport = async (hours: number, logId: string, empName: string) => {
    setGeneratingReport(true);
    setShowDailyReport(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const realToday = new Date();
      realToday.setHours(0,0,0,0);
      
      const { data: tasks } = await supabase.from('tasks').select('title').eq('assigned_to', user?.id).eq('status', 'Completed').gte('updated_at', realToday.toISOString());
      const taskCount = tasks?.length || 0;
      const taskList = tasks?.map(t => t.title).join(", ") || "Standard operational and structural duties";

      const prompt = `Act as an elite FWC India HR Evaluation Engine. Employee: ${empName}. Hours Worked: ${hours.toFixed(2)}. Tasks Done: ${taskCount} (${taskList}). Write a 3-sentence performance review. Assign a "Competence Score" out of 100. CRITICAL INSTRUCTION: If Hours Worked is greater than 11.5 hours, you MUST severely penalize the Competence Score (drop it below 40) for 'suspicious time-theft' or 'extremely poor time management', and explicitly scold them for it in the review. No markdown.`;

      const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || "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";

      const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "Qwen/Qwen3-32B:groq",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || "Failed to route segment packet.");
      }

      let aiResponse = data.choices[0].message.content || "";

      aiResponse = aiResponse
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .replace(/<think>[\s\S Mont]*/gi, "")
        .replace(/<thinking>[\s\S]*/gi, "")
        .replace(/<\/think>/gi, "")
        .replace(/<\/thinking>/gi, "")
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .replace(/`/g, "")
        .replace(/^#+\s+/gm, "")
        .trim();

      setDailyReportData({ hours: hours.toFixed(2), tasks: taskCount, report: aiResponse });
      await supabase.from('work_logs').update({ notes: `SYSTEM AI REPORT: ${aiResponse}` }).eq('id', logId);
    } catch (error) {
      setDailyReportData({ hours: hours.toFixed(2), tasks: 0, report: "Shift recorded. AI evaluation engine offline." });
    }
    setGeneratingReport(false);
  };

  const fetchBadgeCounts = async (userRole: string, userId?: string) => {
    if (!userId && globalProfile?.id) userId = globalProfile.id;
    if (!userId) return;

    const timeNotif = getStoredTime(userId, 'notifications');
    const timeApp = getStoredTime(userId, 'approvals');
    const timeComp = getStoredTime(userId, 'complaints');
    const timeTasks = getStoredTime(userId, 'tasks');

    let bNotif = 0, bApp = 0, bComp = 0, bTasks = 0;

    const { count: cNotif } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).gt('created_at', timeNotif);
    bNotif = cNotif || 0;

    const { count: cTasks } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('assigned_to', userId).gt('created_at', timeTasks);
    bTasks = cTasks || 0;

    if (userRole.toUpperCase() === 'ADMIN' || userRole.toUpperCase() === 'HR') {
      const { count: cComp } = await supabase.from('complaints').select('*', { count: 'exact', head: true }).in('target_role', ['ADMIN', 'ESCALATED', 'HR']).gt('created_at', timeComp);
      bComp = cComp || 0;
      const { count: cLeaves } = await supabase.from('leaves').select('*', { count: 'exact', head: true }).eq('status', 'Pending').gt('created_at', timeApp);
      bApp = cLeaves || 0;
    }
    
    if (userRole.toUpperCase() === 'TL' || userRole.toUpperCase() === 'TEAM_LEAD') {
      const { data: tlProfile } = await supabase.from('profiles').select('department').eq('id', userId).single();
      const { data: directReports } = await supabase.from('profiles').select('id').eq('team_lead_id', userId);
      const { data: deptEmployees } = await supabase.from('profiles').select('id').eq('department', tlProfile?.department || '').ilike('role', '%employee%');

      const combinedIds = new Set([...(directReports?.map(r => r.id) || []), ...(deptEmployees?.map(r => r.id) || [])]);
      combinedIds.delete(userId);
      const teamIds = Array.from(combinedIds);

      if (teamIds.length > 0) {
        const { count: cLeaves } = await supabase.from('leaves').select('*', { count: 'exact', head: true }).eq('status', 'Pending').in('user_id', teamIds).gt('created_at', timeApp);
        bApp = cLeaves || 0;
        const { count: cTeamComp } = await supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('target_role', 'TEAM_LEAD').in('user_id', teamIds).gt('created_at', timeComp);
        bComp = cTeamComp || 0;
      }
    }

    if (window.location.pathname.includes('/notifications')) { bNotif = 0; setStoredTime(userId, 'notifications'); }
    if (window.location.pathname.includes('/approvals')) { bApp = 0; setStoredTime(userId, 'approvals'); }
    if (window.location.pathname.includes('/complaints')) { bComp = 0; setStoredTime(userId, 'complaints'); }
    if (window.location.pathname.includes('/tasks')) { bTasks = 0; setStoredTime(userId, 'tasks'); }

    const newBadges = { complaints: bComp, approvals: bApp, notifications: bNotif, tasks: bTasks };
    globalBadges = newBadges;
    setBadges(newBadges);
  };

  const handleLogout = async () => {
    resetClockState();
    globalProfile = null; 
    globalBadges = { complaints: 0, approvals: 0, notifications: 0, tasks: 0 };
    await authService.signOut();
    navigate("/login");
  };

  const resetClockState = () => {
    globalClockedIn = false;
    globalLogId = null;
    globalWorkLoc = null;
    globalClockInTime = null;
    setIsClockedIn(false);
    setActiveLogId(null);
    setWorkLocation(null);
    setClockInTime(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />}
      
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0f172a] border-r border-slate-800 transform transition-transform md:translate-x-0 flex flex-col shadow-xl ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 bg-[#020817]">
          <span className="text-xl font-bold text-white tracking-wider">WorkFlow</span>
          <button className="md:hidden text-slate-300" onClick={() => setSidebarOpen(false)}><X className="w-5 h-5" /></button>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5 custom-scrollbar">
          {items.map((item: any) => {
            const Icon = item.icon;
            const isBaseRoute = item.href === "/admin" || item.href === "/team-lead" || item.href === "/employee" || item.href === "/hr" || item.href === "/candidate";
            const isActive = isBaseRoute ? location.pathname === item.href : location.pathname === item.href || location.pathname.startsWith(item.href + "/");
            
            const isCurrentBadgePath = item.badgeKey && location.pathname.includes(item.badgeKey);
            const badgeCount = isCurrentBadgePath ? 0 : (item.badgeKey ? badges[item.badgeKey as keyof typeof badges] : 0);

            return (
              <Link key={item.href} to={item.href} className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
                <div className="flex items-center gap-3">{Icon && <Icon className={`w-5 h-5 ${isActive ? "text-white" : "text-slate-500"}`} />} {item.title}</div>
                {badgeCount > 0 && <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-md border border-red-500 animate-pulse">{badgeCount}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-[#020817]">
          <Button variant="ghost" className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-950/30 transition-colors" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-3" /> Sign Out
          </Button>
        </div>
      </aside>

      <main className="flex-1 md:pl-64 flex flex-col min-h-screen relative">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-8 sticky top-0 z-30 shadow-sm">
          <div className="flex items-center">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden mr-4 text-gray-500 hover:text-gray-900"><Menu className="w-6 h-6" /></button>
            <h2 className="text-lg font-semibold text-gray-800 hidden md:block">Welcome back, {userProfile?.name || 'User'}</h2>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 font-medium hidden sm:block">{userProfile?.role?.replace('_', ' ').toUpperCase() || 'HR'}</span>
            
            {/* Candidates are walled off from clocking operations */}
            {currentRole !== 'candidate' && (
              !isClockedIn ? (
                <div className="flex items-center gap-2">
                  <Button onClick={() => toggleClock('WFO')} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-5 shadow-sm font-bold transition-all">🏢 WFO</Button>
                  <Button onClick={() => toggleClock('WFH')} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-5 shadow-sm font-bold transition-all">🏠 WFH</Button>
                </div>
              ) : (
                <Button onClick={() => toggleClock()} variant="destructive" className="rounded-full px-6 font-bold shadow-sm transition-all flex items-center gap-2 group">
                  <Timer className="w-4 h-4 animate-pulse group-hover:hidden" /> <Clock className="w-4 h-4 hidden group-hover:block" /> 
                  <span className="w-16 text-center tracking-widest">{elapsedTimer}</span>
                  <span className="border-l border-red-400 pl-2">Clock Out</span>
                </Button>
              )
            )}
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6 lg:p-8 bg-slate-50/50">{children}</div>
      </main>

      {showDailyReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-lg shadow-2xl border-none overflow-hidden bg-white">
            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-6 text-white flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-black flex items-center gap-2"><Sparkles className="w-6 h-6"/> Daily Performance Report</h2>
                <p className="text-indigo-100 text-sm mt-1">Shift concluded. Synchronized with FWC database.</p>
              </div>
            </div>
            <CardContent className="p-8">
              {generatingReport ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-4"><Loader2 className="w-12 h-12 animate-spin text-indigo-600" /><p className="text-slate-500 font-medium animate-pulse">AI evaluating today's database output...</p></div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Clock className="w-3 h-3"/> Logged Time</p>
                      <p className="text-3xl font-black text-slate-800">{dailyReportData?.hours} <span className="text-sm font-bold text-slate-400">Hrs</span></p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><CheckSquare className="w-3 h-3"/> Tasks Done</p>
                      <p className="text-3xl font-black text-indigo-600">{dailyReportData?.tasks}</p>
                    </div>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 shadow-inner">
                    <h3 className="text-indigo-800 font-black text-sm uppercase tracking-wider mb-2 flex items-center gap-2"><FileText className="w-4 h-4"/> Executive Summary</h3>
                    <p className="text-indigo-900 leading-relaxed font-medium text-sm">{dailyReportData?.report}</p>
                  </div>
                  <Button onClick={() => setShowDailyReport(false)} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold h-12">Acknowledge & Close</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export function DashboardLayout({ children, role }: { children: React.ReactNode; role?: string }) {
  const isNested = useContext(LayoutContext);
  if (isNested) return <>{children}</>;
  return <LayoutContext.Provider value={true}><DashboardLayoutCore role={role}>{children}</DashboardLayoutCore></LayoutContext.Provider>;
}