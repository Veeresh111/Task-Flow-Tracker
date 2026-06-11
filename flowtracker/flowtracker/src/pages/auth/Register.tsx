import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, UserPlus, CheckCircle2 } from "lucide-react";
import { authService } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

export default function Register() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    department: "",
    role: "employee", // NEW: Added role field to capture multi-role registrations
    teamLeadId: "",
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  // REAL Database Team Leads
  const [realTeamLeads, setRealTeamLeads] = useState<any[]>([]);

  // Fetch REAL team leads from the database when the page loads
  useEffect(() => {
    const fetchLeads = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('role', 'team_lead');
        
      if (data && !error) {
        setRealTeamLeads(data);
      }
    };
    fetchLeads();
  }, []);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = () => setStep(2);
  const handleBack = () => setStep(1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (formData.password !== formData.confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      setIsLoading(false);
      return;
    }

    try {
      // The REAL Database Call
      await authService.signUp(formData);
      setIsSubmitted(true);
    } catch (error: any) {
      toast({
        title: "Registration Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedTeamLead = realTeamLeads.find((tl) => tl.id === formData.teamLeadId);

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/30 p-4">
        <div className="w-full max-w-md animate-fade-in">
          <Card className="border-0 shadow-xl">
            <CardContent className="pt-12 pb-8 text-center">
              <div className="w-16 h-16 rounded-full bg-status-completed/20 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8 text-status-completed" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Registration Submitted!</h2>
              <p className="text-muted-foreground mb-6">
                {selectedTeamLead && formData.role === 'employee'
                  ? `Your request has been sent to ${selectedTeamLead.name} for approval.` 
                  : `Your account has been created successfully.`}
              </p>
              <p className="text-sm text-muted-foreground mb-8">
                Please check your email to verify your account before logging in.
              </p>
              <Button onClick={() => navigate("/login")} className="gradient-primary text-white">
                Go to Login
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/30 p-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shadow-lg">
              <span className="text-xl font-bold text-white">WM</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">WorkFlow</h1>
              <p className="text-sm text-muted-foreground">Management System</p>
            </div>
          </div>
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl font-bold text-center">Create an Account</CardTitle>
            <CardDescription className="text-center">
              {step === 1 ? "Enter your personal details to get started" : "Select your team lead"}
            </CardDescription>

            {/* Step Indicator */}
            <div className="flex items-center justify-center gap-2 pt-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= 1 ? "gradient-primary text-white" : "bg-muted text-muted-foreground"}`}>1</div>
              <div className={`w-12 h-1 rounded ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= 2 ? "gradient-primary text-white" : "bg-muted text-muted-foreground"}`}>2</div>
            </div>
          </CardHeader>

          <form onSubmit={step === 2 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
            <CardContent className="space-y-4">
              {step === 1 ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" placeholder="John Doe" value={formData.name} onChange={(e) => handleChange("name", e.target.value)} required className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="name@company.com" value={formData.email} onChange={(e) => handleChange("email", e.target.value)} required className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" type="tel" placeholder="+1 (555) 000-0000" value={formData.phone} onChange={(e) => handleChange("phone", e.target.value)} required className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Select value={formData.department} onValueChange={(value) => handleChange("department", value)}>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="engineering">Engineering</SelectItem>
                        <SelectItem value="design">Design</SelectItem>
                        <SelectItem value="marketing">Marketing</SelectItem>
                        <SelectItem value="sales">Sales</SelectItem>
                        <SelectItem value="hr">Human Resources</SelectItem>
                        <SelectItem value="finance">Finance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* NEW: Role Selection so the database captures 'hr', 'admin', etc. correctly */}
                  <div className="space-y-2">
                    <Label htmlFor="role">Account Role</Label>
                    <Select value={formData.role} onValueChange={(value) => handleChange("role", value)}>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select your role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">Employee</SelectItem>
                        <SelectItem value="hr">Human Resources (HR)</SelectItem>
                        <SelectItem value="team_lead">Team Lead</SelectItem>
                        <SelectItem value="admin">System Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input id="password" type={showPassword ? "text" : "password"} placeholder="Create a strong password" value={formData.password} onChange={(e) => handleChange("password", e.target.value)} required className="h-11 pr-10" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input id="confirmPassword" type="password" placeholder="Confirm your password" value={formData.confirmPassword} onChange={(e) => handleChange("confirmPassword", e.target.value)} required className="h-11" />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Select Your Team Lead</Label>
                    <p className="text-sm text-muted-foreground">
                      {realTeamLeads.length === 0 || formData.role !== 'employee'
                        ? "You do not need to select a team lead for your role. You may submit the form." 
                        : "Your registration will be sent for approval to the selected team lead."}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {realTeamLeads.map((teamLead) => (
                      <div
                        key={teamLead.id}
                        onClick={() => handleChange("teamLeadId", teamLead.id)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          formData.teamLeadId === teamLead.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{teamLead.name}</p>
                            <p className="text-sm text-muted-foreground">{teamLead.email}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <div className="flex gap-3 w-full">
                {step === 2 && (
                  <Button type="button" variant="outline" onClick={handleBack} className="flex-1 h-11">
                    Back
                  </Button>
                )}
                <Button 
                  type="submit" 
                  className="flex-1 h-11 gradient-primary text-white font-medium" 
                  // UPDATED: Doesn't force HR/Admins to select a team lead
                  disabled={isLoading || (step === 2 && realTeamLeads.length > 0 && !formData.teamLeadId && formData.role === 'employee')}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Submitting...
                    </span>
                  ) : step === 1 ? (
                    "Continue"
                  ) : (
                    <span className="flex items-center gap-2">
                      <UserPlus className="w-4 h-4" />
                      Submit Registration
                    </span>
                  )}
                </Button>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account? <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}