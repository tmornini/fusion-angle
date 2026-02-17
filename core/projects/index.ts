import {
  $, escapeHtml, navigateTo,
  renderSkeleton, renderError, renderEmpty,
  iconTrendingUp, iconClock, iconDollarSign, iconCheckCircle2,
  iconAlertCircle, iconXCircle, iconLayoutGrid, iconBarChart,
  iconEye, iconTarget, iconGripVertical, iconFolderKanban,
} from '../../site/script';
import { getProjects, type Project } from '../../site/data';

const statusConfig: Record<string, { icon: (s?: number, c?: string) => string; cls: string; label: string }> = {
  approved: { icon: iconCheckCircle2, cls: 'badge-success', label: 'Approved' },
  under_review: { icon: iconAlertCircle, cls: 'badge-warning', label: 'Under Review' },
  sent_back: { icon: iconXCircle, cls: 'badge-error', label: 'Sent Back' },
};

function progressRing(pct: number): string {
  const r = 20, c = 24, circ = 2 * Math.PI * r;
  return `
    <div style="position:relative;width:3rem;height:3rem">
      <svg width="48" height="48" style="transform:rotate(-90deg)">
        <circle cx="${c}" cy="${c}" r="${r}" stroke="hsl(var(--muted))" stroke-width="4" fill="none"/>
        <circle cx="${c}" cy="${c}" r="${r}" stroke="hsl(var(--primary))" stroke-width="4" fill="none" stroke-dasharray="${pct * circ / 100} ${circ}"/>
      </svg>
      <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:0.625rem;font-weight:700">${pct}%</span>
    </div>`;
}

function renderProjectCard(p: Project, view: string): string {
  const sc = statusConfig[p.status];
  return `
    <div class="card card-hover" style="padding:1.25rem" data-project-card="${p.id}">
      <div class="flex items-start gap-4">
        <div class="hidden-mobile text-muted" style="margin-top:0.25rem;cursor:grab">${iconGripVertical(20)}</div>
        <div style="flex:1;min-width:0">
          <div class="flex items-start justify-between gap-4 mb-3">
            <div style="flex:1;min-width:0">
              <div class="flex flex-wrap items-center gap-2 mb-1">
                <h3 class="font-display font-semibold" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.title)}</h3>
                <span class="badge ${sc!.cls} text-xs">${sc!.icon(14)} ${sc!.label}</span>
              </div>
              ${view === 'priority' ? `<span class="text-xs text-muted">Priority #${p.priority}</span>` : ''}
            </div>
            ${progressRing(p.progress)}
          </div>
          <div class="flex items-end justify-between gap-4">
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;flex:1" class="project-metrics-grid">
              <div class="flex items-center gap-2">
                <div style="width:2rem;height:2rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center">${iconTarget(16, 'text-primary')}</div>
                <div><p class="text-xs text-muted">Score</p><p class="text-sm font-medium">${p.priorityScore}</p></div>
              </div>
              <div class="flex items-center gap-2">
                <div style="width:2rem;height:2rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center">${iconTrendingUp(16, 'text-primary')}</div>
                <div><p class="text-xs text-muted">Impact</p><p class="text-sm font-medium">${p.actualImpact || p.estimatedImpact}</p></div>
              </div>
              <div class="flex items-center gap-2">
                <div style="width:2rem;height:2rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center">${iconClock(16, 'text-primary')}</div>
                <div><p class="text-xs text-muted">Time</p><p class="text-sm font-medium">${p.actualTime}h <span class="text-xs text-muted">/ ${p.estimatedTime}h</span></p></div>
              </div>
              <div class="flex items-center gap-2">
                <div style="width:2rem;height:2rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center">${iconDollarSign(16, 'text-primary')}</div>
                <div><p class="text-xs text-muted">Cost</p><p class="text-sm font-medium">$${(p.actualCost / 1000).toFixed(0)}k</p></div>
              </div>
            </div>
            <button class="btn btn-outline btn-sm gap-2" data-view-project="${p.id}">${iconEye(16)} <span class="hidden-mobile">View Details</span></button>
          </div>
        </div>
      </div>
    </div>`;
}

export async function init(): Promise<void> {
  // Show skeleton immediately
  const listContainer = $('#projects-list');
  if (listContainer) listContainer.innerHTML = renderSkeleton('card-list', { count: 4 });

  // Fetch data with error handling
  let projects: Project[];
  try {
    projects = await getProjects();
  } catch (e) {
    if (listContainer) {
      const msg = e instanceof Error ? e.message : 'Failed to load projects. Please try again.';
      listContainer.innerHTML = renderError(msg);
      listContainer.querySelector('[data-retry-btn]')?.addEventListener('click', init);
    }
    return;
  }

  // Empty state
  if (projects.length === 0) {
    if (listContainer) {
      listContainer.innerHTML = renderEmpty(
        iconFolderKanban(24),
        'No Projects Yet',
        'Convert approved ideas into projects to start tracking progress.',
        { label: 'View Ideas', href: '../ideas/index.html' },
      );
    }
    return;
  }

  let currentView: 'priority' | 'performance' = 'priority';

  // Populate icons
  const iconLGEl = $('#icon-layout-grid');
  if (iconLGEl) iconLGEl.innerHTML = iconLayoutGrid(16);
  const iconBCEl = $('#icon-bar-chart');
  if (iconBCEl) iconBCEl.innerHTML = iconBarChart(16);

  // Status badges
  const counts = {
    approved: projects.filter(p => p.status === 'approved').length,
    under_review: projects.filter(p => p.status === 'under_review').length,
    sent_back: projects.filter(p => p.status === 'sent_back').length,
  };
  const badgesEl = $('#status-badges');
  if (badgesEl) {
    badgesEl.innerHTML = `
      <span class="badge badge-success text-xs">${iconCheckCircle2(14)} ${counts.approved}</span>
      <span class="badge badge-warning text-xs">${iconAlertCircle(14)} ${counts.under_review}</span>
      <span class="badge badge-error text-xs">${iconXCircle(14)} ${counts.sent_back}</span>`;
  }

  function sortedProjects(): Project[] {
    return [...projects].sort((a, b) =>
      currentView === 'priority' ? a.priority - b.priority : b.priorityScore - a.priorityScore
    );
  }

  function bindCards(): void {
    document.querySelectorAll<HTMLElement>('[data-project-card]').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => navigateTo('project-detail', { projectId: el.getAttribute('data-project-card')! }));
    });
    document.querySelectorAll<HTMLElement>('[data-view-project]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateTo('project-detail', { projectId: el.getAttribute('data-view-project')! });
      });
    });
  }

  function rerenderList(): void {
    const container = $('#projects-list');
    if (container) container.innerHTML = sortedProjects().map(p => renderProjectCard(p, currentView)).join('');
    const info = $('#projects-info');
    if (info) info.textContent = `${projects.length} projects • ${currentView === 'priority' ? 'by priority' : 'by score'}`;
    bindCards();
  }

  document.querySelectorAll<HTMLElement>('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentView = btn.getAttribute('data-view') as 'priority' | 'performance';
      document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      rerenderList();
    });
  });

  rerenderList();
}
