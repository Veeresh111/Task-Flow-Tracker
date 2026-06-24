export type UserRole = 'admin' | 'hr' | 'team_lead' | 'employee' | 'candidate' | 'payroll' | 'manager';

export type PresenceStatus = 'online' | 'offline';

export type WorkMode = 'wfo' | 'wfh';

export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed';

export type ComplaintStatus = 'pending' | 'resolved' | 'closed';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  teamLeadId?: string;
  approvalStatus?: ApprovalStatus;
  presenceStatus?: PresenceStatus;
  workMode?: WorkMode;
  onlineSince?: Date;
  createdAt: Date;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  teamLeadIds: string[];
  status: 'active' | 'completed' | 'on_hold';
  progress: number;
  deadline: Date;
  createdAt: Date;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  assigneeId: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high';
  deadline: Date;
  hoursSpent: number;
  createdBy: string;
  createdAt: Date;
}

export interface WorkLog {
  id: string;
  taskId: string;
  userId: string;
  summary: string;
  hoursSpent: number;
  date: Date;
  createdAt: Date;
}

export interface Complaint {
  id: string;
  title: string;
  description: string;
  raisedBy: string;
  status: ComplaintStatus;
  assignedTo?: string;
  createdAt: Date;
  resolvedAt?: Date;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  senderId: string;
  recipientId: string;
  read: boolean;
  createdAt: Date;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  createdAt: Date;
}

export interface PresenceSession {
  id: string;
  userId: string;
  status: PresenceStatus;
  workMode: WorkMode;
  startTime: Date;
  endTime?: Date;
  duration?: number;
}

// ===== Recruitment Types (Phase 3.2) =====

export interface JobForm {
  id: string;
  job_title: string;
  jd_text?: string;
  requires_assessment?: boolean;
  apply_link?: string;
  department?: string;
  location?: string;
  required_skills?: string[];
  experience_required?: string;
  salary_range?: string;
  employment_type?: string;
  company_description?: string;
  status?: string;
  created_at: string;
  updated_at?: string;
}

export interface JobApplication {
  id: string;
  form_id: string;
  candidate_id: string;
  status: string;
  match_score?: number;
  interview_status?: string;
  assessment_score?: number;
  interview_score?: number;
  offer_status?: string;
  parsed_resume_text?: string;
  recruiter_notes?: string;
  assigned_recruiter?: string;
  candidate_name?: string;
  candidate_email?: string;
  resume_url?: string;
  answers?: Record<string, any>;
  parsed_resume_text?: string;
  ai_score?: number;
  ai_verdict?: string;
  job_forms?: JobForm;
  candidates?: Candidate;
  created_at: string;
  updated_at?: string;
}

export interface Candidate {
  id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  ats_score?: number;
  recommendation?: string;
  verification_status?: string;
  role?: string;
  department?: string;
  created_at?: string;
}

export interface Assessment {
  id: string;
  job_form_id?: string;
  title: string;
  description?: string;
  questions?: any;
  config?: any;
  max_violations?: number;
  difficulty?: string;
  duration_minutes?: number;
  passing_score?: number;
  created_at?: string;
}

export interface AssessmentToken {
  id: string;
  token: string;
  application_id: string;
  assessment_id?: string;
  status: string;
  expires_at: string;
  started_at?: string;
  completed_at?: string;
  proctor_log?: any;
  created_at?: string;
}

export interface InterviewSession {
  id: string;
  application_id: string;
  round_number: number;
  round_name?: string;
  scheduled_at: string;
  meeting_link?: string;
  status: string;
  feedback?: string;
  score?: number;
  created_at?: string;
}

export interface OfferLetter {
  id: string;
  application_id?: string;
  candidate_id?: string;
  status: string;
  offered_ctc?: number;
  joining_date?: string;
  offer_letter_url?: string;
  terms?: string;
  notes?: string;
  approved_at?: string;
  approved_by?: string;
  sent_at?: string;
  responded_at?: string;
  candidates?: Candidate;
  job_forms?: JobForm;
  created_at: string;
}

export interface CandidateNotification {
  id: string;
  candidate_id: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface BackgroundVerification {
  id: string;
  candidate_id: string;
  status: string;
  document_type?: string;
  document_url?: string;
  remarks?: string;
  verified_at?: string;
  created_at?: string;
}

export interface CandidateOnboarding {
  id: string;
  candidate_id: string;
  stage: string;
  status?: string;
  employee_code?: string;
  documents?: any;
  created_at?: string;
}
