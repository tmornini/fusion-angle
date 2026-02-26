import {
  $, showToast, initials, initTabs,
  iconUsers, iconSearch, iconStar, iconTrendingUp, iconAward, iconBriefcase,
  iconChevronRight, iconPlus, iconBarChart, iconCheckCircle2, iconAlertCircle,
  iconZap, iconBrain, iconTarget, iconHeart, iconX,
  buildSkeleton, buildErrorState, buildEmptyState,
  html, setHtml, SafeHtml, trusted,
} from '../../site/script';
import { getTeamMembers, type TeamMember } from '../../site/data';

function styleForAvailability(availability: number): string {
  if (availability >= 70) return 'color:hsl(var(--success));background:hsl(var(--success) / 0.1);border:1px solid hsl(var(--success) / 0.2)';
  if (availability >= 40) return 'color:hsl(var(--warning));background:hsl(var(--warning)/0.1);border:1px solid hsl(var(--warning)/0.2)';
  return 'color:hsl(var(--error));background:hsl(var(--error)/0.1);border:1px solid hsl(var(--error)/0.2)';
}

function buildStatusDot(status: string): SafeHtml {
  const colors: Record<string, string> = { available: 'hsl(var(--success))', busy: 'hsl(var(--warning))', limited: 'hsl(var(--error))' };
  return html`<div style="position:absolute;bottom:-2px;right:-2px;width:1rem;height:1rem;border-radius:9999px;border:2px solid hsl(var(--background));background:${colors[status] || 'hsl(var(--muted))'}"></div>`;
}

const dimensionIconConfig: Record<string, (size?: number, cssClass?: string) => SafeHtml> = {
  driver: iconTarget, analytical: iconBrain, expressive: iconZap, amiable: iconHeart,
};

let members: TeamMember[] = [];
let selectedMemberId: string | null = null;

function buildMemberDetail(member: TeamMember): SafeHtml {
  return html`
    <div style="padding:1.5rem">
      <div style="text-align:center;margin-bottom:1.5rem">
        <div style="width:5rem;height:5rem;border-radius:1rem;background:linear-gradient(135deg,hsl(var(--primary)/0.2),hsl(var(--primary)/0.05));display:flex;align-items:center;justify-content:center;margin:0 auto 1rem">
          <span class="text-2xl font-bold text-primary">${initials(member.name)}</span>
        </div>
        <h3 class="text-lg font-display font-semibold">${member.name}</h3>
        <p class="text-sm text-muted">${member.role}</p>
        <p class="text-xs text-muted">${member.email}</p>
      </div>

      <div class="tabs" role="tablist" style="margin-bottom:1rem">
        <button class="tab active" role="tab" data-detail-tab="dimensions">Dimensions</button>
        <button class="tab" role="tab" data-detail-tab="performance">Performance</button>
      </div>

      <div id="detail-dimensions" class="detail-tab-panel">
        <p class="text-xs text-muted" style="text-align:center;margin-bottom:1rem">Team Dimensions Assessment Results</p>
        ${Object.entries(member.teamDimensions).map(([key, value]) => html`
          <div style="margin-bottom:1rem">
            <div class="flex items-center justify-between" style="margin-bottom:0.5rem">
              <div class="flex items-center gap-2">${(dimensionIconConfig[key] || iconStar)(16, 'text-primary')} <span class="text-sm font-medium" style="text-transform:capitalize">${key}</span></div>
              <span class="text-sm font-bold text-primary">${value}%</span>
            </div>
            <div class="progress" style="height:0.5rem"><div class="progress-fill" style="width:${value}%"></div></div>
          </div>
        `)}
      </div>

      <div id="detail-performance" class="detail-tab-panel" style="display:none">
        <div style="padding:1rem;border-radius:0.75rem;background:linear-gradient(135deg,hsl(var(--primary)/0.1),hsl(var(--primary)/0.05));text-align:center;margin-bottom:1rem">
          ${iconBarChart(32, 'text-primary')}
          <div class="text-3xl font-bold text-primary" style="margin:0.5rem 0">${member.performanceScore}%</div>
          <p class="text-xs text-muted">Overall Performance Score</p>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
          <div style="padding:0.75rem;border-radius:0.5rem;background:hsl(var(--muted)/0.3);text-align:center">
            ${iconCheckCircle2(20, 'text-success')}
            <div class="text-lg font-bold" style="margin:0.25rem 0">${member.projectsCompleted}</div>
            <p class="text-xs text-muted">Completed</p>
          </div>
          <div style="padding:0.75rem;border-radius:0.5rem;background:hsl(var(--muted)/0.3);text-align:center">
            ${iconAlertCircle(20, 'text-warning')}
            <div class="text-lg font-bold" style="margin:0.25rem 0">${member.currentProjects}</div>
            <p class="text-xs text-muted">Active</p>
          </div>
        </div>
      </div>
    </div>`;
}

