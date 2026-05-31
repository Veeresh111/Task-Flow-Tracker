import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { FloatingChatbot } from "./components/FloatingChatbot";
import { Toaster } from "@/components/ui/toaster";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";

// Admin Pages
import AdminDashboard from "./pages/admin/Dashboard";
import AdminEmployees from "./pages/admin/Employees";
import AdminMasterDirectory from "./pages/admin/MasterDirectory";
import AdminTeamLeads from "./pages/admin/TeamLeads";
import AdminProjects from "./pages/admin/Projects";
import AdminAnalytics from "./pages/admin/Analytics";
import AdminChat from "./pages/admin/Chat";
import AdminComplaints from "./pages/admin/Complaints";
import AdminPresence from "./pages/admin/Presence";
import AdminNotifications from "./pages/admin/Notifications";
import AdminSettings from "./pages/admin/SettingsPage";
import AdminApprovals from "./pages/admin/approvals";

// Team Lead Pages
import TeamLeadDashboard from "./pages/team-lead/Dashboard";
import TeamLeadMyTeam from "./pages/team-lead/MyTeam";
import TeamLeadProjects from "./pages/team-lead/Projects";
import TeamLeadTasks from "./pages/team-lead/Tasks";
import TeamLeadApprovals from "./pages/team-lead/Approvals";
import TeamLeadAnalytics from "./pages/team-lead/Analytics";
import TeamLeadChat from "./pages/team-lead/Chat";
import TeamLeadComplaints from "./pages/team-lead/Complaints";
import TeamLeadNotifications from "./pages/team-lead/Notifications";
import TeamLeadSettings from "./pages/team-lead/SettingsPage";
import TeamLeadLeaves from "./pages/team-lead/leaves"; 
import TeamLeadPresence from "./pages/team-lead/Presence"; // NEW
import TeamLeadWorkLogs from "./pages/team-lead/WorkLogs"; // NEW

// Employee Pages
import EmployeeDashboard from "./pages/employee/Dashboard";
import EmployeeProjects from "./pages/employee/Projects";
import EmployeeTasks from "./pages/employee/Tasks";
import EmployeeWorkLogs from "./pages/employee/WorkLogs";
import EmployeeAnalytics from "./pages/employee/Analytics";
import EmployeeChat from "./pages/employee/Chat";
import EmployeeComplaints from "./pages/employee/Complaints";
import EmployeeNotifications from "./pages/employee/Notifications";
import EmployeeSettings from "./pages/employee/SettingsPage";
import EmployeeLeaves from "./pages/employee/leaves"; 
import EmployeePresence from "./pages/employee/Presence"; // NEW

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* ADMIN ROUTES */}
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/presence" element={<AdminPresence />} />
        <Route path="/admin/employees" element={<AdminEmployees />} />
        <Route path="/admin/team-leads" element={<AdminTeamLeads />} />
        <Route path="/admin/projects" element={<AdminProjects />} />
        <Route path="/admin/analytics" element={<AdminAnalytics />} />
        <Route path="/admin/chat" element={<AdminChat />} />
        <Route path="/admin/complaints" element={<AdminComplaints />} />
        <Route path="/admin/notifications" element={<AdminNotifications />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
        <Route path="/admin/approvals" element={<AdminApprovals />} />
        <Route path="/admin/directory" element={<AdminMasterDirectory />} />

        {/* TEAM LEAD ROUTES */}
        <Route path="/team-lead" element={<TeamLeadDashboard />} />
        <Route path="/team-lead/presence" element={<TeamLeadPresence />} />
        <Route path="/team-lead/worklogs" element={<TeamLeadWorkLogs />} />
        <Route path="/team-lead/team" element={<TeamLeadMyTeam />} />
        <Route path="/team-lead/projects" element={<TeamLeadProjects />} />
        <Route path="/team-lead/tasks" element={<TeamLeadTasks />} />
        <Route path="/team-lead/approvals" element={<TeamLeadApprovals />} />
        <Route path="/team-lead/analytics" element={<TeamLeadAnalytics />} />
        <Route path="/team-lead/chat" element={<TeamLeadChat />} />
        <Route path="/team-lead/complaints" element={<TeamLeadComplaints />} />
        <Route path="/team-lead/notifications" element={<TeamLeadNotifications />} />
        <Route path="/team-lead/settings" element={<TeamLeadSettings />} />
        <Route path="/team-lead/leaves" element={<TeamLeadLeaves />} />

        {/* EMPLOYEE ROUTES */}
        <Route path="/employee" element={<EmployeeDashboard />} />
        <Route path="/employee/presence" element={<EmployeePresence />} />
        <Route path="/employee/worklogs" element={<EmployeeWorkLogs />} />
        <Route path="/employee/projects" element={<EmployeeProjects />} />
        <Route path="/employee/tasks" element={<EmployeeTasks />} />
        <Route path="/employee/analytics" element={<EmployeeAnalytics />} />
        <Route path="/employee/chat" element={<EmployeeChat />} />
        <Route path="/employee/complaints" element={<EmployeeComplaints />} />
        <Route path="/employee/notifications" element={<EmployeeNotifications />} />
        <Route path="/employee/settings" element={<EmployeeSettings />} />
        <Route path="/employee/leaves" element={<EmployeeLeaves />} />
        
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <Toaster />
      <FloatingChatbot />
      <Toaster />
    </Router>
  );
}
