import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Plus, Briefcase } from "lucide-react";

export default function Projects() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', status: 'active' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchProjects = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (!error && data) setProjects(data);
    setLoading(false);
  };

  useEffect(() => { fetchProjects(); }, []);

  // REAL BUTTON CONNECTION: Creates project in database
  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('projects').insert([formData]);
      if (error) throw error;
      toast({ title: "Project Created Successfully" });
      setShowAdd(false);
      setFormData({ name: '', description: '', status: 'active' });
      fetchProjects();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Project Management</h1>
            <p className="text-muted-foreground">Create and manage high-level company projects.</p>
          </div>
          <Button onClick={() => setShowAdd(!showAdd)} className="bg-blue-600 text-white">
            <Plus className="w-4 h-4 mr-2" /> {showAdd ? "Cancel" : "New Project"}
          </Button>
        </div>

        {showAdd && (
          <Card className="bg-blue-50/30 border-blue-200">
            <CardHeader><CardTitle>Create New Project</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleAddProject} className="space-y-4">
                <div className="space-y-2">
                  <Label>Project Name</Label>
                  <Input required placeholder="e.g. Mobile App Redesign" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input required placeholder="Brief project overview" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                </div>
                <Button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white">
                  {isSubmitting ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Briefcase className="w-4 h-4 mr-2" />}
                  Create Project
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>All Projects Database</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="p-8 text-center"><Loader2 className="animate-spin w-6 h-6 mx-auto text-blue-600" /></div> : projects.length === 0 ? <p className="text-center text-gray-500 p-8">No projects created yet.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Project Name</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {projects.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-bold">{p.name}</TableCell>
                      <TableCell className="text-gray-500">{p.description}</TableCell>
                      <TableCell><span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase">{p.status}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}