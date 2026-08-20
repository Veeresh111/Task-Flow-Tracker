import { BrowserRouter as Router, Routes, Route, Outlet, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/lib/theme";
import { FloatingChatbot } from "./components/FloatingChatbot";
import { Toaster } from "@/components/ui/toaster";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 15,
      refetchOnWindowFocus: false,
    },
  },
});
import Landing from "./pages/Landing";
import About from "./pages/About";
import Services from "./pages/Services";
import Careers from "./pages/Careers";
import Contact from "./pages/Contact";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ResetPassword from "./pages/auth/ResetPassword";
import AuthCallback from "./pages/auth/AuthCallback";
import OAuthPending from "./pages/auth/OAuthPending";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Public Modules (Anonymous Access Points)
import JobApplication from "./pages/public/JobApplication";
import AssessmentAccess from "./pages/public/AssessmentAccess";
import EmployeeActivation from "./pages/public/EmployeeActivation";
import NotificationDiagnostic from "./components/NotificationDiagnostic";
import NotFound from "./pages/NotFound";

// Admin Modules
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
import AdminPayroll from "./pages/admin/Payroll";
import AdminAIInsights from "./pages/admin/AIInsights";
import AdminAuditLog from "./pages/admin/AuditLog";

// Team Lead Modules
import TeamLeadDashboard from "./pages/team-lead/Dashboard";
import TeamLeadPayroll from "./pages/team-lead/Payroll";
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
import TeamLeadPresence from "./pages/team-lead/Presence";
import TeamLeadWorkLogs from "./pages/team-lead/WorkLogs";
import TeamLeadAIInsights from "./pages/team-lead/AIInsights";

// Employee Modules
import EmployeeDashboard from "./pages/employee/Dashboard";
import EmployeePayroll from "./pages/employee/Payroll";
import EmployeeProjects from "./pages/employee/Projects";
import EmployeeTasks from "./pages/employee/Tasks";
import EmployeeWorkLogs from "./pages/employee/WorkLogs";
import EmployeeAnalytics from "./pages/employee/Analytics";
import EmployeeChat from "./pages/employee/Chat";
import EmployeeComplaints from "./pages/employee/Complaints";
import EmployeeNotifications from "./pages/employee/Notifications";
import EmployeeSettings from "./pages/employee/SettingsPage";
import EmployeeLeaves from "./pages/employee/leaves";
import EmployeePresence from "./pages/employee/Presence";
import EmployeeAIInsights from "./pages/employee/AIInsights";

// HR Modules
import HRDashboard from "./pages/hr/Dashboard";
import HRRecruitment from "./pages/hr/Recruitment";
import HRPayroll from "./pages/hr/Payroll";
import HRAIInsights from "./pages/hr/AIInsights";
import SmartInbox from "./pages/hr/SmartInbox";
import ApplicationHub from "./pages/hr/ApplicationHub";
import OnboardingCenter from "@/pages/hr/OnboardingCenter";
import HRCandidateMessages from "@/pages/hr/recruitment/CandidateMessages";
import OfferManagement from "@/pages/hr/recruitment/OfferManagement";
import HRNotifications from "@/pages/hr/Notifications";
import ProctoringDashboard from "@/pages/hr/recruitment/ProctoringDashboard";
import EmployeeInvite from "./pages/hr/EmployeeInvite";
import HrPendingApprovals from "./pages/hr/PendingApprovals";
import UserVerification from "./pages/hr/UserVerification";
import HRCandidates from "./pages/hr/Candidates";

// Candidate Dashboard Modules
import CandidateDashboard from "@/pages/candidate/Dashboard";
import CandidateCareers from "@/pages/candidate/Careers";
import CandidateMessages from "@/pages/candidate/Messages";
import ActiveAssessments from "@/pages/candidate/ActiveAssessments";
import CandidateInterviews from "@/pages/candidate/Interviews";
import CandidateNotifications from "@/pages/candidate/Notifications";
import CandidateIdentity from "@/pages/candidate/Identity";

