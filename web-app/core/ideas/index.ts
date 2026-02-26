import {
  $, navigateTo, html, setHtml, SafeHtml,
  buildSkeleton, buildErrorState, buildEmptyState,
  iconPlus, iconWand, iconGripVertical, iconTrendingUp, iconClock,
  iconDollarSign, iconStar, iconLayoutGrid, iconBarChart, iconEye,
  iconClipboardCheck, iconChevronRight, iconArrowRight, iconLightbulb, iconTarget,
} from '../../site/script';
import { getIdeas, type Idea } from '../../site/data';
import { edgeStatusConfig } from '../../site/config';

const ideaStatusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'badge-default' },
  scored: { label: 'Scored', className: 'badge-primary' },
  pending_review: { label: 'Pending Review', className: 'badge-warning' },
  approved: { label: 'Approved', className: 'badge-success' },
  rejected: { label: 'Sent Back', className: 'badge-error' },
};

function styleForScoreBadge(score: number): string {
  if (score >= 85) return 'color:hsl(var(--success));background:hsl(var(--success-soft))';
  if (score >= 70) return 'color:hsl(var(--warning));background:hsl(var(--warning-soft))';
  return 'color:hsl(var(--error));background:hsl(var(--error-soft))';
}

function buildIdeaCard(idea: Idea, view: string): SafeHtml {
  const isReviewable = idea.status === 'pending_review' && idea.edgeStatus === 'complete';
  const isConvertible = idea.status === 'approved';
  const needsEdgeDefinition = idea.edgeStatus !== 'complete' && idea.status !== 'draft';

  return html`
    <div class="card card-hover p-5" style="cursor:pointer" data-idea-card="${idea.id}">
      <div class="flex items-start gap-4">
        <div class="hidden-mobile" style="color:hsl(var(--muted-foreground)/0.5);margin-top:0.25rem;cursor:grab">
          ${iconGripVertical(20)}
        </div>
        <div style="flex:1;min-width:0">
          <div class="flex items-start justify-between gap-4 mb-3">
            <div style="flex:1;min-width:0">
              <div class="flex flex-wrap items-center gap-2 mb-1">
                <h3 class="font-display font-semibold truncate">${idea.title}</h3>
                <span class="badge ${ideaStatusConfig[idea.status]!.className} text-xs">${ideaStatusConfig[idea.status]!.label}</span>
                <span class="badge ${edgeStatusConfig[idea.edgeStatus]!.className} text-xs">${iconTarget(12)} ${edgeStatusConfig[idea.edgeStatus]!.label}</span>
              </div>
              <div class="flex items-center gap-2 text-xs text-muted">
                ${view === 'priority' ? html`<span>Priority #${idea.priority}</span><span>•</span>` : html``}
                <span>by ${idea.submittedBy}</span>
              </div>
            </div>
            <div style="padding:0.25rem 0.75rem;border-radius:var(--radius-lg);font-weight:600;font-size:0.875rem;${styleForScoreBadge(idea.score)}">
              ${iconStar(14)} ${idea.score}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:3fr 2fr;gap:1rem;align-items:end">
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem">
              <div class="flex items-center gap-2">
                <div style="width:2rem;height:2rem;border-radius:var(--radius-lg);background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center">
                  ${iconClock(16, 'text-primary')}
                </div>
                <div>
                  <p class="text-xs text-muted">Time</p>
                  <p class="text-sm font-medium">${idea.estimatedTime ? `${idea.estimatedTime}h` : '—'}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <div style="width:2rem;height:2rem;border-radius:var(--radius-lg);background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center">
                  ${iconDollarSign(16, 'text-primary')}
                </div>
                <div>
                  <p class="text-xs text-muted">Cost</p>
                  <p class="text-sm font-medium">${idea.estimatedCost ? `$${(idea.estimatedCost / 1000).toFixed(0)}k` : '—'}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <div style="width:2rem;height:2rem;border-radius:var(--radius-lg);background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center">
                  ${iconTrendingUp(16, 'text-primary')}
                </div>
                <div>
                  <p class="text-xs text-muted">Impact</p>
                  <p class="text-sm font-medium">${idea.estimatedImpact || '—'}</p>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2 idea-actions" style="justify-content:flex-end">
              <button class="btn btn-outline btn-sm gap-2" data-idea-view="${idea.id}">
                ${iconEye(16)} <span class="hidden-mobile">View</span>
              </button>
              ${needsEdgeDefinition ? html`
                <button class="btn btn-outline btn-sm gap-2" style="border-color:hsl(var(--primary)/0.3);color:hsl(var(--primary))" data-idea-edge="${idea.id}">
                  ${iconTarget(16)} <span class="hidden-mobile">Define Edge</span>
                </button>` : html``}
              ${isReviewable ? html`
                <button class="btn btn-outline btn-sm gap-2" style="border-color:hsl(var(--warning)/0.3);color:hsl(var(--warning))" data-idea-review="${idea.id}">
                  ${iconClipboardCheck(16)} <span class="hidden-mobile">Review</span>
                </button>` : html``}
              ${isConvertible ? html`
                <button class="btn btn-primary btn-sm gap-2" data-idea-convert="${idea.id}">
                  ${iconArrowRight(16)} <span class="hidden-mobile">Convert</span>
                </button>` : html``}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

export async function init(): Promise<void> {
  // Show skeleton immediately
  const listContainer = $('#ideas-list');
  if (listContainer) setHtml(listContainer, buildSkeleton('card-list', { count: 4 }));

  // Fetch data with error handling
  let ideas: Idea[];
  try {
    ideas = await getIdeas();
  } catch (e) {
    if (listContainer) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to load ideas. Please try again.';
      setHtml(listContainer, buildErrorState(errorMessage));
      listContainer.querySelector('[data-retry-btn]')?.addEventListener('click', init);
    }
    return;
  }

  // Empty state
  if (ideas.length === 0) {
    $('#create-idea-btn')?.remove();
    if (listContainer) {
      setHtml(listContainer, buildEmptyState(
        iconLightbulb(24),
        'No Ideas Yet',
        'Start innovating by creating your first idea.',
        { label: html`${iconPlus(16)} Create Your First Idea ${iconWand(16)}`, href: '../idea-create/index.html' },
      ));
    }
    return;
  }

  let currentView = 'priority';

  // Populate icons in static elements
  const createBtnIconEl = $('#create-btn-icon');
  if (createBtnIconEl) setHtml(createBtnIconEl, iconPlus(16));
  const createBtnAccentEl = $('#create-btn-accent');
  if (createBtnAccentEl) setHtml(createBtnAccentEl, iconWand(16));
  const priorityViewIconEl = $('#priority-view-icon');
  if (priorityViewIconEl) setHtml(priorityViewIconEl, iconLayoutGrid(16));
  const performanceViewIconEl = $('#performance-view-icon');
  if (performanceViewIconEl) setHtml(performanceViewIconEl, iconBarChart(16));

  // Flow indicator
  const flowEl = $('#flow-indicator');
  if (flowEl) {
    setHtml(flowEl, html`
      ${iconLightbulb(16, 'text-primary')}
      <span class="text-sm text-muted" style="white-space:nowrap">
        <span class="font-medium" style="color:hsl(var(--foreground))">Idea Flow:</span>
        Create → <span class="text-primary font-medium">Edge</span> → Review → Convert
      </span>
      ${iconChevronRight(16, 'text-muted')}`);
  }

  // Review queue button
  const pendingReviewCount = ideas.filter(idea => idea.status === 'pending_review').length;
  const reviewBtnEl = $('#review-queue-btn');
  if (reviewBtnEl && pendingReviewCount > 0) {
    setHtml(reviewBtnEl, html`
      <button class="btn btn-outline gap-2" style="border-color:hsl(var(--warning)/0.3);color:hsl(var(--warning))" id="review-queue-nav">
        ${iconClipboardCheck(16)} <span class="hidden-mobile">Review Queue</span> (${pendingReviewCount})
      </button>`);
    $('#review-queue-nav')?.addEventListener('click', () => navigateTo('idea-review-queue'));
  }

  // Create button
  $('#create-idea-btn')?.addEventListener('click', () => navigateTo('idea-create'));

  function mutateList() {
    const sorted = currentView === 'priority'
      ? [...ideas].sort((a, b) => a.priority - b.priority)
      : [...ideas].sort((a, b) => b.score - a.score);

    const list = $('#ideas-list');
    if (list) setHtml(list, html`${sorted.map(idea => buildIdeaCard(idea, currentView))}`);

    const count = $('#ideas-count');
    if (count) count.textContent = `${sorted.length} ${sorted.length === 1 ? 'idea' : 'ideas'} • ${currentView === 'priority' ? 'by priority' : 'by score'}`;
  }

  document.querySelectorAll<HTMLElement>('.view-toggle-btn').forEach(viewToggleButton => {
    viewToggleButton.addEventListener('click', () => {
      const view = viewToggleButton.getAttribute('data-view') || 'priority';
      currentView = view;
      document.querySelectorAll<HTMLElement>('.view-toggle-btn').forEach(button => {
        button.classList.toggle('active', button.getAttribute('data-view') === view);
      });
      mutateList();
    });
  });

  $('#ideas-list')?.addEventListener('click', (e) => {
    const target = e.target as Element;
    const actionButton = target.closest<HTMLElement>('[data-idea-view], [data-idea-edge], [data-idea-review], [data-idea-convert]');
    if (actionButton) {
      if (actionButton.hasAttribute('data-idea-view')) navigateTo('idea-convert', { ideaId: actionButton.getAttribute('data-idea-view')! });
      else if (actionButton.hasAttribute('data-idea-edge')) navigateTo('edge', { ideaId: actionButton.getAttribute('data-idea-edge')! });
      else if (actionButton.hasAttribute('data-idea-review')) navigateTo('approval-detail', { id: actionButton.getAttribute('data-idea-review')! });
      else if (actionButton.hasAttribute('data-idea-convert')) navigateTo('idea-convert', { ideaId: actionButton.getAttribute('data-idea-convert')! });
      return;
    }
    const card = target.closest<HTMLElement>('[data-idea-card]');
    if (card) navigateTo('idea-convert', { ideaId: card.getAttribute('data-idea-card')! });
  });

  mutateList();
}
