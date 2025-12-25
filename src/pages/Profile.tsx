import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  User,
  Mail,
  Phone,
  Briefcase,
  Bell,
  Clock,
  Star,
  Target,
  Brain,
  Zap,
  Heart,
  Save,
  CheckCircle2,
  Camera
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardLayout } from '@/components/DashboardLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';

const mockProfile = {
  firstName: 'Alex',
  lastName: 'Thompson',
  email: 'alex.thompson@company.com',
  phone: '+1 (555) 123-4567',
  role: 'Product Manager',
  department: 'Product',
  bio: 'Passionate about building products that solve real problems.',
  availability: 75,
  workingStyle: { driver: 70, analytical: 85, expressive: 60, amiable: 75 },
  strengths: ['Strategic Planning', 'Data Analysis', 'Stakeholder Management'],
  notifications: { email: true, inApp: true, projectUpdates: true, taskAssignments: true, weeklyDigest: true, mentions: true },
};

const allStrengths = ['Strategic Planning', 'Data Analysis', 'Stakeholder Management', 'Agile Methods', 'Team Leadership', 'Risk Management', 'Budget Planning', 'Technical Writing', 'User Research', 'Prototyping'];

export default function Profile() {
  const [profile, setProfile] = useState(mockProfile);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => { setIsSaving(false); setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000); }, 1500);
  };

  const toggleStrength = (strength: string) => {
    setProfile(prev => ({
      ...prev,
      strengths: prev.strengths.includes(strength) ? prev.strengths.filter(s => s !== strength) : [...prev.strengths, strength],
    }));
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <Breadcrumbs items={[
          { label: 'Account', href: '/account' },
          { label: 'Profile' }
        ]} />

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground mb-2">My Profile</h1>
            <p className="text-muted-foreground">Update your personal information and preferences</p>
          </div>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {saveSuccess ? <><CheckCircle2 className="w-4 h-4" />Saved!</> : isSaving ? 'Saving...' : <><Save className="w-4 h-4" />Save Changes</>}
          </Button>
        </div>

        <div className="fusion-card p-6 mb-6">
          <h3 className="font-display font-semibold text-foreground mb-4">Personal Information</h3>
          <div className="flex items-start gap-6 mb-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <span className="text-3xl font-bold text-primary">{profile.firstName[0]}{profile.lastName[0]}</span>
              </div>
              <button className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
                <Camera className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium text-foreground mb-2 block">First Name</label><Input value={profile.firstName} onChange={(e) => setProfile(prev => ({ ...prev, firstName: e.target.value }))} /></div>
              <div><label className="text-sm font-medium text-foreground mb-2 block">Last Name</label><Input value={profile.lastName} onChange={(e) => setProfile(prev => ({ ...prev, lastName: e.target.value }))} /></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div><label className="text-sm font-medium text-foreground mb-2 block flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" />Email</label><Input type="email" value={profile.email} onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))} /></div>
            <div><label className="text-sm font-medium text-foreground mb-2 block flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" />Phone</label><Input value={profile.phone} onChange={(e) => setProfile(prev => ({ ...prev, phone: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div><label className="text-sm font-medium text-foreground mb-2 block flex items-center gap-2"><Briefcase className="w-4 h-4 text-muted-foreground" />Role</label><Input value={profile.role} onChange={(e) => setProfile(prev => ({ ...prev, role: e.target.value }))} /></div>
            <div><label className="text-sm font-medium text-foreground mb-2 block">Department</label>
              <Select value={profile.department} onValueChange={(value) => setProfile(prev => ({ ...prev, department: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Product">Product</SelectItem>
                  <SelectItem value="Engineering">Engineering</SelectItem>
                  <SelectItem value="Design">Design</SelectItem>
                  <SelectItem value="Sales">Sales</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><label className="text-sm font-medium text-foreground mb-2 block">Bio</label><Textarea value={profile.bio} onChange={(e) => setProfile(prev => ({ ...prev, bio: e.target.value }))} className="resize-none" rows={3} /></div>
        </div>

        <div className="fusion-card p-6 mb-6">
          <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2"><Star className="w-5 h-5 text-primary" />My Strengths</h3>
          <div className="flex flex-wrap gap-2">
            {allStrengths.map((strength) => (
              <button key={strength} onClick={() => toggleStrength(strength)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${profile.strengths.includes(strength) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                {profile.strengths.includes(strength) && <CheckCircle2 className="w-3 h-3 inline mr-1" />}{strength}
              </button>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
