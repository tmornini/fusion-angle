import {
  $, navigateTo, html, setHtml, type SafeHtml, trusted,
  iconTarget, iconSearch, iconCheckCircle2, iconAlertCircle, iconClock,
  iconChevronRight, iconTrendingUp, iconShield, iconBarChart, iconUser,
  buildSkeleton, buildErrorState, buildEmptyState,
} from '../../site/script';
import { getEdgeList, type EdgeListItem } from '../../site/data';

const edgeStatusDisplayConfig: Record<string, { label: string; className: string; icon: (size?: number) => SafeHtml }> = {
  complete: { label: 'Complete', className: 'badge-success', icon: iconCheckCircle2 },
  draft: { label: 'Draft', className: 'badge-warning', icon: iconClock },
  missing: { label: 'Missing', className: 'badge-error', icon: iconAlertCircle },
};

const confidenceLevelConfig: Record<string, { label: string; className: string }> = {
  high: { label: 'High', className: 'text-success' },
  medium: { label: 'Medium', className: 'text-warning' },
  low: { label: 'Low', className: 'text-error' },
};

function buildEdgeCard(edge: EdgeListItem): SafeHtml {
  const statusDisplay = edgeStatusDisplayConfig[edge.status];
  return html`
    <div class="card card-hover p-4" style="cursor:pointer" data-edge-card="${edge.ideaId}">
      <div class="flex items-start justify-between gap-4">
        <div style="flex:1;min-width:0">
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <span class="badge ${statusDisplay!.className} text-xs">${statusDisplay!.icon(12)} ${statusDisplay!.label}</span>
            ${edge.confidence ? html`<span class="flex items-center gap-1 text-xs ${confidenceLevelConfig[edge.confidence]!.className}">${iconShield(14)} ${confidenceLevelConfig[edge.confidence]!.label} Confidence</span>` : html``}
          </div>
          <h3 class="font-semibold mb-1">${edge.ideaTitle}</h3>
          <div class="flex flex-wrap items-center gap-3 text-sm text-muted">
            ${edge.owner ? html`<span class="flex items-center gap-1">${iconUser(14)} ${edge.owner}</span>` : html``}
            ${edge.status !== 'missing' ? html`<span class="flex items-center gap-1">${iconTrendingUp(14)} ${edge.outcomesCount} ${edge.outcomesCount === 1 ? 'outcome' : 'outcomes'}</span><span class="flex items-center gap-1">${iconBarChart(14)} ${edge.metricsCount} ${edge.metricsCount === 1 ? 'metric' : 'metrics'}</span>` : html``}
            ${edge.updatedAt ? html`<span class="text-xs">Updated ${edge.updatedAt}</span>` : html``}
          </div>
        </div>
        <div class="flex items-center">${iconChevronRight(20, 'text-muted')}</div>
      </div>
    </div>`;
}

export async function init(): Promise<void> {
  const listEl = $('#edge-list');
  if (listEl) setHtml(listEl, buildSkeleton('card-list', { count: 4 }));

  let edges: EdgeListItem[];
  try {
    edges = await getEdgeList();
  } catch {
    if (listEl) {
      setHtml(listEl, buildErrorState('Failed to load Edge definitions.'));
      listEl.querySelector('[data-retry-btn]')?.addEventListener('click', () => init());
    }
    return;
  }

  if (edges.length === 0) {
    if (listEl) setHtml(listEl, buildEmptyState(iconTarget(24), 'No Edge Definitions', 'Create Edge definitions for your ideas to track outcomes and metrics.', { label: 'View Ideas', href: '../ideas/index.html' }));
    return;
  }

  // Badge icon
  const pageBadgeEl = $('#page-badge');
  if (pageBadgeEl) setHtml(pageBadgeEl, html`${iconTarget(14)} Business Case Definition`);

  // Search icon
  const searchFieldIconEl = $('#search-field-icon');
  if (searchFieldIconEl) setHtml(searchFieldIconEl, iconSearch(16));

  // Stats
  const stats = {
    total: edges.length,
    complete: edges.filter(edge => edge.status === 'complete').length,
    draft: edges.filter(edge => edge.status === 'draft').length,
    missing: edges.filter(edge => edge.status === 'missing').length,
  };
  const statsEl = $('#edge-stats');
  if (statsEl) {
    setHtml(statsEl, html`
      <div class="card p-4"><div class="flex items-center gap-3"><div class="p-2 rounded-lg" style="background:hsl(var(--primary)/0.1)">${iconTarget(20, 'text-primary')}</div><div><p class="text-2xl font-bold">${stats.total}</p><p class="text-sm text-muted">Total Ideas</p></div></div></div>
      <div class="card p-4"><div class="flex items-center gap-3"><div class="p-2 rounded-lg" style="background:hsl(var(--success-soft))">${iconCheckCircle2(20, 'text-success')}</div><div><p class="text-2xl font-bold">${stats.complete}</p><p class="text-sm text-muted">Complete</p></div></div></div>
      <div class="card p-4"><div class="flex items-center gap-3"><div class="p-2 rounded-lg" style="background:hsl(var(--warning-soft))">${iconClock(20, 'text-warning')}</div><div><p class="text-2xl font-bold">${stats.draft}</p><p class="text-sm text-muted">In Draft</p></div></div></div>
      <div class="card p-4"><div class="flex items-center gap-3"><div class="p-2 rounded-lg" style="background:hsl(var(--error-soft))">${iconAlertCircle(20, 'text-error')}</div><div><p class="text-2xl font-bold">${stats.missing}</p><p class="text-sm text-muted">Missing</p></div></div></div>`);
  }

  // Empty state
  const emptyEl = $('#edge-empty');
  if (emptyEl) setHtml(emptyEl, html`${iconTarget(48, 'text-muted')}<h3 class="text-lg font-semibold mt-4 mb-2">No Edge definitions found</h3><p class="text-muted">Try adjusting your search or filter criteria</p>`);

  function mutateFilteredList() {
    const search = (($('#edge-search') as HTMLInputElement)?.value || '').toLowerCase();
    const status = ($('#edge-status-filter') as HTMLSelectElement)?.value || 'all';
    const filtered = edges.filter(edge => {
      const matchesSearch = edge.ideaTitle.toLowerCase().includes(search) || edge.owner.toLowerCase().includes(search);
      const matchesStatus = status === 'all' || edge.status === status;
      return matchesSearch && matchesStatus;
    });
    const list = $('#edge-list');
    const empty = $('#edge-empty');
    if (list) setHtml(list, html`${filtered.map(buildEdgeCard)}`);
    if (list) list.style.display = filtered.length ? '' : 'none';
    if (empty) empty.style.display = filtered.length ? 'none' : '';
  }

  listEl?.addEventListener('click', (e) => {
    const card = (e.target as Element).closest<HTMLElement>('[data-edge-card]');
    if (card) navigateTo('edge', { ideaId: card.getAttribute('data-edge-card')! });
  });

  $('#edge-search')?.addEventListener('input', mutateFilteredList);
  $('#edge-status-filter')?.addEventListener('change', mutateFilteredList);
  mutateFilteredList();
}
