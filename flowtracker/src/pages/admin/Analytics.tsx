import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  FolderKanban,
  Activity,
  BarChart3,
  Bell,
  MessageSquare,
  Settings,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { PresenceStatus, WorkMode } from "@/types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

const navItems = [
  { title: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { title: "Team Leads", href: "/admin/team-leads", icon: UserCheck },
  { title: "Employees", href: "/admin/employees", icon: Users },
  { title: "Projects", href: "/admin/projects", icon: FolderKanban },
  { title: "Presence", href: "/admin/presence", icon: Activity },
  { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  { title: "Complaints", href: "/admin/complaints", icon: AlertTriangle },
  { title: "Notifications", href: "/admin/notifications", icon: Bell },
  { title: "Chat", href: "/admin/chat", icon: MessageSquare },
  { title: "Settings", href: "/admin/settings", icon: Settings },
];

const weeklyHoursData = [
  { day: "Mon", hours: 186 },
  { day: "Tue", hours: 205 },
  { day: "Wed", hours: 198 },
  { day: "Thu", hours: 212 },
  { day: "Fri", hours: 195 },
  { day: "Sat", hours: 45 },
  { day: "Sun", hours: 12 },
];

const workModeData = [
  { name: "WFO", value: 67, color: "hsl(217, 91%, 60%)" },
  { name: "WFH", value: 45, color: "hsl(38, 92%, 50%)" },
  { name: "Offline", value: 44, color: "hsl(215, 16%, 47%)" },
];

const productivityData = [
  { week: "W1", completed: 45, assigned: 52 },
  { week: "W2", completed: 52, assigned: 58 },
  { week: "W3", completed: 48, assigned: 55 },
  { week: "W4", completed: 61, assigned: 65 },
];

export default function Analytics() {
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>("online");
  const [workMode, setWorkMode] = useState<WorkMode | undefined>(undefined);

  const handlePresenceChange = (status: PresenceStatus, mode?: WorkMode) => {
    setPresenceStatus(status);
    setWorkMode(mode);
  };

  return (
    <DashboardLayout
      role="admin"
      navItems={navItems}
      userName="Admin User"
      userEmail="admin@company.com"
      presenceStatus={presenceStatus}
      workMode={workMode}
      onPresenceChange={handlePresenceChange}
    >
      <div className="page-header">
        <h1 className="page-title">Analytics</h1>
        <p className="page-description">Organization performance insights and reports</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Task Completion Rate"
          value="87%"
          icon={CheckCircle2}
          trend={{ value: 5, isPositive: true }}
        />
        <StatCard
          title="Avg. Daily Hours"
          value="7.2h"
          icon={Clock}
          trend={{ value: 3, isPositive: true }}
        />
        <StatCard
          title="Active Projects"
          value="24"
          icon={FolderKanban}
          description="6 due this week"
        />
        <StatCard
          title="Team Productivity"
          value="92%"
          icon={TrendingUp}
          trend={{ value: 8, isPositive: true }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Weekly Hours Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Work Hours</CardTitle>
            <CardDescription>Total hours logged per day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyHoursData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Work Mode Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Work Mode Distribution</CardTitle>
            <CardDescription>Current workforce distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={workModeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {workModeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4">
              {workModeData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm">{item.name}: {item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Task Completion Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Task Completion Trend</CardTitle>
          <CardDescription>Weekly comparison of assigned vs completed tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={productivityData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="week" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="assigned"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-muted-foreground" />
              <span className="text-sm">Assigned</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-sm">Completed</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
