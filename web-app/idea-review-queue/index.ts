import { $, $input, $select, attr } from '../app/dom';
import { html, setHtml, SafeHtml } from '../app/safe-html';
import { buildSkeleton, withLoadingState } from '../app/loading-states';
import {
  iconArrowLeft, iconClock, iconTrendingUp, iconAlertCircle,
  iconCheckCircle2, iconMessageSquare, iconSearch,
  iconChevronRight, iconTarget, iconShield, iconClipboardCheck,
} from '../app/icons';
import { navigateTo, styleForScore } from '../app/core';
import { getReviewQueue, type ReviewIdea } from '../app/adapters';
import { edgeStatusConfig, UNKNOWN_STATUS, UNKNOWN_EDGE_STATUS } from '../app/config';

const priorityConfig: Record<string, { label: string; className: string }> = {
  high: { label: 'High Priority', className: 'badge-error' },
  medium: { label: 'Medium', className: 'badge-warning' },
  low: { label: 'Low', className: 'badge-default' },
};

const readinessConfig: Record<string, { label: string; icon: (size?: number) => SafeHtml; className: string }> = {
  ready: { label: 'Ready for Review', icon: iconCheckCircle2, className: 'text-success' },
  'needs-info': { label: 'Needs Info', icon: iconMessageSquare, className: 'text-warning' },
  incomplete: { label: 'Incomplete', icon: iconAlertCircle, className: 'text-error' },
};

function buildReviewCard(idea: ReviewIdea): SafeHtml {
  const readinessDisplay = readinessConfig[idea.readiness] ?? { label: 'Unknown', icon: iconAlertCircle, className: 'text-muted' };
  const priorityDisplay = priorityConfig[idea.priority] ?? UNKNOWN_STATUS;
  const edgeDisplay = edgeStatusConfig[idea.edgeStatus] ?? UNKNOWN_EDGE_STATUS;
  return html`
    <div class="card card-hover p-4" style="cursor:pointer" data-review-card="${idea.id}">
      <div class="flex items-start justify-between gap-4">
        <div style="flex:1;min-width:0">
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <span class="badge ${priorityDisplay.className} text-xs">${priorityDisplay.label}</span>
            <span class="flex items-center gap-1 text-sm ${readinessDisplay.className}">${readinessDisplay.icon(16)} ${readinessDisplay.label}</span>
            <span class="badge ${edgeDisplay.className} text-xs">${iconTarget(12)} ${edgeDisplay.label}</span>
          </div>
          <h3 class="font-semibold mb-1">${idea.title}</h3>
          <div class="flex items-center gap-4 text-sm text-muted">
            <span>by ${idea.submittedBy}</span>
            <span>•</span>
            <span>${idea.category}</span>
            <span>•</span>
            <span style="color:hsl(var(--warning))">${idea.waitingDays} days waiting</span>
          </div>
        </div>
        <div class="flex items-center gap-6">
          <div class="text-right hidden-mobile">
            <div class="flex items-center gap-4 text-sm">
              <div><p class="text-muted">Score</p><p class="font-semibold" style="${styleForScore(idea.score)}">${idea.score}</p></div>
              <div><p class="text-muted">Impact</p><p class="font-medium">${idea.impact}</p></div>
              <div><p class="text-muted">Effort</p><p class="font-medium">${idea.effort}</p></div>
            </div>
          </div>
          ${iconChevronRight(20, 'text-muted')}
        </div>
      </div>
    </div>`;
}

let allIdeas: ReviewIdea[] = [];

