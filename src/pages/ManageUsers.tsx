import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Users,
  UserPlus,
  Search,
  MoreHorizontal,
  Mail,
  Crown,
  UserCheck,
  Eye,
  UserX,
  CheckCircle2,
  Clock,
  XCircle,
  User,
  Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from 'sonner';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'member' | 'viewer';
  status: 'active' | 'pending' | 'deactivated';
  department: string;
  lastActive: string;
  joinedAt: string;
}

const mockUsers: UserData[] = [
  { id: '1', name: 'Sarah Chen', email: 'sarah.chen@company.com', role: 'admin', status: 'active', department: 'Operations', lastActive: '2 hours ago', joinedAt: '2023-06-15' },
  { id: '2', name: 'Mike Thompson', email: 'mike.thompson@company.com', role: 'manager', status: 'active', department: 'Engineering', lastActive: '1 day ago', joinedAt: '2023-08-22' },
  { id: '3', name: 'Jessica Park', email: 'jessica.park@company.com', role: 'member', status: 'active', department: 'Analytics', lastActive: '3 hours ago', joinedAt: '2023-09-10' },
  { id: '4', name: 'David Martinez', email: 'david.martinez@company.com', role: 'member', status: 'pending', department: 'Engineering', lastActive: 'Never', joinedAt: '2024-02-01' },
  { id: '5', name: 'Emily Rodriguez', email: 'emily.rodriguez@company.com', role: 'viewer', status: 'active', department: 'Design', lastActive: '5 days ago', joinedAt: '2023-11-20' },
  { id: '6', name: 'Alex Kim', email: 'alex.kim@company.com', role: 'manager', status: 'deactivated', department: 'Product', lastActive: '30 days ago', joinedAt: '2023-05-01' },
];

const roleInfo = {
  admin: { label: 'Admin', icon: Crown, color: 'bg-purple-100 text-purple-700 border-purple-200' },
  manager: { label: 'Manager', icon: UserCheck, color: 'bg-primary/10 text-primary border-primary/20' },
  member: { label: 'Member', icon: User, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  viewer: { label: 'Viewer', icon: Eye, color: 'bg-muted text-muted-foreground border-border' },
};

const statusInfo = {
  active: { label: 'Active', icon: CheckCircle2, color: 'text-emerald-600' },
  pending: { label: 'Pending', icon: Clock, color: 'text-amber-600' },
  deactivated: { label: 'Deactivated', icon: XCircle, color: 'text-muted-foreground' },
};

export default function ManageUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserData[]>(mockUsers);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteData, setInviteData] = useState<{ email: string; role: UserData['role']; department: string }>({ email: '', role: 'member', department: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const handleInvite = () => {
    if (!inviteData.email) {
      toast.error('Please enter an email address');
      return;
    }
    
    setIsSubmitting(true);
    setTimeout(() => {
      const newUser: UserData = {
        id: Date.now().toString(),
        name: inviteData.email.split('@')[0],
        email: inviteData.email,
        role: inviteData.role,
        status: 'pending',
        department: inviteData.department || 'Unassigned',
        lastActive: 'Never',
        joinedAt: new Date().toISOString().split('T')[0],
      };
      setUsers(prev => [...prev, newUser]);
      setIsInviteOpen(false);
      setInviteData({ email: '', role: 'member', department: '' });
      setIsSubmitting(false);
      toast.success(`Invitation sent to ${inviteData.email}`);
    }, 1500);
  };

  const handleChangeRole = (userId: string, newRole: UserData['role']) => {
    setUsers(prev => prev.map(user => 
      user.id === userId ? { ...user, role: newRole } : user
    ));
    toast.success('Role updated successfully');
  };

  const handleToggleStatus = (userId: string) => {
    setUsers(prev => prev.map(user => {
      if (user.id !== userId) return user;
      const newStatus = user.status === 'active' ? 'deactivated' : 'active';
      return { ...user, status: newStatus };
    }));
    toast.success('User status updated');
  };

  const handleResendInvite = (email: string) => {
    toast.success(`Invitation resent to ${email}`);
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <Breadcrumbs items={[
          { label: 'Account', href: '/account' },
          { label: 'Manage Users' }
        ]} />

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground mb-2">Manage Users</h1>
            <p className="text-muted-foreground">
              {users.filter(u => u.status === 'active').length} active users • {users.filter(u => u.status === 'pending').length} pending invitations
            </p>
          </div>
          <Button onClick={() => setIsInviteOpen(true)} className="gap-2">
            <UserPlus className="w-4 h-4" />
            Invite User
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="deactivated">Deactivated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Users List */}
        <div className="fusion-card overflow-hidden">
          <div className="grid grid-cols-12 gap-4 p-4 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <div className="col-span-4">User</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-2">Department</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          <div className="divide-y divide-border">
            {filteredUsers.map((user) => {
              const role = roleInfo[user.role];
              const status = statusInfo[user.status];
              const RoleIcon = role.icon;
              const StatusIcon = status.icon;

              return (
                <div key={user.id} className={`grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/20 transition-colors ${
                  user.status === 'deactivated' ? 'opacity-60' : ''
                }`}>
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </div>

                  <div className="col-span-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border ${role.color}`}>
                      <RoleIcon className="w-3 h-3" />
                      {role.label}
                    </span>
                  </div>

                  <div className="col-span-2">
                    <span className="text-sm text-muted-foreground">{user.department}</span>
                  </div>

                  <div className="col-span-2">
                    <div className={`flex items-center gap-1.5 text-sm ${status.color}`}>
                      <StatusIcon className="w-4 h-4" />
                      <span>{status.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {user.status === 'pending' ? 'Invite sent' : `Last active ${user.lastActive}`}
                    </p>
                  </div>

                  <div className="col-span-2 flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => handleChangeRole(user.id, 'admin')}>
                          <Crown className="w-4 h-4 mr-2" />
                          Make Admin
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleChangeRole(user.id, 'manager')}>
                          <UserCheck className="w-4 h-4 mr-2" />
                          Make Manager
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleChangeRole(user.id, 'member')}>
                          <User className="w-4 h-4 mr-2" />
                          Make Member
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleChangeRole(user.id, 'viewer')}>
                          <Eye className="w-4 h-4 mr-2" />
                          Make Viewer
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {user.status === 'pending' && (
                          <DropdownMenuItem onClick={() => handleResendInvite(user.email)}>
                            <Mail className="w-4 h-4 mr-2" />
                            Resend Invite
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleToggleStatus(user.id)}>
                          {user.status === 'active' ? (
                            <>
                              <UserX className="w-4 h-4 mr-2" />
                              Deactivate User
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              Reactivate User
                            </>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}

            {filteredUsers.length === 0 && (
              <div className="p-12 text-center">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No users found matching your filters.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invite User Modal */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Invite New User
            </DialogTitle>
            <DialogDescription>
              Send an invitation to join your organization.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Email Address</label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={inviteData.email}
                onChange={(e) => setInviteData(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Role</label>
              <Select
                value={inviteData.role}
                onValueChange={(value: UserData['role']) => setInviteData(prev => ({ ...prev, role: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Department</label>
              <Select
                value={inviteData.department}
                onValueChange={(value) => setInviteData(prev => ({ ...prev, department: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Engineering">Engineering</SelectItem>
                  <SelectItem value="Product">Product</SelectItem>
                  <SelectItem value="Design">Design</SelectItem>
                  <SelectItem value="Sales">Sales</SelectItem>
                  <SelectItem value="Operations">Operations</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={isSubmitting} className="gap-2">
              <Send className="w-4 h-4" />
              {isSubmitting ? 'Sending...' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
