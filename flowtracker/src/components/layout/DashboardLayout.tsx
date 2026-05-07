import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { authService } from "@/lib/auth";
import { 
  Menu, X, LogOut, Home, Users, Briefcase, MessageSquare, 
  AlertCircle, CheckSquare, Clock, BarChart3, Bell, Settings, UserCircle, CheckCircle, Calendar 
} from "lucide-react";

// 100% RESTORED: Notifications and Settings are back for all roles!
const navItems: any = {
  admin: [
    { title: "Dashboard", href: "/admin", icon: Home },
    { title: "Time & Presence", href: "/admin/presence", icon: Clock },
    { title: "Employees", href: "/admin/employees", icon: Users },
    { title: "Team Leads", href: "/admin/team-leads", icon: UserCircle },
    { title: "Projects", href: "/admin/projects", icon: Briefcase },
    { title: "Approvals", href: "/admin/approvals", icon: CheckCircle, badgeKey: 'approvals' },
    { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    { title: "Office Chat", href: "/admin/chat", icon: MessageSquare },
    { title: "Complaints", href: "/admin/complaints", icon: AlertCircle, badgeKey: 'complaints' },
    { title: "Notifications", href: "/admin/notifications", icon: Bell },
    { title: "Settings", href: "/admin/settings", icon: Settings },
  ],
  team_lead: [
    { title: "Dashboard", href: "/team-lead", icon: Home },
    { title: "My Team", href: "/team-lead/team", icon: Users },
    { title: "Projects", href: "/team-lead/projects", icon: Briefcase },
    { title: "Tasks", href: "/team-lead/tasks", icon: CheckSquare },
    { title: "Approvals", href: "/team-lead/approvals", icon: CheckCircle, badgeKey: 'approvals' },
    { title: "Leaves & HR", href: "/team-lead/leaves", icon: Calendar },
    { title: "Analytics", href: "/team-lead/analytics", icon: BarChart3 },
    { title: "Office Chat", href: "/team-lead/chat", icon: MessageSquare },
    { title: "Complaints", href: "/team-lead/complaints", icon: AlertCircle },
    { title: "Notifications", href: "/team-lead/notifications", icon: Bell },
    { title: "Settings", href: "/team-lead/settings", icon: Settings },
  ],
  employee: [
    { title: "Dashboard", href: "/employee", icon: Home },
    { title: "Time & Presence", href: "/employee/presence", icon: Clock },
    { title: "Projects", href: "/employee/projects", icon: Briefcase },
    { title: "Tasks", href: "/employee/tasks", icon: CheckSquare },
    { title: "Leaves & HR", href: "/employee/leaves", icon: Calendar },
    { title: "Analytics", href: "/employee/analytics", icon: BarChart3 },
    { title: "Office Chat", href: "/employee/chat", icon: MessageSquare },
    { title: "Complaints", href: "/employee/complaints", icon: AlertCircle },
    { title: "Notifications", href: "/employee/notifications", icon: Bell },
    { title: "Settings", href: "/employee/settings", icon: Settings },
  ]
};

export function DashboardLayout({ children, role }: { children: React.ReactNode; role?: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [badges, setBadges] = useState({ complaints: 0, approvals: 0, notifications: 0 });

  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const currentRole = role || "employee";
  const items = navItems[currentRole] || navItems.employee;

  useEffect(() => {
    const initApp = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      
      if (profile?.role === 'ARCHIVED') {
        await authService.signOut();
        navigate("/login");
        toast({ title: "Account Disabled", description: "Your access has been revoked.", variant: "destructive" });
        return; 
      }

      if (profile) setUserProfile(profile);
      const { data: activeLog } = await supabase.from('work_logs').select('id').eq('user_id', user.id).eq('status', 'Active').single();
      if (activeLog) { setIsClockedIn(true); setActiveLogId(activeLog.id); }

      fetchBadgeCounts(profile?.role || currentRole);
    };

    initApp();

    const channel = supabase.channel('global-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, () => fetchBadgeCounts(currentRole))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchBadgeCounts(currentRole))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaves' }, () => fetchBadgeCounts(currentRole))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resignations' }, () => fetchBadgeCounts(currentRole))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentRole]);

  const fetchBadgeCounts = async (userRole: string) => {
    let compCount = 0;
    let appCount = 0;

    if (userRole.toUpperCase() === 'ADMIN') {
      const { count: openComplaints } = await supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'Open');
      compCount = openComplaints || 0;
      const { data: adminLeaves } = await supabase.from('leaves').select('id').eq('status', 'Pending');
      const { count: pendingResignations } = await supabase.from('resignations').select('*', { count: 'exact', head: true }).eq('status', 'Pending');
      appCount = (adminLeaves?.length || 0) + (pendingResignations || 0);
    }
    
    if (userRole.toUpperCase() === 'TL' || userRole.toUpperCase() === 'TEAM_LEAD') {
      const { data: tasks } = await supabase.from('tasks').select('status');
      const pendingTasks = tasks?.filter(t => t.status?.toLowerCase().includes('pending') || t.status?.toLowerCase().includes('review')).length || 0;
      const { data: leaves } = await supabase.from('leaves').select('id').eq('status', 'Pending');
      appCount = pendingTasks + (leaves?.length || 0);
    }

    setBadges({ complaints: compCount, approvals: appCount, notifications: 0 });
  };

  const handleLogout = async () => {
    await authService.signOut();
    navigate("/login");
  };

  const toggleClock = async () => {
    if (!userProfile) return;
    if (!isClockedIn) {
      const { data } = await supabase.from('work_logs').insert([{ user_id: userProfile.id, status: 'Active' }]).select().single();
      if (data) setActiveLogId(data.id);
      setIsClockedIn(true);
      toast({ title: "Clocked In", description: "Your time is now being tracked." });
    } else {
      if (activeLogId) await supabase.from('work_logs').update({ clock_out: new Date().toISOString(), status: 'Completed' }).eq('id', activeLogId);
      setIsClockedIn(false);
      setActiveLogId(null);
      toast({ title: "Clocked Out", description: "Hours logged successfully.", variant: "destructive" });
    }
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
            const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + "/");
            const badgeCount = item.badgeKey ? badges[item.badgeKey as keyof typeof badges] : 0;

            return (
              <Link key={item.href} to={item.href} className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
                <div className="flex items-center gap-3">
                  {Icon && <Icon className={`w-5 h-5 ${isActive ? "text-white" : "text-slate-500"}`} />} 
                  {item.title}
                </div>
                {badgeCount > 0 && (
                  <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-md border border-red-500 animate-pulse">
                    {badgeCount}
                  </span>
                )}
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
            <span className="text-sm text-gray-500 font-medium hidden sm:block">{userProfile?.role?.replace('_', ' ').toUpperCase()}</span>
            <Button onClick={toggleClock} variant={isClockedIn ? "destructive" : "default"} className={`rounded-full px-6 font-semibold shadow-sm transition-all ${!isClockedIn && "bg-emerald-500 hover:bg-emerald-600 text-white"}`}>
              <Clock className="w-4 h-4 mr-2" />
              {isClockedIn ? "Clock Out" : "Clock In"}
            </Button>
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6 lg:p-8 bg-slate-50/50">{children}</div>
      </main>
    </div>
  );
}