function buildMemberCard(member: TeamMember): SafeHtml {
  return html`
    <div class="card card-hover" style="padding:1.25rem;cursor:pointer;${selectedMemberId === member.id ? 'box-shadow:0 0 0 2px hsl(var(--primary))' : ''}" data-member-card="${member.id}">
      <div class="flex items-start gap-4">
        <div style="position:relative;flex-shrink:0">
          <div style="width:3.5rem;height:3.5rem;border-radius:0.75rem;background:linear-gradient(135deg,hsl(var(--primary)/0.2),hsl(var(--primary)/0.05));display:flex;align-items:center;justify-content:center">
            <span class="text-lg font-bold text-primary">${initials(member.name)}</span>
          </div>
          ${buildStatusDot(member.status)}
        </div>
        <div style="flex:1;min-width:0">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <h3 class="font-semibold text-sm">${member.name}</h3>
            <span class="pill" style="${styleForAvailability(member.availability)}">${member.availability}%</span>
          </div>
          <p class="text-xs text-muted mb-2">${member.role} • ${member.department}</p>
          <div class="flex flex-wrap gap-1.5 mb-2">
            ${member.strengths.slice(0, 3).map(strength => html`
              <span class="pill-tag" style="background:hsl(var(--muted)/0.5);font-size:0.625rem">${iconStar(10)} ${strength}</span>
            `)}
          </div>
          <div class="flex items-center gap-4 text-xs text-muted">
            <span class="flex items-center gap-1">${iconTrendingUp(14, 'text-success')} ${member.performanceScore}%</span>
            <span class="flex items-center gap-1">${iconBriefcase(14)} ${member.currentProjects} active</span>
            <span class="flex items-center gap-1 hidden-mobile">${iconAward(14, 'text-primary')} ${member.projectsCompleted} completed</span>
          </div>
        </div>
        ${iconChevronRight(20, 'text-muted')}
      </div>
    </div>`;
}

function mutateList(): void {
  const search = (($('#team-search') as HTMLInputElement)?.value || '').toLowerCase();
  const filtered = members.filter(member =>
    member.name.toLowerCase().includes(search) || member.role.toLowerCase().includes(search) || member.department.toLowerCase().includes(search)
  );
  const list = $('#team-list');
  if (list) setHtml(list, html`${filtered.map(buildMemberCard)}`);

  const panel = $('#team-detail-panel');
  const member = selectedMemberId ? members.find(candidate => candidate.id === selectedMemberId) : null;
  if (panel) {
    setHtml(panel, member ? buildMemberDetail(member) : html`
      <div style="padding:1.5rem;text-align:center">
        ${iconUsers(48, 'text-muted')}
        <p class="text-muted" style="margin-top:1rem">Select a team member to view details</p>
      </div>`);
  }
  bindCards();
  bindDetailTabs();
}

function bindCards(): void {
  document.querySelectorAll<HTMLElement>('[data-member-card]').forEach(card => {
    card.addEventListener('click', () => {
      selectedMemberId = card.getAttribute('data-member-card');
      mutateList();
    });
  });
}

function bindDetailTabs(): void {
  initTabs('[data-detail-tab]', '.detail-tab-panel');
}

export async function init(): Promise<void> {
  const teamListEl = $('#team-list');
  if (teamListEl) setHtml(teamListEl, buildSkeleton('card-list', { count: 4 }));

  try {
    members = await getTeamMembers();
  } catch {
    if (teamListEl) {
      setHtml(teamListEl, buildErrorState('Failed to load team members.'));
      teamListEl.querySelector('[data-retry-btn]')?.addEventListener('click', () => init());
    }
    return;
  }

  if (members.length === 0) {
    if (teamListEl) setHtml(teamListEl, buildEmptyState(iconUsers(24), 'No Team Members', 'Invite team members to start collaborating on projects.'));
    return;
  }

  // Populate icons
  const addMemberBtnIconEl = $('#add-member-btn-icon');
  if (addMemberBtnIconEl) setHtml(addMemberBtnIconEl, iconPlus(16));
  const searchFieldIconEl = $('#search-field-icon');
  if (searchFieldIconEl) setHtml(searchFieldIconEl, iconSearch(16));

  // Summary
  const summaryEl = $('#team-summary');
  if (summaryEl) summaryEl.textContent = `${members.length} ${members.length === 1 ? 'member' : 'members'} • Manage roles, strengths, and availability`;

  // Detail placeholder
  const placeholderEl = $('#team-detail-placeholder');
  if (placeholderEl) {
    setHtml(placeholderEl, html`
      ${iconUsers(48, 'text-muted')}
      <p class="text-muted" style="margin-top:1rem">Select a team member to view details</p>`);
  }

  // Search
  $('#team-search')?.addEventListener('input', mutateList);

  // Add member dialog
  const dialog = $('#add-member-dialog')!;
  $('#team-add-btn')?.addEventListener('click', () => { dialog.style.display = ''; });
  $('#add-member-cancel')?.addEventListener('click', () => { dialog.style.display = 'none'; });
  dialog?.addEventListener('click', (e) => { if (e.target === dialog) dialog.style.display = 'none'; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dialog.style.display !== 'none') dialog.style.display = 'none'; });
  $('#add-member-send')?.addEventListener('click', () => {
    const email = ($('#add-member-email') as HTMLInputElement)?.value;
    showToast(email ? `Invitation sent to ${email}` : 'Member invited', 'success');
    dialog.style.display = 'none';
  });

  mutateList();
}
