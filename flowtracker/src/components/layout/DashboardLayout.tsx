import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, Home, Users, Briefcase, MessageSquare, AlertCircle, CheckSquare, Clock } from "lucide-react";
import { authService } from "@/lib/auth";

// Define the correct sidebar items for each dynamic role
const navItems: any = {
  admin: [
    { title: "Dashboard", href: "/admin", icon: Home },
    { title: "Employees", href: "/admin/employees", icon: Users },
    { title: "Team Leads", href: "/admin/team-leads", icon: Briefcase },
    { title: "Projects", href: "/admin/projects", icon: CheckSquare },
    { title: "Chat", href: "/admin/chat", icon: MessageSquare },
    { title: "Complaints", href: "/admin/complaints", icon: AlertCircle },
  ],
  team_lead: [
    { title: "Dashboard", href: "/team-lead", icon: Home },
    { title: "My Team", href: "/team-lead/team", icon: Users },
    { title: "Projects", href: "/team-lead/projects", icon: Briefcase },
    { title: "Tasks", href: "/team-lead/tasks", icon: CheckSquare },
    { title: "Chat", href: "/team-lead/chat", icon: MessageSquare },
  ],
  employee: [
    { title: "Dashboard", href: "/employee", icon: Home },
    { title: "Projects", href: "/employee/projects", icon: Briefcase },
    { title: "Tasks", href: "/employee/tasks", icon: CheckSquare },
    { title: "Work Logs", href: "/employee/worklogs", icon: Clock },
    { title: "Chat", href: "/employee/chat", icon: MessageSquare },
  ]
};

// We now ACCEPT the role prop directly!
export function DashboardLayout({ children, role }: { children: React.ReactNode; role?: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // THE PROTECTIVE SHIELD: If role is missing, default safely so it NEVER crashes
  const currentRole = role || "employee";
  const items = navItems[currentRole] || navItems.employee;

  const handleLogout = async () => {
    try {
      await authService.signOut();
      navigate("/login");
    } catch (error) {
      navigate("/login"); // Force navigation even if network fails
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 md:hidden animate-in fade-in duration-200" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out md:translate-x-0 flex flex-col shadow-sm ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-md">
               <span className="text-white font-bold text-sm">WM</span>
            </div>
            <span className="text-xl font-bold text-gray-900 tracking-tight">WorkFlow</span>
          </div>
          <button className="md:hidden p-1 rounded-md hover:bg-gray-100 text-gray-500" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5">
          {items.map((item: any) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + "/");
            
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                  isActive 
                    ? "bg-blue-50 text-blue-700 shadow-sm" 
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Icon className={`w-5 h-5 transition-colors ${
                  isActive ? "text-blue-600" : "text-gray-400 group-hover:text-gray-600"
                }`} />
                {item.title}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50/80 transition-colors" 
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 md:pl-64 flex flex-col min-h-screen bg-slate-50/50">
        {/* Mobile top header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 md:hidden sticky top-0 z-30 shadow-sm">
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="p-2 -ml-2 mr-2 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="text-lg font-bold text-gray-900">WorkFlow</span>
        </header>

        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}