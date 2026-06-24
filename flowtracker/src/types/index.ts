export type UserRole = 'admin' | 'team_lead' | 'employee';

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
