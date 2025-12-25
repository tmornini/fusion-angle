import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Users, TrendingUp, Shield, Save, CheckCircle2, Clock, DollarSign, ChevronDown, ChevronRight, Plus, Trash2, Crown, UserCheck, Eye, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardLayout } from '@/components/DashboardLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';

const mockCompanySettings = {
  name: 'Acme Corporation', industry: 'Technology', size: '51-200', website: 'https://acmecorp.com',
  description: 'We build innovative software solutions for enterprise clients.',
  departments: ['Engineering', 'Product', 'Design', 'Sales', 'Operations', 'Finance', 'HR'],
  permissions: { allowGuestAccess: false, requireApprovalForProjects: true, allowSelfSignup: false, enforceSSO: false },
  roles: [
    { name: 'Admin', description: 'Full access to all settings and data', count: 3 },
    { name: 'Manager', description: 'Can create and manage projects', count: 8 },
    { name: 'Member', description: 'Can view and contribute to assigned projects', count: 25 },
    { name: 'Viewer', description: 'Read-only access', count: 5 },
  ],
};

export default function CompanySettings() {
  const [settings, setSettings] = useState(mockCompanySettings);
  const [expandedSection, setExpandedSection] = useState<string | null>('company');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => { setIsSaving(false); setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000); }, 1500);
  };

  const SectionHeader = ({ id, icon: Icon, title, description }: { id: string; icon: any; title: string; description: string }) => (
    <button onClick={() => setExpandedSection(expandedSection === id ? null : id)} className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className="w-5 h-5 text-primary" /></div>
        <div className="text-left"><p className="font-medium text-foreground">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div>
      </div>
      {expandedSection === id ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
    </button>
  );

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <Breadcrumbs items={[
          { label: 'Account', href: '/account' },
          { label: 'Company Settings' }
        ]} />

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground mb-2">Company Settings</h1>
            <p className="text-muted-foreground">Configure your organization's preferences and defaults</p>
          </div>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {saveSuccess ? <><CheckCircle2 className="w-4 h-4" />Saved!</> : isSaving ? 'Saving...' : <><Save className="w-4 h-4" />Save Changes</>}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="fusion-card overflow-hidden">
            <SectionHeader id="company" icon={Building2} title="Company Details" description="Basic information about your organization" />
            {expandedSection === 'company' && (
              <div className="p-6 border-t border-border bg-muted/10">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div><label className="text-sm font-medium text-foreground mb-2 block">Company Name</label><Input value={settings.name} onChange={(e) => setSettings(prev => ({ ...prev, name: e.target.value }))} /></div>
                  <div><label className="text-sm font-medium text-foreground mb-2 block">Industry</label>
                    <Select value={settings.industry} onValueChange={(value) => setSettings(prev => ({ ...prev, industry: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Technology">Technology</SelectItem><SelectItem value="Finance">Finance</SelectItem><SelectItem value="Healthcare">Healthcare</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div><label className="text-sm font-medium text-foreground mb-2 block">Description</label><Textarea value={settings.description} onChange={(e) => setSettings(prev => ({ ...prev, description: e.target.value }))} className="resize-none" rows={2} /></div>
              </div>
            )}
          </div>

          <div className="fusion-card overflow-hidden">
            <SectionHeader id="team" icon={Users} title="Team Structure" description="Departments and organizational units" />
            {expandedSection === 'team' && (
              <div className="p-6 border-t border-border bg-muted/10">
                <div className="space-y-2 mb-4">
                  {settings.departments.map((dept, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input value={dept} onChange={(e) => { const newDepts = [...settings.departments]; newDepts[index] = e.target.value; setSettings(prev => ({ ...prev, departments: newDepts })); }} className="flex-1" />
                      <Button variant="ghost" size="icon" onClick={() => setSettings(prev => ({ ...prev, departments: prev.departments.filter((_, i) => i !== index) }))} className="text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={() => setSettings(prev => ({ ...prev, departments: [...prev.departments, ''] }))} className="gap-2"><Plus className="w-4 h-4" />Add Department</Button>
              </div>
            )}
          </div>

          <div className="fusion-card overflow-hidden">
            <SectionHeader id="permissions" icon={Shield} title="Security & Permissions" description="Access controls and security settings" />
            {expandedSection === 'permissions' && (
              <div className="p-6 border-t border-border bg-muted/10 space-y-4">
                {[
                  { key: 'requireApprovalForProjects', label: 'Require Approval for Projects', desc: 'Projects must be approved before starting' },
                  { key: 'allowGuestAccess', label: 'Allow Guest Access', desc: 'External users can view shared content' },
                ].map(pref => (
                  <div key={pref.key} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30">
                    <div><p className="text-sm font-medium text-foreground">{pref.label}</p><p className="text-xs text-muted-foreground">{pref.desc}</p></div>
                    <Switch checked={settings.permissions[pref.key as keyof typeof settings.permissions]} onCheckedChange={(checked) => setSettings(prev => ({ ...prev, permissions: { ...prev.permissions, [pref.key]: checked } }))} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
