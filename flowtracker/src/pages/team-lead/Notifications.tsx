import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { Bell, Loader2 } from "lucide-react";

export default function Notifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const role = window.location.pathname.includes('/admin') ? 'admin' : window.location.pathname.includes('/team-lead') ? 'team_lead' : 'employee';

  useEffect(() => {
    const fetchNotifications = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        if (data) setNotifications(data);
      }
      setLoading(false);
    };
    fetchNotifications();
  }, []);

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
            <p className="text-muted-foreground">Stay updated on your workflow and alerts.</p>
          </div>
          <Bell className="w-8 h-8 text-blue-500 opacity-20" />
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-slate-50 border-b pb-4">
            <CardTitle className="text-lg">Recent Alerts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
            ) : notifications.length === 0 ? (
              <div className="p-16 text-center">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Bell className="w-8 h-8 text-blue-300" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800">You're all caught up!</h3>
                <p className="text-slate-500 mt-1">No new notifications in your inbox.</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map(n => (
                  <div key={n.id} className="p-4 hover:bg-slate-50 transition-colors flex items-start gap-4">
                    <div className="mt-1"><div className={`w-2 h-2 rounded-full ${n.is_read ? 'bg-gray-300' : 'bg-blue-600'}`} /></div>
                    <div>
                      <p className={`text-sm ${n.is_read ? 'text-gray-600' : 'font-semibold text-gray-900'}`}>{n.message}</p>
                      <span className="text-xs text-gray-400">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}