export async function init(): Promise<void> {
  const root = $('#review-queue-content');
  if (!root) return;

  const result = await withLoadingState(root, html`${buildSkeleton('stats-row')}${buildSkeleton('card-list', { count: 4 })}`, getReviewQueue, init, {
    icon: iconClipboardCheck(24),
    title: 'Review Queue Empty',
    description: 'All ideas have been reviewed. Check back later for new submissions.',
  });
  if (!result) return;
  allIdeas = result;

  const stats = {
    total: allIdeas.length,
    ready: allIdeas.filter(idea => idea.readiness === 'ready').length,
    highPriority: allIdeas.filter(idea => idea.priority === 'high').length,
    avgWait: Math.round(allIdeas.reduce((sum, idea) => sum + idea.waitingDays, 0) / allIdeas.length),
  };

  setHtml(root, html`
    <div class="flex items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="page-title">Review Queue</h1>
        <p class="text-muted">Review and approve submitted ideas</p>
      </div>
    </div>

    <div class="stats-grid mb-8">
      <div class="card p-4"><div class="flex items-center gap-3">
        <div class="p-2 rounded-lg" style="background:hsl(var(--primary)/0.1)">${iconClock(20, 'text-primary')}</div>
        <div><p class="text-2xl font-bold">${stats.total}</p><p class="text-sm text-muted">Pending Review</p></div>
      </div></div>
      <div class="card p-4"><div class="flex items-center gap-3">
        <div class="p-2 rounded-lg" style="background:hsl(var(--success-soft))">${iconCheckCircle2(20, 'text-success')}</div>
        <div><p class="text-2xl font-bold">${stats.ready}</p><p class="text-sm text-muted">Ready to Decide</p></div>
      </div></div>
      <div class="card p-4"><div class="flex items-center gap-3">
        <div class="p-2 rounded-lg" style="background:hsl(var(--error-soft))">${iconAlertCircle(20, 'text-error')}</div>
        <div><p class="text-2xl font-bold">${stats.highPriority}</p><p class="text-sm text-muted">High Priority</p></div>
      </div></div>
      <div class="card p-4"><div class="flex items-center gap-3">
        <div class="p-2 rounded-lg" style="background:hsl(var(--warning-soft))">${iconTrendingUp(20, 'text-warning')}</div>
        <div><p class="text-2xl font-bold">${stats.avgWait}d</p><p class="text-sm text-muted">Avg. Wait Time</p></div>
      </div></div>
    </div>

    <div class="flex gap-4 mb-6">
      <div class="search-wrapper" style="flex:1">
        <span class="search-icon">${iconSearch(16)}</span>
        <input class="input search-input" placeholder="Search ideas or submitters..." id="review-queue-search" aria-label="Search ideas or submitters" />
      </div>
      <select class="input" style="width:10rem" id="review-queue-priority-filter" aria-label="Filter by priority">
        <option value="all">All Priority</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <select class="input" style="width:10rem" id="review-queue-readiness-filter" aria-label="Filter by readiness">
        <option value="all">All Status</option>
        <option value="ready">Ready</option>
        <option value="needs-info">Needs Info</option>
        <option value="incomplete">Incomplete</option>
      </select>
    </div>

    <div id="review-queue-list" style="display:flex;flex-direction:column;gap:0.75rem">
      ${allIdeas.map(buildReviewCard)}
    </div>
    <div id="review-queue-empty" class="text-center" style="display:none;padding:3rem 0">
      ${iconClock(48, 'text-muted')}
      <h3 class="text-lg font-semibold mt-4 mb-2">No ideas match your filters</h3>
      <p class="text-muted">Try adjusting your search or filter criteria</p>
    </div>`);

  function mutateFilteredList() {
    const search = ($input('#review-queue-search')?.value ?? '').toLowerCase();
    const priority = $select('#review-queue-priority-filter')?.value ?? 'all';
    const readiness = $select('#review-queue-readiness-filter')?.value ?? 'all';

    const filtered = allIdeas.filter(idea => {
      const matchesSearch = idea.title.toLowerCase().includes(search) || idea.submittedBy.toLowerCase().includes(search);
      const matchesPriority = priority === 'all' || idea.priority === priority;
      const matchesReadiness = readiness === 'all' || idea.readiness === readiness;
      return matchesSearch && matchesPriority && matchesReadiness;
    });

    const list = $('#review-queue-list');
    const empty = $('#review-queue-empty');
    if (list) setHtml(list, html`${filtered.map(buildReviewCard)}`);
    if (list) list.style.display = filtered.length ? '' : 'none';
    if (empty) empty.style.display = filtered.length ? 'none' : '';
  }

  $('#review-queue-list')?.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    const card = e.target.closest<HTMLElement>('[data-review-card]');
    if (card) navigateTo('approval-detail', { id: attr(card, 'data-review-card') });
  });

  $('#review-queue-search')?.addEventListener('input', mutateFilteredList);
  $('#review-queue-priority-filter')?.addEventListener('change', mutateFilteredList);
  $('#review-queue-readiness-filter')?.addEventListener('change', mutateFilteredList);
  mutateFilteredList();
}
