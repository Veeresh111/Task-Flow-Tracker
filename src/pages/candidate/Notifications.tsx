import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Loader2, Bell, Clock, CheckCircle, AlertCircle, Calendar, CheckCheck } from "lucide-react";

export default function CandidateNotifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [candidateId, setCandidateId] = useState<string | null>(null);

  useEffect(() => {
    fetchNotifications();
    autoMarkAllRead();
  }, []);

  const autoMarkAllRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('candidate_id').eq('id', user.id).maybeSingle();
    const resolvedId = profile?.candidate_id || user.id;
    await supabase.from('candidate_notifications').update({ read: true }).eq('candidate_id', resolvedId).eq('read', false);
  };

  useEffect(() => {
    if (!candidateId) return;
    const channel = supabase.channel(`candidate-notifs-${candidateId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidate_notifications', filter: `candidate_id=eq.${candidateId}` }, () => fetchNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [candidateId]);

  const fetchNotifications = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('candidate_id')
      .eq('id', user.id)
      .maybeSingle();

    const resolvedId = profile?.candidate_id || user.id;
    setCandidateId(resolvedId);

    const { data } = await supabase
      .from('candidate_notifications')
      .select('*')
      .eq('candidate_id', resolvedId)
      .order('created_at', { ascending: false });

    if (data) setNotifications(data);
    setLoading(false);
  };

  const markAsRead = async (notifId: string) => {
    await supabase
      .from('candidate_notifications')
      .update({ read: true })
      .eq('id', notifId);
    setNotifications(prev =>
      prev.map(n => n.id === notifId ? { ...n, read: true } : n)
    );
  };

  const getIconForType = (title: string) => {
    const t = (title || "System Notification").toLowerCase();
    if (t.includes('interview') || t.includes('schedule')) return <Calendar className="w-5 h-5 text-indigo-500" />;
    if (t.includes('offer') || t.includes('approval') || t.includes('accepted')) return <CheckCircle className="w-5 h-5 text-emerald-500" />;
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
            <Bell className="w-8 h-8 text-blue-600" /> Notifications
          </h1>
          <p className="text-slate-500 mt-1">Application status updates, interview invites, and offer alerts.</p>
        </div>

        {loading ? (
          <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div>
        ) : (
          <div className="space-y-4">
            {notifications.length === 0 ? (
              <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
                <CardContent className="flex flex-col items-center justify-center p-12 text-slate-400">
                  <Bell className="w-12 h-12 mb-3 opacity-20" />
                  <p className="font-medium text-slate-500">No notifications yet</p>
                  <p className="text-sm">Updates about your applications will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              notifications.map((notif) => (
                <Card key={notif.id} className={`transition-all hover:shadow-md border-l-4 ${notif.read ? 'border-l-slate-200 bg-white' : 'border-l-blue-500 bg-blue-50/30'}`}>
                  <CardContent className="p-5 flex gap-4 items-start">
                    <div className={`p-2.5 rounded-full ${notif.read ? 'bg-slate-100' : 'bg-blue-100'}`}>
                      {getIconForType(notif.title)}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className={`font-bold ${notif.read ? 'text-slate-700' : 'text-slate-900'}`}>{notif.title || "Notification"}</h3>
                        <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {formatTime(notif.created_at)}
                        </span>
                      </div>
                      <p className={`text-sm ${notif.read ? 'text-slate-500' : 'text-slate-700 font-medium'}`}>
                        {notif.message || "You have a new update."}
                      </p>
                    </div>
                    {!notif.read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAsRead(notif.id)}
                        className="shrink-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50 gap-1"
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
