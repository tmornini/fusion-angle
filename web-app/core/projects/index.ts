import {
  $, navigateTo, html, setHtml, SafeHtml,
  buildSkeleton, buildErrorState, buildEmptyState,
  iconTrendingUp, iconClock, iconDollarSign, iconCheckCircle2,
  iconAlertCircle, iconXCircle, iconLayoutGrid, iconBarChart,
  iconEye, iconTarget, iconGripVertical, iconFolderKanban,
} from '../../site/script';
import { getProjects, type Project } from '../../site/data';

const projectStatusConfig: Record<string, { icon: (size?: number, cssClass?: string) => SafeHtml; className: string; label: string }> = {
  approved: { icon: iconCheckCircle2, className: 'badge-success', label: 'Approved' },
  under_review: { icon: iconAlertCircle, className: 'badge-warning', label: 'Under Review' },
  sent_back: { icon: iconXCircle, className: 'badge-error', label: 'Sent Back' },
};

function buildProgressRing(percent: number): SafeHtml {
  const radius = 20, center = 24, circumference = 2 * Math.PI * radius;
  return html`
    <div style="position:relative;width:3rem;height:3rem">
      <svg width="48" height="48" style="transform:rotate(-90deg)">
        <circle cx="${center}" cy="${center}" r="${radius}" stroke="hsl(var(--muted))" stroke-width="4" fill="none"/>
        <circle cx="${center}" cy="${center}" r="${radius}" stroke="hsl(var(--primary))" stroke-width="4" fill="none" stroke-dasharray="${percent * circumference / 100} ${circumference}"/>
      </svg>
      <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:0.625rem;font-weight:700">${percent}%</span>
    </div>`;
}

