import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
import { 
  Bell, CheckCircle, AlertCircle, Calendar, CheckCheck, Inbox, Clock, ExternalLink, Sparkles
} from "lucide-react";

interface NotificationPopoverProps {
  userId: string | null;
  role: string;
}

export function NotificationPopover({ userId, role }: NotificationPopoverProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");
  
  const { notifications, unreadCount, markAsRead, markAllAsRead, loading } = useNotifications(userId, role);

  const normalizedRole = (role || "employee").toLowerCase().replace("-", "_");
  const notificationPath = normalizedRole === "candidate" ? "/candidate/notifications" :
                           normalizedRole === "admin" ? "/admin/notifications" :
                           normalizedRole === "hr" ? "/hr/notifications" :
                           normalizedRole === "team_lead" || normalizedRole === "tl" ? "/team-lead/notifications" :
                           "/employee/notifications";

  const displayedNotifications = activeTab === "unread" 
    ? notifications.filter(n => !n.is_read)
    : notifications;

  const handleBellClick = (e: React.MouseEvent) => {
    console.log(`[NOTIFICATION_DEBUG] Bell icon clicked! (userId: ${userId}, role: ${role}, unreadCount: ${unreadCount})`);
    // Step 3: Force the Update - Forcefully set local badge counter to 0 immediately upon clicking
    if (unreadCount > 0) {
      console.log("[NOTIFICATION_DEBUG] Forcefully clearing badge counter to 0 before DB roundtrip...");
      markAllAsRead();
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    console.log(`[NOTIFICATION_DEBUG] Notification popover open state changed to: ${isOpen}`);
    setOpen(isOpen);
    
    // When the user opens the popover, forcefully clear all unread items immediately
    if (isOpen && unreadCount > 0) {
      console.log("[NOTIFICATION_DEBUG] Popover opened with unread items. Triggering markAllAsRead...");
      markAllAsRead();
    }
  };

  const getIconForType = (title: string, type?: string) => {
    const t = (title + " " + (type || "")).toLowerCase();
    if (t.includes('interview') || t.includes('meeting') || t.includes('schedule') || t.includes('calendar')) {
      return <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />;
    }
    if (t.includes('approval') || t.includes('accepted') || t.includes('complete') || t.includes('verified')) {
      return <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />;
    }
    if (t.includes('complaint') || t.includes('alert') || t.includes('reject') || t.includes('warning')) {
      return <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />;
    }
    if (t.includes('ai') || t.includes('audit') || t.includes('insight')) {
      return <Sparkles className="w-4 h-4 text-purple-500 shrink-0" />;
    }
    return <Bell className="w-4 h-4 text-blue-500 shrink-0" />;
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return "Just now";
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleItemClick = (notif: any) => {
    console.log(`[NOTIFICATION_DEBUG] Notification item clicked: ${notif.id} (${notif.title})`);
    if (!notif.is_read) {
      markAsRead(notif.id);
    }
    if (notif.link) {
      navigate(notif.link);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          aria-label="Open notifications"
          onClick={handleBellClick}
          className="relative p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <Bell className="w-5 h-5 text-slate-300 hover:text-white transition-colors" />
          {/* Unread Badge Pill disappears instantly when unreadCount reaches 0 (user opened/viewed notifications) */}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white shadow-md animate-pulse">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80 sm:w-96 p-0 border border-slate-700 bg-[#0f172a] text-slate-100 shadow-2xl rounded-xl z-50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#020817]">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-400" />
            <h3 className="font-semibold text-sm text-white">Notifications</h3>
            {unreadCount > 0 && (
              <span className="bg-indigo-900/60 text-indigo-300 text-xs px-2 py-0.5 rounded-full font-medium border border-indigo-700/50">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                console.log("[NOTIFICATION_DEBUG] 'Mark all read' header button clicked");
                markAllAsRead();
              }}
              className="h-7 px-2 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/50 gap-1"
            >
              <CheckCheck className="w-3.5 h-3.5" /> Mark all read
            </Button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/50 px-4 py-1.5 text-xs font-medium">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1 rounded-md transition-colors ${
              activeTab === "all" 
                ? "bg-slate-800 text-white shadow-sm" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setActiveTab("unread")}
            className={`px-3 py-1 rounded-md transition-colors ${
              activeTab === "unread" 
                ? "bg-slate-800 text-white shadow-sm" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {/* List of Notifications */}
        <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-800/60 custom-scrollbar">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading notifications...</div>
          ) : displayedNotifications.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Inbox className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400 font-medium">
                {activeTab === "unread" ? "No unread notifications" : "No notifications yet"}
              </p>
            </div>
          ) : (
            displayedNotifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleItemClick(notif)}
                className={`p-3.5 transition-colors cursor-pointer flex gap-3 items-start ${
                  notif.is_read 
                    ? "hover:bg-slate-800/40 opacity-80" 
                    : "bg-slate-800/60 hover:bg-slate-800 border-l-2 border-indigo-500"
                }`}
              >
                <div className="mt-0.5 p-1.5 rounded-md bg-slate-900 border border-slate-800">
                  {getIconForType(notif.title, notif.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <h4 className={`text-xs font-medium truncate ${notif.is_read ? 'text-slate-300' : 'text-white font-semibold'}`}>
                      {notif.title || "Notification"}
                    </h4>
                    {!notif.is_read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                    {notif.message}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-1">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{formatTime(notif.created_at)}</span>
                    {notif.link && (
                      <span className="ml-auto text-indigo-400 flex items-center gap-0.5 hover:underline">
                        View <ExternalLink className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-2 border-t border-slate-800 bg-[#020817] text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              navigate(notificationPath);
              setOpen(false);
            }}
            className="w-full h-7 text-xs text-slate-400 hover:text-white hover:bg-slate-800"
          >
            View all notifications in Activity Hub
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
