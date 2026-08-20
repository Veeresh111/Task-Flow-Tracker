import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useNotifications } from "@/hooks/useNotifications";
import { Loader2, Bell, Clock, CheckCircle, AlertCircle, Calendar, CheckCheck, Sparkles } from "lucide-react";

export default function HRNotifications() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id);
      }
    });
  }, []);

  const { notifications, unreadCount, markAsRead, markAllAsRead, loading } = useNotifications(userId, "hr");

  useEffect(() => {
    if (userId && unreadCount > 0) {
      markAllAsRead();
    }
  }, [userId, unreadCount]);

  const getIconForType = (title: string, type?: string) => {
    const t = ((title || "") + " " + (type || "")).toLowerCase();
    if (t.includes('sync') || t.includes('meeting') || t.includes('dispatch') || t.includes('schedule')) return <Calendar className="w-5 h-5 text-indigo-500" />;
    if (t.includes('approval') || t.includes('accepted') || t.includes('complete')) return <CheckCircle className="w-5 h-5 text-emerald-500" />;
    if (t.includes('complaint') || t.includes('alert') || t.includes('reject')) return <AlertCircle className="w-5 h-5 text-rose-500" />;
    if (t.includes('ai') || t.includes('audit')) return <Sparkles className="w-5 h-5 text-purple-500" />;
    return <Bell className="w-5 h-5 text-blue-500" />;
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return "Just now";
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-12">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Bell className="w-8 h-8 text-blue-600 dark:text-blue-400" /> HR Activity Hub
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Review applicant updates, recruitment notifications, and HR alerts.</p>
          </div>
          {unreadCount > 0 && (
            <Button
              onClick={markAllAsRead}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2 shadow-sm"
            >
              <CheckCheck className="w-4 h-4" /> Mark All as Read ({unreadCount})
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div>
        ) : (
          <div className="space-y-4">
            {notifications.length === 0 ? (
              <Card className="border-dashed border-2 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                <CardContent className="flex flex-col items-center justify-center p-12 text-slate-400">
                  <Bell className="w-12 h-12 mb-3 opacity-20" />
                  <p className="font-medium text-slate-500 dark:text-slate-400">You're all caught up!</p>
                  <p className="text-sm">No new notifications in your feed.</p>
                </CardContent>
              </Card>
            ) : (
              notifications.map((notif) => (
                <Card 
                  key={notif.id} 
                  onMouseEnter={() => {
                    if (!notif.is_read) markAsRead(notif.id);
                  }}
                  className={`transition-all hover:shadow-md border-l-4 ${
                    notif.is_read 
                      ? 'border-l-slate-300 dark:border-l-slate-700 bg-white dark:bg-slate-800' 
                      : 'border-l-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
                  }`}
                >
                  <CardContent className="p-5 flex gap-4 items-start">
                    <div className={`p-2.5 rounded-full ${notif.is_read ? 'bg-slate-100 dark:bg-slate-700' : 'bg-blue-100 dark:bg-blue-900/50'}`}>
                      {getIconForType(notif.title, notif.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className={`font-bold ${notif.is_read ? 'text-slate-700 dark:text-slate-200' : 'text-slate-900 dark:text-white'}`}>
                          {notif.title || "Notification"}
                        </h3>
                        <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {formatTime(notif.created_at)}
                        </span>
                      </div>
                      <p className={`text-sm ${notif.is_read ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100 font-medium'}`}>
                        {notif.message || "You have a new system alert."}
                      </p>
                    </div>
                    {!notif.is_read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAsRead(notif.id)}
                        className="shrink-0 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 gap-1"
                      >
                        <CheckCheck className="w-4 h-4" /> Mark read
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
