import {
  $, escapeHtml, navigateTo,
  renderSkeleton, renderError, renderEmpty,
  iconPlus, iconWand, iconGripVertical, iconTrendingUp, iconClock,
  iconDollarSign, iconStar, iconLayoutGrid, iconBarChart, iconEye,
  iconClipboardCheck, iconChevronRight, iconArrowRight, iconLightbulb, iconTarget,
} from '../../site/script';
import { getIdeas, type Idea } from '../../site/data';

const statusConfig: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'badge-default' },
  scored: { label: 'Scored', cls: 'badge-primary' },
  pending_review: { label: 'Pending Review', cls: 'badge-warning' },
  approved: { label: 'Approved', cls: 'badge-success' },
  rejected: { label: 'Sent Back', cls: 'badge-error' },
};

const edgeStatusConfig: Record<string, { label: string; cls: string }> = {
  incomplete: { label: 'Edge Missing', cls: 'badge-error' },
  draft: { label: 'Edge Draft', cls: 'badge-warning' },
  complete: { label: 'Edge Complete', cls: 'badge-success' },
};

function getScoreColor(score: number): string {
  if (score >= 85) return 'color:hsl(var(--success));background:hsl(var(--success-soft))';
  if (score >= 70) return 'color:hsl(var(--warning));background:hsl(var(--warning-soft))';
  return 'color:hsl(var(--error));background:hsl(var(--error-soft))';
}

