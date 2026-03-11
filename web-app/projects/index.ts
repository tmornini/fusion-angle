import { $, $$, populateIcons, initToggleGroup } from '../app/dom';
import { html, setHtml, SafeHtml } from '../app/safe-html';
import { buildSkeleton, withLoadingState } from '../app/loading-states';
import {
  iconTrendingUp, iconClock, iconDollarSign, iconCheckCircle2,
  iconAlertCircle, iconXCircle, iconLayoutGrid, iconBarChart,
  iconEye, iconTarget, iconGripVertical, iconFolderKanban,
} from '../app/icons';
import { navigateTo } from '../app/core';
import { getProjects, type Project } from '../app/adapters';
import { projectStatusConfig, UNKNOWN_STATUS } from '../app/config';

const projectStatusIcons: Record<string, (size?: number, cssClass?: string) => SafeHtml> = {
  approved: iconCheckCircle2,
  under_review: iconAlertCircle,
  sent_back: iconXCircle,
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
  const statusCfg = projectStatusConfig[project.status] ?? UNKNOWN_STATUS;
  const statusIcon = projectStatusIcons[project.status] ?? iconAlertCircle;
  return html`
    <div class="card card-hover" style="padding:1.25rem" data-project-card="${project.id}">
      <div class="flex items-start gap-4">
        <div class="hidden-mobile text-muted" style="margin-top:0.25rem;cursor:grab">${iconGripVertical(20)}</div>
        <div style="flex:1;min-width:0">
          <div class="flex items-start justify-between gap-4 mb-3">
            <div style="flex:1;min-width:0">
              <div class="flex flex-wrap items-center gap-2 mb-1">
                <h3 class="font-display font-semibold" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${project.title}</h3>
                <span class="badge ${statusCfg.className} text-xs">${statusIcon(14)} ${statusCfg.label}</span>
              </div>
              ${view === 'priority' ? html`<span class="text-xs text-muted">Priority #${project.priority}</span>` : html``}
            </div>
            ${buildProgressRing(project.progress)}
          </div>
          <div class="flex items-end justify-between gap-4">
            <div class="project-metrics-grid" style="flex:1">
              <div class="flex items-center gap-2">
                <div style="width:2rem;height:2rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center">${iconClock(16, 'text-primary')}</div>
                <div><p class="text-xs text-muted">Time</p><p class="text-sm font-medium">${project.estimatedDuration ? html`${project.actualDuration}d <span class="text-xs text-muted">/ ${project.estimatedDuration}d</span>` : html`—`}</p></div>
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
  const listContainer = $('#projects-list');
  if (!listContainer) return;

  const result = await withLoadingState(listContainer, buildSkeleton('card-list', { count: 4 }), getProjects, init, {
    icon: iconFolderKanban(24),
    title: 'No Projects Yet',
    description: 'Convert approved ideas into projects to start tracking progress.',
    action: { label: 'View Ideas', href: '../ideas/index.html' },
  });
  if (!result) return;
  const projects = result;

  let currentView: 'priority' | 'performance' = 'priority';

  populateIcons([
    ['#priority-view-icon', iconLayoutGrid(16)],
    ['#performance-view-icon', iconBarChart(16)],
  ]);

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
    $$('[data-project-card]').forEach(projectCard => {
      projectCard.style.cursor = 'pointer';
      projectCard.addEventListener('click', () => navigateTo('project-detail', { projectId: projectCard.getAttribute('data-project-card') ?? '' }));
    });
    $$('[data-view-project]').forEach(viewButton => {
      viewButton.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateTo('project-detail', { projectId: viewButton.getAttribute('data-view-project') ?? '' });
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

  initToggleGroup('.view-toggle-btn', 'data-view', (view) => {
    currentView = view as 'priority' | 'performance';
    mutateList();
  });

  mutateList();
}