function buildProjectCard(project: Project, view: string): SafeHtml {
  const statusDisplay = projectStatusConfig[project.status];
  return html`
    <div class="card card-hover" style="padding:1.25rem" data-project-card="${project.id}">
      <div class="flex items-start gap-4">
        <div class="hidden-mobile text-muted" style="margin-top:0.25rem;cursor:grab">${iconGripVertical(20)}</div>
        <div style="flex:1;min-width:0">
          <div class="flex items-start justify-between gap-4 mb-3">
            <div style="flex:1;min-width:0">
              <div class="flex flex-wrap items-center gap-2 mb-1">
                <h3 class="font-display font-semibold" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${project.title}</h3>
                <span class="badge ${statusDisplay!.className} text-xs">${statusDisplay!.icon(14)} ${statusDisplay!.label}</span>
              </div>
              ${view === 'priority' ? html`<span class="text-xs text-muted">Priority #${project.priority}</span>` : html``}
            </div>
            ${buildProgressRing(project.progress)}
          </div>
          <div class="flex items-end justify-between gap-4">
            <div class="project-metrics-grid" style="flex:1">
              <div class="flex items-center gap-2">
                <div style="width:2rem;height:2rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center">${iconClock(16, 'text-primary')}</div>
                <div><p class="text-xs text-muted">Time</p><p class="text-sm font-medium">${project.estimatedTime ? html`${project.actualTime}h <span class="text-xs text-muted">/ ${project.estimatedTime}h</span>` : html`—`}</p></div>
              </div>
              <div class="flex items-center gap-2">
                <div style="width:2rem;height:2rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center">${iconDollarSign(16, 'text-primary')}</div>
                <div><p class="text-xs text-muted">Cost</p><p class="text-sm font-medium">${project.actualCost ? `$${(project.actualCost / 1000).toFixed(0)}k` : '—'}</p></div>
              </div>
              <div class="flex items-center gap-2">
                <div style="width:2rem;height:2rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center">${iconTrendingUp(16, 'text-primary')}</div>
                <div><p class="text-xs text-muted">Impact</p><p class="text-sm font-medium">${project.actualImpact || project.estimatedImpact || '—'}</p></div>
              </div>
              <div class="flex items-center gap-2">
                <div style="width:2rem;height:2rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center">${iconTarget(16, 'text-primary')}</div>
                <div><p class="text-xs text-muted">Score</p><p class="text-sm font-medium">${project.priorityScore}</p></div>
              </div>
            </div>
            <button class="btn btn-outline btn-sm gap-2" data-view-project="${project.id}">${iconEye(16)} <span class="hidden-mobile">View Details</span></button>
          </div>
        </div>
      </div>
    </div>`;
}

export async function init(): Promise<void> {
  // Show skeleton immediately
  const listContainer = $('#projects-list');
  if (listContainer) setHtml(listContainer, buildSkeleton('card-list', { count: 4 }));

  // Fetch data with error handling
  let projects: Project[];
  try {
    projects = await getProjects();
  } catch (e) {
    if (listContainer) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to load projects. Please try again.';
      setHtml(listContainer, buildErrorState(errorMessage));
      listContainer.querySelector('[data-retry-btn]')?.addEventListener('click', init);
    }
    return;
  }

  // Empty state
  if (projects.length === 0) {
    if (listContainer) {
      setHtml(listContainer, buildEmptyState(
        iconFolderKanban(24),
        'No Projects Yet',
        'Convert approved ideas into projects to start tracking progress.',
        { label: 'View Ideas', href: '../ideas/index.html' },
      ));
    }
    return;
  }

  let currentView: 'priority' | 'performance' = 'priority';

  // Populate icons
  const priorityViewIconEl = $('#priority-view-icon');
  if (priorityViewIconEl) setHtml(priorityViewIconEl, iconLayoutGrid(16));
  const performanceViewIconEl = $('#performance-view-icon');
  if (performanceViewIconEl) setHtml(performanceViewIconEl, iconBarChart(16));

  // Status badges
  const counts = {
    approved: projects.filter(project => project.status === 'approved').length,
    under_review: projects.filter(project => project.status === 'under_review').length,
    sent_back: projects.filter(project => project.status === 'sent_back').length,
  };
  const badgesEl = $('#status-badges');
  if (badgesEl) {
    setHtml(badgesEl, html`
      <span class="badge badge-success text-xs">${iconCheckCircle2(14)} ${counts.approved}</span>
      <span class="badge badge-warning text-xs">${iconAlertCircle(14)} ${counts.under_review}</span>
      <span class="badge badge-error text-xs">${iconXCircle(14)} ${counts.sent_back}</span>`);
  }

  function bindCards(): void {
    document.querySelectorAll<HTMLElement>('[data-project-card]').forEach(projectCard => {
      projectCard.style.cursor = 'pointer';
      projectCard.addEventListener('click', () => navigateTo('project-detail', { projectId: projectCard.getAttribute('data-project-card')! }));
    });
    document.querySelectorAll<HTMLElement>('[data-view-project]').forEach(viewButton => {
      viewButton.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateTo('project-detail', { projectId: viewButton.getAttribute('data-view-project')! });
      });
    });
  }

  function mutateList(): void {
    const container = $('#projects-list');
    const sorted = [...projects].sort((a, b) =>
      currentView === 'priority' ? a.priority - b.priority : b.priorityScore - a.priorityScore
    );
    if (container) setHtml(container, html`${sorted.map(project => buildProjectCard(project, currentView))}`);
    const info = $('#projects-info');
    if (info) info.textContent = `${projects.length} ${projects.length === 1 ? 'project' : 'projects'} • ${currentView === 'priority' ? 'by priority' : 'by score'}`;
    bindCards();
  }

  document.querySelectorAll<HTMLElement>('.view-toggle-btn').forEach(viewToggleButton => {
    viewToggleButton.addEventListener('click', () => {
      currentView = viewToggleButton.getAttribute('data-view') as 'priority' | 'performance';
      document.querySelectorAll('.view-toggle-btn').forEach(button => button.classList.remove('active'));
      viewToggleButton.classList.add('active');
      mutateList();
    });
  });

  mutateList();
}
