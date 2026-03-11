import { $, $input } from '../app/dom';
import { html, setHtml, SafeHtml, trusted } from '../app/safe-html';
import { showToast } from '../app/toast';
import { buildSkeleton, withLoadingState } from '../app/loading-states';
import {
  iconUsers, iconUserPlus, iconSearch, iconMoreHorizontal,
  iconCrown, iconUserCheck, iconUser, iconEye, iconMail,
  iconUserX, iconCheckCircle2, iconClock, iconChevronRight, iconSend,
} from '../app/icons';
import { initials, openDialog, closeDialog } from '../app/core';
import { getManagedUsers, type ManagedUser } from '../app/adapters';

const roleLabels: Record<string, { label: string; icon: (size?: number) => SafeHtml }> = {
  admin: { label: 'Admin', icon: iconCrown },
  manager: { label: 'Manager', icon: iconUserCheck },
  member: { label: 'Member', icon: iconUser },
  viewer: { label: 'Viewer', icon: iconEye },
};

function buildStatusBadge(status: string): SafeHtml {
  if (status === 'active') return html`<span class="status-badge-success">${iconCheckCircle2(14)} Active</span>`;
  if (status === 'pending') return html`<span class="status-badge-warning">${iconClock(14)} Pending</span>`;
  return html`<span class="status-badge-error">${iconUserX(14)} Deactivated</span>`;
}

function buildRoleBadge(role: string): SafeHtml {
  const roleConfig = roleLabels[role];
  if (!roleConfig) return html`<span class="badge badge-secondary">${role}</span>`;
  return html`<span class="badge badge-secondary">${roleConfig.icon(12)} ${roleConfig.label}</span>`;
}

function buildUserRow(user: ManagedUser): SafeHtml {
  return html`
    <div class="flex items-center gap-4 p-4 ${user.status === 'deactivated' ? 'opacity-50' : ''}" style="border-bottom:1px solid hsl(var(--border))">
      <div style="flex:2;display:flex;align-items:center;gap:0.75rem;min-width:0">
        <div style="width:2.5rem;height:2.5rem;border-radius:9999px;background:linear-gradient(135deg,hsl(var(--primary)/0.2),hsl(var(--primary)/0.05));display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <span class="text-sm font-bold text-primary">${initials(user.name)}</span>
        </div>
        <div style="min-width:0">
          <p class="font-medium truncate">${user.name}</p>
          <p class="text-xs text-muted truncate">${user.email}</p>
        </div>
      </div>
      <div style="flex:1">${buildRoleBadge(user.role)}</div>
      <div style="flex:1" class="text-sm text-muted">${user.department}</div>
      <div style="flex:1">
        ${buildStatusBadge(user.status)}
        <p class="text-xs text-muted mt-1">${user.status === 'pending' ? 'Invite sent' : 'Last active ' + user.lastActive}</p>
      </div>
      <div style="flex:0 0 auto">
        <button class="btn btn-ghost btn-icon btn-sm">${iconMoreHorizontal(16)}</button>
      </div>
    </div>`;
}

export async function init(): Promise<void> {
  const container = $('#manage-users-content');
  if (!container) return;

  const users = await withLoadingState(container, buildSkeleton('table', { count: 5 }), getManagedUsers, init, {
    icon: iconUsers(24),
    title: 'No Users Yet',
    description: 'Invite users to your organization to start collaborating.',
  });
  if (!users) return;

  const activeCount = users.filter(user => user.status === 'active').length;
  const pendingCount = users.filter(user => user.status === 'pending').length;

  setHtml(container, html`
    <div style="max-width:72rem;margin:0 auto">
      <nav class="flex items-center gap-2 text-sm text-muted mb-6">
        <a href="../account/index.html" class="text-primary">Account</a>
        ${iconChevronRight(14)} <span>Manage Users</span>
      </nav>

      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-3xl font-display font-bold mb-2">Manage Users</h1>
          <p class="text-muted">${activeCount} active users, ${pendingCount} pending invitations</p>
        </div>
        <button class="btn btn-primary gap-2" id="invite-btn">${iconUserPlus(16)} Invite User</button>
      </div>

      <div class="flex items-center gap-4 mb-6">
        <div class="search-wrapper" style="flex:1;max-width:20rem">
          <span class="search-icon">${iconSearch(16)}</span>
          <input class="input search-input" placeholder="Search by name or email..." id="user-search" aria-label="Search by name or email" />
        </div>
        <select class="input" style="width:10rem" id="role-filter" aria-label="Filter by role">
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
        <select class="input" style="width:10rem" id="status-filter" aria-label="Filter by status">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="deactivated">Deactivated</option>
        </select>
      </div>

      <div class="card" style="overflow:hidden">
        <div class="flex items-center gap-4 p-4" style="background:hsl(var(--muted)/0.3);border-bottom:1px solid hsl(var(--border))">
          <div style="flex:2" class="text-xs font-medium text-muted">User</div>
          <div style="flex:1" class="text-xs font-medium text-muted">Role</div>
          <div style="flex:1" class="text-xs font-medium text-muted">Department</div>
          <div style="flex:1" class="text-xs font-medium text-muted">Status</div>
          <div style="flex:0 0 auto;width:2.5rem"></div>
        </div>
        <div id="user-list">${users.map(buildUserRow)}</div>
      </div>

      <div id="invite-backdrop" class="dialog-backdrop hidden"></div>
      <div id="invite-dialog" class="dialog hidden" role="dialog" aria-modal="true" style="max-width:28rem">
        <div class="dialog-header">
          <h3 class="dialog-title flex items-center gap-2">${iconUserPlus(20)} Invite New User</h3>
          <p class="dialog-description">Send an invitation to join your organization.</p>
        </div>
        <div class="flex flex-col gap-4 py-4">
          <div><label class="label mb-2 block">Email Address</label><input class="input" type="email" placeholder="colleague@company.com" id="invite-email" /></div>
          <div><label class="label mb-2 block">Role</label><select class="input" id="invite-role"><option value="member">Member</option><option value="admin">Admin</option><option value="manager">Manager</option><option value="viewer">Viewer</option></select></div>
          <div><label class="label mb-2 block">Department</label><select class="input" id="invite-department"><option value="Engineering">Engineering</option><option value="Product">Product</option><option value="Design">Design</option><option value="Sales">Sales</option><option value="Operations">Operations</option></select></div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-outline" id="invite-cancel">Cancel</button>
          <button class="btn btn-primary gap-2" id="invite-submit">${iconSend(16)} Send Invite</button>
        </div>
      </div>
    </div>`);

  // Invite modal
  const openInvite = () => openDialog('invite');
  const closeInvite = () => closeDialog('invite');
  $('#invite-btn')?.addEventListener('click', openInvite);
  $('#invite-cancel')?.addEventListener('click', closeInvite);
  $('#invite-backdrop')?.addEventListener('click', closeInvite);
  $('#invite-submit')?.addEventListener('click', () => {
    const email = $input('#invite-email')?.value;
    if (!email) { showToast('Please enter an email address', 'error'); return; }
    showToast(`Invitation sent to ${email}`, 'success');
    closeInvite();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeInvite(); });
}
