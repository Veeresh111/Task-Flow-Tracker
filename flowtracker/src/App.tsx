import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth-context";
import RequireRole from "@/components/auth/RequireRole";

// Auth Pages
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import PendingApproval from "./pages/auth/PendingApproval";

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
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Root redirect to login */}
            <Route path="/" element={<Navigate to="/login" replace />} />

            {/* Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/pending-approval" element={<PendingApproval />} />

            {/* Admin Routes */}
            <Route path="/admin" element={<RequireRole allow="admin"><AdminDashboard /></RequireRole>} />
            <Route path="/admin/team-leads" element={<RequireRole allow="admin"><AdminTeamLeads /></RequireRole>} />
            <Route path="/admin/employees" element={<RequireRole allow="admin"><AdminEmployees /></RequireRole>} />
            <Route path="/admin/projects" element={<RequireRole allow="admin"><AdminProjects /></RequireRole>} />
            <Route path="/admin/presence" element={<RequireRole allow="admin"><AdminPresence /></RequireRole>} />
            <Route path="/admin/analytics" element={<RequireRole allow="admin"><AdminAnalytics /></RequireRole>} />
            <Route path="/admin/complaints" element={<RequireRole allow="admin"><AdminComplaints /></RequireRole>} />
            <Route path="/admin/notifications" element={<RequireRole allow="admin"><AdminNotifications /></RequireRole>} />
            <Route path="/admin/chat" element={<RequireRole allow="admin"><AdminChat /></RequireRole>} />
            <Route path="/admin/settings" element={<RequireRole allow="admin"><AdminSettings /></RequireRole>} />

            {/* Team Lead Routes */}
            <Route path="/team_lead" element={<RequireRole allow="team_lead"><TeamLeadDashboard /></RequireRole>} />
            <Route path="/team_lead/my-team" element={<RequireRole allow="team_lead"><TeamLeadMyTeam /></RequireRole>} />
            <Route path="/team_lead/approvals" element={<RequireRole allow="team_lead"><TeamLeadApprovals /></RequireRole>} />
            <Route path="/team_lead/projects" element={<RequireRole allow="team_lead"><TeamLeadProjects /></RequireRole>} />
            <Route path="/team_lead/tasks" element={<RequireRole allow="team_lead"><TeamLeadTasks /></RequireRole>} />
            <Route path="/team_lead/complaints" element={<RequireRole allow="team_lead"><TeamLeadComplaints /></RequireRole>} />
            <Route path="/team_lead/analytics" element={<RequireRole allow="team_lead"><TeamLeadAnalytics /></RequireRole>} />
            <Route path="/team_lead/notifications" element={<RequireRole allow="team_lead"><TeamLeadNotifications /></RequireRole>} />
            <Route path="/team_lead/chat" element={<RequireRole allow="team_lead"><TeamLeadChat /></RequireRole>} />
            <Route path="/team_lead/settings" element={<RequireRole allow="team_lead"><TeamLeadSettings /></RequireRole>} />

            {/* Employee Routes */}
            <Route path="/employee" element={<RequireRole allow="employee"><EmployeeDashboard /></RequireRole>} />
            <Route path="/employee/tasks" element={<RequireRole allow="employee"><EmployeeTasks /></RequireRole>} />
            <Route path="/employee/projects" element={<RequireRole allow="employee"><EmployeeProjects /></RequireRole>} />
            <Route path="/employee/work-logs" element={<RequireRole allow="employee"><EmployeeWorkLogs /></RequireRole>} />
            <Route path="/employee/complaints" element={<RequireRole allow="employee"><EmployeeComplaints /></RequireRole>} />
            <Route path="/employee/notifications" element={<RequireRole allow="employee"><EmployeeDashboard /></RequireRole>} />
            <Route path="/employee/chat" element={<RequireRole allow="employee"><EmployeeDashboard /></RequireRole>} />
            <Route path="/employee/settings" element={<RequireRole allow="employee"><EmployeeDashboard /></RequireRole>} />

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
