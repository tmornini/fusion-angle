import {
  $, showToast, escapeHtml, initials, openDialog, closeDialog,
  iconUsers, iconUserPlus, iconSearch, iconMoreHorizontal,
  iconCrown, iconUserCheck, iconUser, iconEye, iconMail,
  iconUserX, iconCheckCircle2, iconClock, iconChevronRight, iconSend,
  renderSkeleton, renderError, renderEmpty,
} from '../../site/script';
import { getUsers, type UserData } from '../../site/data';

const roleLabels: Record<string, { label: string; icon: (s?: number) => string }> = {
  admin: { label: 'Admin', icon: iconCrown },
  manager: { label: 'Manager', icon: iconUserCheck },
  member: { label: 'Member', icon: iconUser },
  viewer: { label: 'Viewer', icon: iconEye },
};

function statusBadge(status: string): string {
  if (status === 'active') return `<span class="status-badge-success">${iconCheckCircle2(14)} Active</span>`;
  if (status === 'pending') return `<span class="status-badge-warning">${iconClock(14)} Pending</span>`;
  return `<span class="status-badge-error">${iconUserX(14)} Deactivated</span>`;
}

function roleBadge(role: string): string {
  const r = roleLabels[role];
  if (!r) return `<span class="badge badge-secondary">${role}</span>`;
  return `<span class="badge badge-secondary">${r.icon(12)} ${r.label}</span>`;
}

function userRow(u: UserData): string {
  return `
    <div class="flex items-center gap-4 p-4 ${u.status === 'deactivated' ? 'opacity-50' : ''}" style="border-bottom:1px solid hsl(var(--border))">
      <div style="flex:2;display:flex;align-items:center;gap:0.75rem;min-width:0">
        <div style="width:2.5rem;height:2.5rem;border-radius:9999px;background:linear-gradient(135deg,hsl(var(--primary)/0.2),hsl(var(--primary)/0.05));display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <span class="text-sm font-bold text-primary">${initials(u.name)}</span>
        </div>
        <div style="min-width:0">
          <p class="font-medium truncate">${escapeHtml(u.name)}</p>
          <p class="text-xs text-muted truncate">${escapeHtml(u.email)}</p>
        </div>
      </div>
      <div style="flex:1">${roleBadge(u.role)}</div>
      <div style="flex:1" class="text-sm text-muted">${u.department}</div>
      <div style="flex:1">
        ${statusBadge(u.status)}
        <p class="text-xs text-muted mt-1">${u.status === 'pending' ? 'Invite sent' : 'Last active ' + u.lastActive}</p>
      </div>
      <div style="flex:0 0 auto">
        <button class="btn btn-ghost btn-icon btn-sm">${iconMoreHorizontal(16)}</button>
      </div>
    </div>`;
}

export async function init(): Promise<void> {
  const container = $('#manage-users-content');
  if (!container) return;

  container.innerHTML = renderSkeleton('table', { count: 5 });

  let users: UserData[];
  try {
    users = await getUsers();
  } catch {
    container.innerHTML = renderError('Failed to load users.');
    container.querySelector('[data-retry-btn]')?.addEventListener('click', () => init());
    return;
  }

  if (users.length === 0) {
    container.innerHTML = renderEmpty(iconUsers(24), 'No Users Yet', 'Invite users to your organization to start collaborating.');
    return;
  }

  const activeCount = users.filter(u => u.status === 'active').length;
  const pendingCount = users.filter(u => u.status === 'pending').length;

  container.innerHTML = `
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
          <input class="input search-input" placeholder="Search by name or email..." id="user-search" />
        </div>
        <select class="input" style="width:10rem" id="role-filter">
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
        <select class="input" style="width:10rem" id="status-filter">
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
        <div id="user-list">${users.map(userRow).join('')}</div>
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
          <div><label class="label mb-2 block">Department</label><select class="input" id="invite-dept"><option value="Engineering">Engineering</option><option value="Product">Product</option><option value="Design">Design</option><option value="Sales">Sales</option><option value="Operations">Operations</option></select></div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-outline" id="invite-cancel">Cancel</button>
          <button class="btn btn-primary gap-2" id="invite-submit">${iconSend(16)} Send Invite</button>
        </div>
      </div>
    </div>`;

  // Invite modal
  const openInvite = () => openDialog('invite');
  const closeInvite = () => closeDialog('invite');
  $('#invite-btn')?.addEventListener('click', openInvite);
  $('#invite-cancel')?.addEventListener('click', closeInvite);
  $('#invite-backdrop')?.addEventListener('click', closeInvite);
  $('#invite-submit')?.addEventListener('click', () => {
    const email = ($('#invite-email') as HTMLInputElement)?.value;
    if (!email) { showToast('Please enter an email address', 'error'); return; }
    showToast(`Invitation sent to ${email}`, 'success');
    closeInvite();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeInvite(); });
}
