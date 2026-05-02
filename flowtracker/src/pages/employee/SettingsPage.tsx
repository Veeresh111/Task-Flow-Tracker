import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Upload, User, Save } from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', phone: '' });

  // Magic Universal Role Detector
  const role = window.location.pathname.includes('/admin') ? 'admin' : window.location.pathname.includes('/team-lead') ? 'team_lead' : 'employee';

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (data) {
          setProfile(data);
          setFormData({ name: data.name || '', phone: data.phone || '' });
        }
      }
    };
    fetchProfile();
  }, []);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!e.target.files || e.target.files.length === 0 || !profile) return;
      
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.id}-${Math.random()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);
      if (uploadError) throw uploadError;

      // Get public URL and save to database
      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', profile.id);

      setProfile({ ...profile, avatar_url: data.publicUrl });
      toast({ title: "Profile Photo Updated!" });
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from('profiles').update({ name: formData.name, phone: formData.phone }).eq('id', profile.id);
      if (error) throw error;
      toast({ title: "Settings Saved", description: "Your profile has been successfully updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout role={role}>
      <div className="space-y-6 max-w-3xl mx-auto animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Account Settings</h1>
          <p className="text-muted-foreground">Manage your personal information and profile picture.</p>
        </div>

        <Card className="shadow-lg border-0">
          <CardHeader>
            <CardTitle>Profile Picture</CardTitle>
            <CardDescription>Upload a professional photo to be recognized by your team.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-slate-100 overflow-hidden border-4 border-white shadow-md flex shrink-0">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-12 h-12 m-auto text-slate-300" />
              )}
            </div>
            <div>
              <Label htmlFor="photo-upload" className="cursor-pointer inline-flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-md hover:bg-slate-50 transition-colors shadow-sm font-medium text-sm">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <Upload className="w-4 h-4 text-blue-600" />}
                {uploading ? "Uploading Image..." : "Upload New Photo"}
              </Label>
              <Input id="photo-upload" type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
              <p className="text-xs text-muted-foreground mt-2">JPG, PNG or GIF. Max size 2MB.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0">
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveDetails} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Email Address (Read Only)</Label>
                  <Input disabled value={profile?.email || ""} className="bg-slate-50" />
                </div>
              </div>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white mt-4" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Changes
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}