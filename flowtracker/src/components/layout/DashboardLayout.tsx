import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { PresenceStatus, UserRole, WorkMode } from "@/types";

export type DashboardNavItem = {
  title: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
};

type DashboardLayoutProps = {
  children: React.ReactNode;
  role?: UserRole;
  navItems?: DashboardNavItem[];
  userName?: string;
  userEmail?: string;
  presenceStatus?: PresenceStatus;
  workMode?: WorkMode;
  onPresenceChange?: (status: PresenceStatus, mode?: WorkMode) => void;
};

function DashboardLayout({
  children,
  role = "employee",
  navItems,
  userName,
  userEmail,
}: DashboardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const fallbackNav: Record<UserRole, DashboardNavItem[]> = {
    admin: [
      { title: "Dashboard", href: "/admin" },
      { title: "Employees", href: "/admin/employees" },
      { title: "Team Leads", href: "/admin/team-leads" },
      { title: "Projects", href: "/admin/projects" },
      { title: "Chat", href: "/admin/chat" },
      { title: "Complaints", href: "/admin/complaints" },
    ],
    team_lead: [
      { title: "Dashboard", href: "/team_lead" },
      { title: "My Team", href: "/team_lead/my-team" },
    ],
    employee: [{ title: "Dashboard", href: "/employee" }],
  };

  const currentNav = navItems && navItems.length > 0 ? navItems : fallbackNav[role];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-64 bg-white border-r shadow-sm flex flex-col justify-between">
        <div>
          <div className="p-6 font-bold text-2xl text-blue-600">WorkFlow</div>
          <nav className="p-4 space-y-1.5">
            {currentNav.map((item) => {
              const active = location.pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`flex items-center gap-3 p-3 rounded-lg font-medium transition-colors ${
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  {Icon ? <Icon className="w-4 h-4" /> : null}
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t">
          <div className="mb-3">
            {userName ? <div className="text-sm font-semibold text-gray-900">{userName}</div> : null}
            {userEmail ? <div className="text-xs text-gray-500">{userEmail}</div> : null}
          </div>

          <button
            onClick={handleLogout}
            className="w-full text-left p-3 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">{children}</main>
    </div>
  );
}

export default DashboardLayout;
export { DashboardLayout };
