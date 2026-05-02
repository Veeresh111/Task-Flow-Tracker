import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { authService } from "@/lib/auth";
import { 
  Menu, X, LogOut, Home, Users, Briefcase, MessageSquare, 
  AlertCircle, CheckSquare, Clock, BarChart3, Bell, Settings, UserCircle, CheckCircle
} from "lucide-react";

const navItems: any = {
  admin: [
    { title: "Dashboard", href: "/admin", icon: Home },
    { title: "Presence", href: "/admin/presence", icon: Clock },
    { title: "Employees", href: "/admin/employees", icon: Users },
    { title: "Team Leads", href: "/admin/team-leads", icon: UserCircle },
    { title: "Projects", href: "/admin/projects", icon: Briefcase },
    { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    { title: "Chat", href: "/admin/chat", icon: MessageSquare },
    { title: "Complaints", href: "/admin/complaints", icon: AlertCircle },
    { title: "Notifications", href: "/admin/notifications", icon: Bell },
    { title: "Settings", href: "/admin/settings", icon: Settings },
  ],
  team_lead: [
    { title: "Dashboard", href: "/team-lead", icon: Home },
    { title: "My Team", href: "/team-lead/team", icon: Users },
    { title: "Projects", href: "/team-lead/projects", icon: Briefcase },
    { title: "Tasks", href: "/team-lead/tasks", icon: CheckSquare },
    { title: "Approvals", href: "/team-lead/approvals", icon: CheckCircle },
    { title: "Analytics", href: "/team-lead/analytics", icon: BarChart3 },
    { title: "Chat", href: "/team-lead/chat", icon: MessageSquare },
    { title: "Complaints", href: "/team-lead/complaints", icon: AlertCircle },
    { title: "Notifications", href: "/team-lead/notifications", icon: Bell },
    { title: "Settings", href: "/team-lead/settings", icon: Settings },
  ],
  employee: [
    { title: "Dashboard", href: "/employee", icon: Home },
    { title: "Presence", href: "/employee/presence", icon: Clock },
    { title: "Projects", href: "/employee/projects", icon: Briefcase },
    { title: "Tasks", href: "/employee/tasks", icon: CheckSquare },
    { title: "Work Logs", href: "/employee/worklogs", icon: Clock },
    { title: "Analytics", href: "/employee/analytics", icon: BarChart3 },
    { title: "Chat", href: "/employee/chat", icon: MessageSquare },
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
  
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const currentRole = role || "employee";
  const items = navItems[currentRole] || navItems.employee;

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (data) setUserProfile(data);

        // REAL CLOCK TRACKER: Check if user left the clock running
        const { data: activeLog } = await supabase
          .from('work_logs')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'Active')
          .single();

        if (activeLog) {
          setIsClockedIn(true);
          setActiveLogId(activeLog.id);
        }
      }
    };
    fetchSession();
  }, []);

  const handleLogout = async () => {
    try {
      await authService.signOut();
      navigate("/login");
    } catch (error) {
      navigate("/login");
    }
  };

  const toggleClock = async () => {
    if (!userProfile) return;

    if (!isClockedIn) {
      // START THE CLOCK IN DATABASE
      const { data, error } = await supabase
        .from('work_logs')
        .insert([{ user_id: userProfile.id, status: 'Active' }])
        .select()
        .single();
      
      if (!error && data) setActiveLogId(data.id);
      setIsClockedIn(true);
      toast({ title: "Clocked In", description: "Your time is now being tracked." });
    } else {
      // STOP THE CLOCK & RECORD EXACT TIMESTAMP
      if (activeLogId) {
        await supabase
          .from('work_logs')
          .update({ clock_out: new Date().toISOString(), status: 'Completed' })
          .eq('id', activeLogId);
      }
      setIsClockedIn(false);
      setActiveLogId(null);
      toast({ title: "Clocked Out", description: "Your hours have been successfully logged.", variant: "destructive" });
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
            return (
              <Link key={item.href} to={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
                <Icon className={`w-5 h-5 ${isActive ? "text-white" : "text-slate-500"}`} /> {item.title}
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
            <h2 className="text-lg font-semibold text-gray-800 hidden md:block">
              Welcome back, {userProfile?.name || 'User'}
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 font-medium hidden sm:block">
              {userProfile?.role?.replace('_', ' ').toUpperCase()}
            </span>
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