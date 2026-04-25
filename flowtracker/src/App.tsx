import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Auth Pages
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";

// Admin Pages
import AdminDashboard from "./pages/admin/Dashboard";
import AdminTeamLeads from "./pages/admin/TeamLeads";
import AdminEmployees from "./pages/admin/Employees";
import AdminProjects from "./pages/admin/Projects";
import AdminPresence from "./pages/admin/Presence";
import AdminAnalytics from "./pages/admin/Analytics";
import AdminComplaints from "./pages/admin/Complaints";
import AdminNotifications from "./pages/admin/Notifications";
import AdminChat from "./pages/admin/Chat";
import AdminSettings from "./pages/admin/SettingsPage";

// Team Lead Pages
import TeamLeadDashboard from "./pages/team-lead/Dashboard";
import TeamLeadMyTeam from "./pages/team-lead/MyTeam";
import TeamLeadApprovals from "./pages/team-lead/Approvals";
import TeamLeadProjects from "./pages/team-lead/Projects";
import TeamLeadTasks from "./pages/team-lead/Tasks";
import TeamLeadComplaints from "./pages/team-lead/Complaints";
import TeamLeadAnalytics from "./pages/team-lead/Analytics";
import TeamLeadNotifications from "./pages/team-lead/Notifications";
import TeamLeadChat from "./pages/team-lead/Chat";
import TeamLeadSettings from "./pages/team-lead/SettingsPage";

// Employee Pages
import EmployeeDashboard from "./pages/employee/Dashboard";
import EmployeeTasks from "./pages/employee/Tasks";
import EmployeeProjects from "./pages/employee/Projects";
import EmployeeWorkLogs from "./pages/employee/WorkLogs";
import EmployeeComplaints from "./pages/employee/Complaints";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Root redirect to login */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          
          {/* Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Admin Routes */}
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/team-leads" element={<AdminTeamLeads />} />
          <Route path="/admin/employees" element={<AdminEmployees />} />
          <Route path="/admin/projects" element={<AdminProjects />} />
          <Route path="/admin/presence" element={<AdminPresence />} />
          <Route path="/admin/analytics" element={<AdminAnalytics />} />
          <Route path="/admin/complaints" element={<AdminComplaints />} />
          <Route path="/admin/notifications" element={<AdminNotifications />} />
          <Route path="/admin/chat" element={<AdminChat />} />
          <Route path="/admin/settings" element={<AdminSettings />} />

          {/* Team Lead Routes */}
          <Route path="/team_lead" element={<TeamLeadDashboard />} />
          <Route path="/team_lead/my-team" element={<TeamLeadMyTeam />} />
          <Route path="/team_lead/approvals" element={<TeamLeadApprovals />} />
          <Route path="/team_lead/projects" element={<TeamLeadProjects />} />
          <Route path="/team_lead/tasks" element={<TeamLeadTasks />} />
          <Route path="/team_lead/complaints" element={<TeamLeadComplaints />} />
          <Route path="/team_lead/analytics" element={<TeamLeadAnalytics />} />
          <Route path="/team_lead/notifications" element={<TeamLeadNotifications />} />
          <Route path="/team_lead/chat" element={<TeamLeadChat />} />
          <Route path="/team_lead/settings" element={<TeamLeadSettings />} />

          {/* Employee Routes */}
          <Route path="/employee" element={<EmployeeDashboard />} />
          <Route path="/employee/tasks" element={<EmployeeTasks />} />
          <Route path="/employee/projects" element={<EmployeeProjects />} />
          <Route path="/employee/work-logs" element={<EmployeeWorkLogs />} />
          <Route path="/employee/complaints" element={<EmployeeComplaints />} />
          <Route path="/employee/notifications" element={<EmployeeDashboard />} />
          <Route path="/employee/chat" element={<EmployeeDashboard />} />
          <Route path="/employee/settings" element={<EmployeeDashboard />} />

          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