/**
 * AppRoutes — inner component that must live INSIDE <Router> so it can
 * safely call useLocation() and react to client-side navigation changes.
 * This fixes the anti-pattern of reading window.location.pathname directly.
 */
function AppRoutes() {
  const location = useLocation();
  // Hide floating chatbot on all /assessment routes (proctored exam environment)
  const isAssessmentRoute = /^\/assessment/.test(location.pathname);

  return (
    <>
      <Routes>
        {/* ─── CORPORATE PUBLIC PAGES ─── */}
        <Route path="/" element={<Landing />} />
        <Route path="/about" element={<About />} />
        <Route path="/services" element={<Services />} />
        <Route path="/careers" element={<Careers />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* ─── ANONYMOUS PUBLIC ROUTES ─── */}
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/apply/:formId" element={<JobApplication />} />
        <Route path="/assessment" element={<AssessmentAccess />} />
        <Route path="/assessment/:token" element={<AssessmentAccess />} />
        <Route path="/diagnostic" element={<NotificationDiagnostic />} />
        <Route path="/employee-activation" element={<EmployeeActivation />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/pending" element={<OAuthPending />} />

        {/* ─── ADMIN CONTEXT ─── */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <DashboardLayout role="admin">
                <Outlet />
              </DashboardLayout>
            </ProtectedRoute>
          }
        >
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/presence" element={<AdminPresence />} />
          <Route path="/admin/employees" element={<AdminEmployees />} />
          <Route path="/admin/team-leads" element={<AdminTeamLeads />} />
          <Route path="/admin/projects" element={<AdminProjects />} />
          <Route path="/admin/analytics" element={<AdminAnalytics />} />
          <Route path="/admin/payroll" element={<AdminPayroll />} />
          <Route path="/admin/ai-insights" element={<AdminAIInsights />} />
          <Route path="/admin/chat" element={<AdminChat />} />
          <Route path="/admin/complaints" element={<AdminComplaints />} />
          <Route path="/admin/notifications" element={<AdminNotifications />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/approvals" element={<AdminApprovals />} />
          <Route path="/admin/directory" element={<AdminMasterDirectory />} />
          <Route path="/admin/audit-log" element={<AdminAuditLog />} />
          <Route path="/admin/employee-invite" element={<EmployeeInvite />} />
        </Route>

        {/* ─── TEAM LEAD CONTEXT ─── */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["team_lead", "tl"]}>
              <DashboardLayout role="team_lead">
                <Outlet />
              </DashboardLayout>
            </ProtectedRoute>
          }
        >
          <Route path="/team-lead" element={<TeamLeadDashboard />} />
          <Route path="/team-lead/presence" element={<TeamLeadPresence />} />
          <Route path="/team-lead/worklogs" element={<TeamLeadWorkLogs />} />
          <Route path="/team-lead/team" element={<TeamLeadMyTeam />} />
          <Route path="/team-lead/projects" element={<TeamLeadProjects />} />
          <Route path="/team-lead/tasks" element={<TeamLeadTasks />} />
          <Route path="/team-lead/approvals" element={<TeamLeadApprovals />} />
          <Route path="/team-lead/analytics" element={<TeamLeadAnalytics />} />
          <Route path="/team-lead/payroll" element={<TeamLeadPayroll />} />
          <Route path="/team-lead/ai-insights" element={<TeamLeadAIInsights />} />
          <Route path="/team-lead/chat" element={<TeamLeadChat />} />
          <Route path="/team-lead/complaints" element={<TeamLeadComplaints />} />
          <Route path="/team-lead/notifications" element={<TeamLeadNotifications />} />
          <Route path="/team-lead/settings" element={<TeamLeadSettings />} />
          <Route path="/team-lead/leaves" element={<TeamLeadLeaves />} />
        </Route>

        {/* ─── EMPLOYEE CONTEXT ─── */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["employee"]}>
              <DashboardLayout role="employee">
                <Outlet />
              </DashboardLayout>
            </ProtectedRoute>
          }
        >
          <Route path="/employee" element={<EmployeeDashboard />} />
          <Route path="/employee/presence" element={<EmployeePresence />} />
          <Route path="/employee/worklogs" element={<EmployeeWorkLogs />} />
          <Route path="/employee/projects" element={<EmployeeProjects />} />
          <Route path="/employee/tasks" element={<EmployeeTasks />} />
          <Route path="/employee/analytics" element={<EmployeeAnalytics />} />
          <Route path="/employee/payroll" element={<EmployeePayroll />} />
          <Route path="/employee/ai-insights" element={<EmployeeAIInsights />} />
          <Route path="/employee/chat" element={<EmployeeChat />} />
          <Route path="/employee/complaints" element={<EmployeeComplaints />} />
          <Route path="/employee/notifications" element={<EmployeeNotifications />} />
          <Route path="/employee/settings" element={<EmployeeSettings />} />
          <Route path="/employee/leaves" element={<EmployeeLeaves />} />
        </Route>

        {/* ─── VERIFIED CANDIDATE CONTEXT ─── */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["candidate"]}>
              <DashboardLayout role="candidate">
                <Outlet />
              </DashboardLayout>
            </ProtectedRoute>
          }
        >
          <Route path="/candidate" element={<CandidateDashboard />} />
          <Route path="/candidate/careers" element={<CandidateCareers />} />
          <Route path="/candidate/assessments" element={<ActiveAssessments />} />
          <Route path="/candidate/messages" element={<CandidateMessages />} />
          <Route path="/candidate/interviews" element={<CandidateInterviews />} />
          <Route path="/candidate/notifications" element={<CandidateNotifications />} />
          <Route path="/candidate/identity" element={<CandidateIdentity />} />
        </Route>

        {/* ─── HUMAN RESOURCES CONTEXT ─── */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["hr"]}>
              <DashboardLayout role="hr">
                <Outlet />
              </DashboardLayout>
            </ProtectedRoute>
          }
        >
          <Route path="/hr" element={<HRDashboard />} />
          <Route path="/hr/ai-insights" element={<HRAIInsights />} />
          <Route path="/hr/smart-inbox" element={<SmartInbox />} />
          <Route path="/hr/recruitment" element={<HRRecruitment />} />
          <Route path="/hr/offers" element={<OfferManagement />} />
          <Route path="/hr/applications" element={<ApplicationHub />} />
          <Route path="/hr/messages" element={<HRCandidateMessages />} />
          <Route path="/hr/directory" element={<AdminMasterDirectory />} />
          <Route path="/hr/presence" element={<AdminPresence />} />
          <Route path="/hr/onboarding" element={<OnboardingCenter />} />
          <Route path="/hr/payroll" element={<HRPayroll />} />
          <Route path="/hr/analytics" element={<AdminAnalytics />} />
          <Route path="/hr/approvals" element={<AdminApprovals />} />
          <Route path="/hr/chat" element={<AdminChat />} />
          <Route path="/hr/complaints" element={<AdminComplaints />} />
          <Route path="/hr/notifications" element={<HRNotifications />} />
          <Route path="/hr/proctoring" element={<ProctoringDashboard />} />
          <Route path="/hr/settings" element={<AdminSettings />} />
          <Route path="/hr/employee-invite" element={<EmployeeInvite />} />
          <Route path="/hr/pending-approvals" element={<HrPendingApprovals />} />
          <Route path="/hr/user-verification" element={<UserVerification />} />
          <Route path="/hr/candidates" element={<HRCandidates />} />
        </Route>

        {/* ─── WILDCARD FALLBACK ─── */}
        <Route path="*" element={<NotFound />} />
      </Routes>

      <Toaster />
      {/* Only render chatbot outside proctored assessment environment */}
      {!isAssessmentRoute && <FloatingChatbot />}
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Router>
          <AppRoutes />
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}