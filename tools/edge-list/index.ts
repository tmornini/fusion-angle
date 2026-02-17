import {
  $, escapeHtml, navigateTo,
  iconTarget, iconSearch, iconCheckCircle2, iconAlertCircle, iconClock,
  iconChevronRight, iconTrendingUp, iconShield, iconBarChart, iconUser,
  renderSkeleton, renderError, renderEmpty,
} from '../../site/script';
import { getEdges, type EdgeItem } from '../../site/data';

const statusConfig: Record<string, { label: string; cls: string; icon: (s?: number) => string }> = {
  complete: { label: 'Complete', cls: 'badge-success', icon: iconCheckCircle2 },
  draft: { label: 'Draft', cls: 'badge-warning', icon: iconClock },
  missing: { label: 'Missing', cls: 'badge-error', icon: iconAlertCircle },
};

const confidenceConfig: Record<string, { label: string; cls: string }> = {
  high: { label: 'High', cls: 'text-success' },
  medium: { label: 'Medium', cls: 'text-warning' },
  low: { label: 'Low', cls: 'text-error' },
};

function renderEdgeCard(edge: EdgeItem): string {
  const sc = statusConfig[edge.status];
  return `
    <div class="card card-hover p-4" style="cursor:pointer" data-edge-card="${edge.ideaId}">
      <div class="flex items-start justify-between gap-4">
        <div style="flex:1;min-width:0">
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <span class="badge ${sc!.cls} text-xs">${sc!.icon(12)} ${sc!.label}</span>
            ${edge.confidence ? `<span class="flex items-center gap-1 text-xs ${confidenceConfig[edge.confidence]!.cls}">${iconShield(14)} ${confidenceConfig[edge.confidence]!.label} Confidence</span>` : ''}
          </div>
          <h3 class="font-semibold mb-1">${escapeHtml(edge.ideaTitle)}</h3>
          <div class="flex flex-wrap items-center gap-3 text-sm text-muted">
            ${edge.owner ? `<span class="flex items-center gap-1">${iconUser(14)} ${escapeHtml(edge.owner)}</span>` : ''}
            ${edge.status !== 'missing' ? `<span class="flex items-center gap-1">${iconTrendingUp(14)} ${edge.outcomesCount} outcomes</span><span class="flex items-center gap-1">${iconBarChart(14)} ${edge.metricsCount} metrics</span>` : ''}
            ${edge.updatedAt ? `<span class="text-xs">Updated ${edge.updatedAt}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center">${iconChevronRight(20, 'text-muted')}</div>
      </div>
    </div>`;
}

export async function init(): Promise<void> {
  const listEl = $('#edge-list');
  if (listEl) listEl.innerHTML = renderSkeleton('card-list', { count: 4 });

  let edges: EdgeItem[];
  try {
    edges = await getEdges();
  } catch {
    if (listEl) {
      listEl.innerHTML = renderError('Failed to load Edge definitions.');
      listEl.querySelector('[data-retry-btn]')?.addEventListener('click', () => init());
    }
    return;
  }

  if (edges.length === 0) {
    if (listEl) listEl.innerHTML = renderEmpty(iconTarget(24), 'No Edge Definitions', 'Create Edge definitions for your ideas to track outcomes and metrics.', { label: 'View Ideas', href: '../ideas/index.html' });
    return;
  }

  // Badge icon
  const badgeEl = $('#badge-icon');
  if (badgeEl) badgeEl.innerHTML = `${iconTarget(14)} Business Case Definition`;

  // Search icon
  const searchIconEl = $('#search-icon');
  if (searchIconEl) searchIconEl.innerHTML = iconSearch(16);

  // Stats
  const stats = {
    total: edges.length,
    complete: edges.filter(e => e.status === 'complete').length,
    draft: edges.filter(e => e.status === 'draft').length,
    missing: edges.filter(e => e.status === 'missing').length,
  };
  const statsEl = $('#edge-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="card p-4"><div class="flex items-center gap-3"><div class="p-2 rounded-lg" style="background:hsl(var(--primary)/0.1)">${iconTarget(20, 'text-primary')}</div><div><p class="text-2xl font-bold">${stats.total}</p><p class="text-sm text-muted">Total Ideas</p></div></div></div>
      <div class="card p-4"><div class="flex items-center gap-3"><div class="p-2 rounded-lg" style="background:hsl(var(--success-soft))">${iconCheckCircle2(20, 'text-success')}</div><div><p class="text-2xl font-bold">${stats.complete}</p><p class="text-sm text-muted">Complete</p></div></div></div>
      <div class="card p-4"><div class="flex items-center gap-3"><div class="p-2 rounded-lg" style="background:hsl(var(--warning-soft))">${iconClock(20, 'text-warning')}</div><div><p class="text-2xl font-bold">${stats.draft}</p><p class="text-sm text-muted">In Draft</p></div></div></div>
      <div class="card p-4"><div class="flex items-center gap-3"><div class="p-2 rounded-lg" style="background:hsl(var(--error-soft))">${iconAlertCircle(20, 'text-error')}</div><div><p class="text-2xl font-bold">${stats.missing}</p><p class="text-sm text-muted">Missing</p></div></div></div>`;
  }

  // Empty state
  const emptyEl = $('#edge-empty');
  if (emptyEl) emptyEl.innerHTML = `${iconTarget(48, 'text-muted')}<h3 class="text-lg font-semibold mt-4 mb-2">No Edge definitions found</h3><p class="text-muted">Try adjusting your search or filter criteria</p>`;

  function filterAndRender() {
    const search = (($('#edge-search') as HTMLInputElement)?.value || '').toLowerCase();
    const status = ($('#edge-status-filter') as HTMLSelectElement)?.value || 'all';
    const filtered = edges.filter(e => {
      const matchSearch = e.ideaTitle.toLowerCase().includes(search) || e.owner.toLowerCase().includes(search);
      const matchStatus = status === 'all' || e.status === status;
      return matchSearch && matchStatus;
    });
    const list = $('#edge-list');
    const empty = $('#edge-empty');
    if (list) list.innerHTML = filtered.map(renderEdgeCard).join('');
    if (list) list.style.display = filtered.length ? '' : 'none';
    if (empty) empty.style.display = filtered.length ? 'none' : '';
    document.querySelectorAll<HTMLElement>('[data-edge-card]').forEach(card => {
      card.addEventListener('click', () => navigateTo('edge', { ideaId: card.getAttribute('data-edge-card')! }));
    });
  }

  $('#edge-search')?.addEventListener('input', filterAndRender);
  $('#edge-status-filter')?.addEventListener('change', filterAndRender);
  filterAndRender();
}