function renderIdeaCard(idea: Idea, view: string): string {
  const canReview = idea.status === 'pending_review' && idea.edgeStatus === 'complete';
  const canConvert = idea.status === 'approved';
  const needsEdge = idea.edgeStatus !== 'complete' && idea.status !== 'draft';

  return `
    <div class="card card-hover p-5" style="cursor:pointer" data-idea-card="${idea.id}">
      <div class="flex items-start gap-4">
        <div class="hidden-mobile" style="color:hsl(var(--muted-foreground)/0.5);margin-top:0.25rem;cursor:grab">
          ${iconGripVertical(20)}
        </div>
        <div style="flex:1;min-width:0">
          <div class="flex items-start justify-between gap-4 mb-3">
            <div style="flex:1;min-width:0">
              <div class="flex flex-wrap items-center gap-2 mb-1">
                <h3 class="font-display font-semibold truncate">${escapeHtml(idea.title)}</h3>
                <span class="badge ${statusConfig[idea.status]!.cls} text-xs">${statusConfig[idea.status]!.label}</span>
                <span class="badge ${edgeStatusConfig[idea.edgeStatus]!.cls} text-xs">${iconTarget(12)} ${edgeStatusConfig[idea.edgeStatus]!.label}</span>
              </div>
              <div class="flex items-center gap-2 text-xs text-muted">
                ${view === 'priority' ? `<span>Priority #${idea.priority}</span><span>•</span>` : ''}
                <span>by ${escapeHtml(idea.submittedBy)}</span>
              </div>
            </div>
            <div style="padding:0.25rem 0.75rem;border-radius:var(--radius-lg);font-weight:600;font-size:0.875rem;${getScoreColor(idea.score)}">
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
                  <p class="text-sm font-medium">${idea.estimatedTime}h</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <div style="width:2rem;height:2rem;border-radius:var(--radius-lg);background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center">
                  ${iconDollarSign(16, 'text-primary')}
                </div>
                <div>
                  <p class="text-xs text-muted">Cost</p>
                  <p class="text-sm font-medium">$${(idea.estimatedCost / 1000).toFixed(0)}k</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <div style="width:2rem;height:2rem;border-radius:var(--radius-lg);background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center">
                  ${iconTrendingUp(16, 'text-primary')}
                </div>
                <div>
                  <p class="text-xs text-muted">Impact</p>
                  <p class="text-sm font-medium">${idea.estimatedImpact}</p>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2 idea-actions" style="justify-content:flex-end">
              <button class="btn btn-outline btn-sm gap-2" data-idea-view="${idea.id}">
                ${iconEye(16)} <span class="hidden-mobile">View</span>
              </button>
              ${needsEdge ? `
                <button class="btn btn-outline btn-sm gap-2" style="border-color:hsl(var(--primary)/0.3);color:hsl(var(--primary))" data-idea-edge="${idea.id}">
                  ${iconTarget(16)} <span class="hidden-mobile">Define Edge</span>
                </button>` : ''}
              ${canReview ? `
                <button class="btn btn-outline btn-sm gap-2" style="border-color:hsl(var(--warning)/0.3);color:hsl(var(--warning))" data-idea-review="${idea.id}">
                  ${iconClipboardCheck(16)} <span class="hidden-mobile">Review</span>
                </button>` : ''}
              ${canConvert ? `
                <button class="btn btn-primary btn-sm gap-2" data-idea-convert="${idea.id}">
                  ${iconArrowRight(16)} <span class="hidden-mobile">Convert</span>
                </button>` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

export async function init(): Promise<void> {
  // Show skeleton immediately
  const listContainer = $('#ideas-list');
  if (listContainer) listContainer.innerHTML = renderSkeleton('card-list', { count: 4 });

  // Fetch data with error handling
  let ideas: Idea[];
  try {
    ideas = await getIdeas();
  } catch (e) {
    if (listContainer) {
      const msg = e instanceof Error ? e.message : 'Failed to load ideas. Please try again.';
      listContainer.innerHTML = renderError(msg);
      listContainer.querySelector('[data-retry-btn]')?.addEventListener('click', init);
    }
    return;
  }

  // Empty state
  if (ideas.length === 0) {
    if (listContainer) {
      listContainer.innerHTML = renderEmpty(
        iconLightbulb(24),
        'No Ideas Yet',
        'Start innovating by creating your first idea.',
        { label: 'Create Your First Idea', href: '../idea-create/index.html' },
      );
    }
    return;
  }

  let currentView = 'priority';

  // Populate icons in static elements
  const iconPlusEl = $('#icon-plus');
  if (iconPlusEl) iconPlusEl.innerHTML = iconPlus(16);
  const iconWandEl = $('#icon-wand');
  if (iconWandEl) iconWandEl.innerHTML = iconWand(16);
  const iconLayoutGridEl = $('#icon-layout-grid');
  if (iconLayoutGridEl) iconLayoutGridEl.innerHTML = iconLayoutGrid(16);
  const iconBarChartEl = $('#icon-bar-chart');
  if (iconBarChartEl) iconBarChartEl.innerHTML = iconBarChart(16);

  // Flow indicator
  const flowEl = $('#flow-indicator');
  if (flowEl) {
    flowEl.innerHTML = `
      ${iconLightbulb(16, 'text-primary')}
      <span class="text-sm text-muted" style="white-space:nowrap">
        <span class="font-medium" style="color:hsl(var(--foreground))">Idea Flow:</span>
        Create → Score → <span class="text-primary font-medium">Edge</span> → Review → Convert
      </span>
      ${iconChevronRight(16, 'text-muted')}`;
  }

  // Review queue button
  const pendingReviewCount = ideas.filter(i => i.status === 'pending_review').length;
  const reviewBtnEl = $('#review-queue-btn');
  if (reviewBtnEl && pendingReviewCount > 0) {
    reviewBtnEl.innerHTML = `
      <button class="btn btn-outline gap-2" style="border-color:hsl(var(--warning)/0.3);color:hsl(var(--warning))" id="review-queue-nav">
        ${iconClipboardCheck(16)} <span class="hidden-mobile">Review Queue</span> (${pendingReviewCount})
      </button>`;
    $('#review-queue-nav')?.addEventListener('click', () => navigateTo('idea-review-queue'));
  }

  // Create button
  $('#create-idea-btn')?.addEventListener('click', () => navigateTo('idea-create'));

  function rerenderList() {
    const sorted = currentView === 'priority'
      ? [...ideas].sort((a, b) => a.priority - b.priority)
      : [...ideas].sort((a, b) => b.score - a.score);

    const list = $('#ideas-list');
    if (list) list.innerHTML = sorted.map(idea => renderIdeaCard(idea, currentView)).join('');

    const count = $('#ideas-count');
    if (count) count.textContent = `${sorted.length} ideas • ${currentView === 'priority' ? 'by priority' : 'by score'}`;

    bindCardActions();
  }

  document.querySelectorAll<HTMLElement>('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view') || 'priority';
      currentView = view;
      document.querySelectorAll<HTMLElement>('.view-toggle-btn').forEach(b => {
        const isActive = b.getAttribute('data-view') === view;
        b.style.background = isActive ? 'hsl(var(--background))' : 'transparent';
        b.style.color = isActive ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))';
        b.style.boxShadow = isActive ? 'var(--shadow-sm)' : 'none';
      });
      rerenderList();
    });
  });

  function bindCardActions() {
    document.querySelectorAll<HTMLElement>('[data-idea-card]').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target instanceof Element && e.target.closest('button')) return;
        navigateTo('idea-scoring', { ideaId: card.getAttribute('data-idea-card')! });
      });
    });
    document.querySelectorAll<HTMLElement>('[data-idea-view]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); navigateTo('idea-scoring', { ideaId: btn.getAttribute('data-idea-view')! }); });
    });
    document.querySelectorAll<HTMLElement>('[data-idea-edge]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); navigateTo('edge', { ideaId: btn.getAttribute('data-idea-edge')! }); });
    });
    document.querySelectorAll<HTMLElement>('[data-idea-review]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); navigateTo('approval-detail', { id: btn.getAttribute('data-idea-review')! }); });
    });
    document.querySelectorAll<HTMLElement>('[data-idea-convert]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); navigateTo('idea-convert', { ideaId: btn.getAttribute('data-idea-convert')! }); });
    });
  }

  rerenderList();
}
