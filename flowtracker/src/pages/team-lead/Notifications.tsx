import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { Loader2, Bell, Clock, CheckCircle, AlertCircle, Calendar } from "lucide-react";

export default function Notifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAndClearNotifications();
  }, []);

  const fetchAndClearNotifications = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Fetch all notifications for this specific user
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) setNotifications(data);
    setLoading(false);

    // 2. The Resolution Engine: Mark all as read in the database
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
  };

  const getIconForType = (title: string) => {
    // BUG FIX: Null-safety check prevents the blank white screen crash
    const t = (title || "System Notification").toLowerCase();
    
    if (t.includes('sync') || t.includes('meeting') || t.includes('dispatch')) return <Calendar className="w-5 h-5 text-indigo-500" />;
    if (t.includes('approval') || t.includes('accepted')) return <CheckCircle className="w-5 h-5 text-emerald-500" />;
    if (t.includes('complaint') || t.includes('alert')) return <AlertCircle className="w-5 h-5 text-red-500" />;
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
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Bell className="w-8 h-8 text-blue-600" /> Activity Hub
          </h1>
          <p className="text-slate-500 mt-1">Review your recent alerts, meeting syncs, and system notifications.</p>
        </div>

        {loading ? (
          <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div>
        ) : (
          <div className="space-y-4">
            {notifications.length === 0 ? (
              <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
                <CardContent className="flex flex-col items-center justify-center p-12 text-slate-400">
                  <Bell className="w-12 h-12 mb-3 opacity-20" />
                  <p className="font-medium text-slate-500">You're all caught up!</p>
                  <p className="text-sm">No new notifications in your feed.</p>
                </CardContent>
              </Card>
            ) : (
              notifications.map((notif) => (
                <Card key={notif.id} className={`transition-all hover:shadow-md border-l-4 ${notif.is_read ? 'border-l-slate-200 bg-white' : 'border-l-blue-500 bg-blue-50/30'}`}>
                  <CardContent className="p-5 flex gap-4 items-start">
                    <div className={`p-2.5 rounded-full ${notif.is_read ? 'bg-slate-100' : 'bg-blue-100'}`}>
                      {getIconForType(notif.title)}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className={`font-bold ${notif.is_read ? 'text-slate-700' : 'text-slate-900'}`}>{notif.title || "Notification"}</h3>
                        <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {formatTime(notif.created_at)}
                        </span>
                      </div>
                      <p className={`text-sm ${notif.is_read ? 'text-slate-500' : 'text-slate-700 font-medium'}`}>
                        {notif.message || "You have a new system alert."}
                      </p>
                    </div>
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