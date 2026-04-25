import { cn } from "@/lib/utils";

type StatusType = 'online' | 'offline' | 'wfo' | 'wfh' | 'pending' | 'approved' | 'rejected' | 
  'not_started' | 'in_progress' | 'blocked' | 'completed' | 'resolved' | 'closed';

interface StatusBadgeProps {
  status: StatusType;
  showDot?: boolean;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  online: { label: 'Online', className: 'status-online' },
  offline: { label: 'Offline', className: 'status-offline' },
  wfo: { label: 'WFO', className: 'status-wfo' },
  wfh: { label: 'WFH', className: 'status-wfh' },
  pending: { label: 'Pending', className: 'bg-status-pending/15 text-status-pending' },
  approved: { label: 'Approved', className: 'bg-status-completed/15 text-status-completed' },
  rejected: { label: 'Rejected', className: 'bg-status-blocked/15 text-status-blocked' },
  not_started: { label: 'Not Started', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', className: 'bg-status-in-progress/15 text-status-in-progress' },
  blocked: { label: 'Blocked', className: 'bg-status-blocked/15 text-status-blocked' },
  completed: { label: 'Completed', className: 'bg-status-completed/15 text-status-completed' },
  resolved: { label: 'Resolved', className: 'bg-status-completed/15 text-status-completed' },
  closed: { label: 'Closed', className: 'bg-muted text-muted-foreground' },
};

export function StatusBadge({ status, showDot = false, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <span className={cn("status-indicator", config.className, className)}>
      {showDot && (
        <span className={cn(
          "w-1.5 h-1.5 rounded-full",
          status === 'online' && "bg-status-online animate-pulse-subtle",
          status === 'offline' && "bg-status-offline",
          status === 'wfo' && "bg-status-wfo",
          status === 'wfh' && "bg-status-wfh",
          !['online', 'offline', 'wfo', 'wfh'].includes(status) && "bg-current"
        )} />
      )}
      {config.label}
    </span>
  );
}
