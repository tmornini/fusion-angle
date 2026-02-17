import {
  $, escapeHtml, showToast, navigateTo,
  iconArrowLeft, iconTarget, iconTrendingUp, iconShield, iconPlus,
  iconTrash, iconCheck, iconAlertCircle, iconClock, iconUser, iconSave,
  renderSkeleton, renderError,
} from '../../site/script';
import { getEdgeIdea, type EdgeIdea } from '../../site/data';

interface Metric { [key: string]: string; id: string; name: string; target: string; unit: string; }
interface Outcome { id: string; description: string; metrics: Metric[]; }
interface Impact { shortTerm: string; midTerm: string; longTerm: string; }
interface EdgeData { outcomes: Outcome[]; impact: Impact; confidence: string; owner: string; }

const outcomeTemplates = ['Reduce operational cost', 'Increase customer retention', 'Improve delivery speed'];

let edgeData: EdgeData = {
  outcomes: [],
  impact: { shortTerm: '', midTerm: '', longTerm: '' },
  confidence: '',
  owner: 'Sarah Chen',
};
let nextId = 1;
let currentIdea: EdgeIdea | null = null;

function getCompletion() {
  const hasOutcomes = edgeData.outcomes.length > 0;
  const allMetrics = hasOutcomes && edgeData.outcomes.every(o => o.metrics.length > 0);
  const hasImpact = !!(edgeData.impact.shortTerm || edgeData.impact.midTerm || edgeData.impact.longTerm);
  const hasOwner = edgeData.owner.trim() !== '';
  const hasConfidence = edgeData.confidence !== '';
  const percent = [hasOutcomes, allMetrics, hasImpact, hasOwner, hasConfidence].filter(Boolean).length * 20;
  const valid = hasOutcomes && allMetrics && hasImpact && hasOwner;
  return { hasOutcomes, allMetrics, hasImpact, hasOwner, hasConfidence, percent, valid };
}

function checkIcon(ok: boolean): string {
  return ok
    ? `<span style="color:hsl(var(--success))">${iconCheck(14)}</span>`
    : `<span style="color:hsl(var(--muted-foreground))">${iconAlertCircle(14)}</span>`;
}

function renderEdgePage(ideaId: string): string {
  const idea = currentIdea!;
  const c = getCompletion();
  const statusLabel = c.valid ? 'Complete' : c.percent > 0 ? 'In Progress' : 'Incomplete';
  const statusCls = c.valid ? 'badge-success' : c.percent > 0 ? 'badge-warning' : 'badge-error';

  const outcomesHtml = edgeData.outcomes.length === 0
    ? `<div class="text-center p-8" style="border:2px dashed hsl(var(--border));border-radius:var(--radius-lg)">
        ${iconTarget(40, 'text-muted')}
        <p class="text-sm text-muted mb-4 mt-3">No outcomes defined yet</p>
        <div class="flex flex-wrap justify-center gap-2">
          ${outcomeTemplates.map(t => `<button class="btn btn-outline btn-sm text-xs" data-add-template="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}
        </div>
      </div>`
    : edgeData.outcomes.map((outcome, idx) => `
      <div class="p-4 rounded-lg" style="background:hsl(var(--muted)/0.3);border:1px solid hsl(var(--border))">
        <div class="flex items-start gap-3 mb-3">
          <div style="width:1.5rem;height:1.5rem;border-radius:9999px;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:600;color:hsl(var(--primary));flex-shrink:0">${idx + 1}</div>
          <input class="input" style="flex:1" value="${escapeHtml(outcome.description)}" placeholder="Describe the business outcome..." data-outcome-desc="${outcome.id}" />
          <button class="btn btn-ghost btn-icon btn-sm" data-remove-outcome="${outcome.id}">${iconTrash(16)}</button>
        </div>
        <div style="padding-left:2.25rem">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-muted">Success Metrics</span>
            <button class="btn btn-ghost btn-xs gap-1" data-add-metric="${outcome.id}">${iconPlus(12)} Add Metric</button>
          </div>
          ${outcome.metrics.length === 0
            ? '<p class="text-xs text-muted" style="font-style:italic">Add at least one metric to measure this outcome</p>'
            : outcome.metrics.map(m => `
              <div class="p-2 rounded mb-2" style="background:hsl(var(--background));border:1px solid hsl(var(--border))">
                <div class="flex items-center gap-2">
                  <input class="input" style="flex:1;height:2rem;font-size:0.875rem" value="${escapeHtml(m.name)}" placeholder="Metric name" data-metric="${outcome.id}|${m.id}|name" />
                  <input class="input" style="width:5rem;height:2rem;font-size:0.875rem" value="${escapeHtml(m.target)}" placeholder="Target" data-metric="${outcome.id}|${m.id}|target" />
                  <input class="input" style="width:4rem;height:2rem;font-size:0.875rem" value="${escapeHtml(m.unit)}" placeholder="Unit" data-metric="${outcome.id}|${m.id}|unit" />
                  <button class="btn btn-ghost btn-icon btn-xs" data-remove-metric="${outcome.id}|${m.id}">${iconTrash(14)}</button>
                </div>
              </div>`).join('')}
        </div>
      </div>`).join('');

  return `
    <div>
      <div class="flex items-center justify-between gap-4 mb-6">
        <div class="flex items-center gap-4">
          <button class="btn btn-ghost btn-icon" id="back-btn">${iconArrowLeft(20)}</button>
          <div>
            <div class="badge badge-primary text-sm mb-2">${iconTarget(14)} Business Case Definition</div>
            <div class="flex items-center gap-3 mb-1">
              <h1 class="text-2xl font-display font-bold">Edge</h1>
              <span class="badge ${statusCls}">${statusLabel}</span>
            </div>
            <p class="text-sm text-muted">Define outcomes, metrics, and expected impact</p>
          </div>
        </div>
        <button class="btn btn-hero gap-2" id="save-edge" ${c.valid ? '' : 'disabled'}>
          ${iconSave(16)} Save &amp; Continue
        </button>
      </div>

      <!-- Progress -->
      <div class="card p-4 mb-6">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium">Completion</span>
          <span class="text-sm text-muted">${c.percent}%</span>
        </div>
        <div class="progress"><div class="progress-fill" style="width:${c.percent}%"></div></div>
        <div class="flex flex-wrap gap-3 mt-3">
          <div class="flex items-center gap-1 text-xs">${checkIcon(c.hasOutcomes)} <span class="${c.hasOutcomes ? 'text-success' : 'text-muted'}">Outcomes</span></div>
          <div class="flex items-center gap-1 text-xs">${checkIcon(c.allMetrics && c.hasOutcomes)} <span class="${c.allMetrics && c.hasOutcomes ? 'text-success' : 'text-muted'}">Metrics</span></div>
          <div class="flex items-center gap-1 text-xs">${checkIcon(c.hasImpact)} <span class="${c.hasImpact ? 'text-success' : 'text-muted'}">Impact</span></div>
          <div class="flex items-center gap-1 text-xs">${checkIcon(c.hasOwner)} <span class="${c.hasOwner ? 'text-success' : 'text-muted'}">Owner</span></div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 2fr;gap:1.5rem" class="edge-grid">
        <!-- Left: Idea Summary -->
        <div>
          <div class="card p-5" style="position:sticky;top:1.5rem">
            <h3 class="font-display font-semibold mb-4 flex items-center gap-2">${iconTarget(20, 'text-primary')} Linked Idea</h3>
            <h4 class="font-medium mb-1">${escapeHtml(idea.title)}</h4>
            <p class="text-xs text-muted mb-4">Score: ${idea.score}</p>
            <p class="text-xs text-muted mb-1">Problem</p>
            <p class="text-sm mb-3">${escapeHtml(idea.problem)}</p>
            <p class="text-xs text-muted mb-1">Solution</p>
            <p class="text-sm mb-3">${escapeHtml(idea.solution)}</p>
            <div style="padding-top:0.75rem;border-top:1px solid hsl(var(--border))">
              <p class="text-xs text-muted mb-1">Submitted by</p>
              <p class="text-sm">${escapeHtml(idea.submittedBy)}</p>
            </div>
          </div>
        </div>

        <!-- Right: Edge Form -->
        <div style="display:flex;flex-direction:column;gap:1.5rem">
          <!-- Outcomes -->
          <div class="card p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-display font-semibold flex items-center gap-2">${iconTarget(20, 'text-primary')} Business Outcomes</h3>
              <button class="btn btn-outline btn-sm gap-1" id="add-outcome">${iconPlus(16)} Add Outcome</button>
            </div>
            <div id="outcomes-container">${outcomesHtml}</div>
          </div>

          <!-- Impact -->
          <div class="card p-5">
            <h3 class="font-display font-semibold mb-4 flex items-center gap-2">${iconTrendingUp(20, 'text-primary')} Expected Impact</h3>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem" class="impact-grid">
              <div>
                <label class="label text-xs text-muted mb-2 flex items-center gap-1">${iconClock(14)} Short-term (0-3 months)</label>
                <textarea class="textarea text-sm" rows="4" id="impact-short" placeholder="Expected impact in the first 3 months...">${escapeHtml(edgeData.impact.shortTerm)}</textarea>
              </div>
              <div>
                <label class="label text-xs text-muted mb-2 flex items-center gap-1">${iconClock(14)} Mid-term (3-12 months)</label>
                <textarea class="textarea text-sm" rows="4" id="impact-mid" placeholder="Expected impact over 3-12 months...">${escapeHtml(edgeData.impact.midTerm)}</textarea>
              </div>
              <div>
                <label class="label text-xs text-muted mb-2 flex items-center gap-1">${iconClock(14)} Long-term (12+ months)</label>
                <textarea class="textarea text-sm" rows="4" id="impact-long" placeholder="Expected impact after 12 months...">${escapeHtml(edgeData.impact.longTerm)}</textarea>
              </div>
            </div>
          </div>

          <!-- Confidence & Owner -->
          <div class="card p-5">
            <h3 class="font-display font-semibold mb-4 flex items-center gap-2">${iconShield(20, 'text-primary')} Confidence &amp; Ownership</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
              <div>
                <label class="label text-xs text-muted mb-2 block">Confidence Level</label>
                <select class="input" id="confidence-select">
                  <option value="">Select confidence level</option>
                  <option value="high" ${edgeData.confidence === 'high' ? 'selected' : ''}>High - Strong evidence</option>
                  <option value="medium" ${edgeData.confidence === 'medium' ? 'selected' : ''}>Medium - Some uncertainty</option>
                  <option value="low" ${edgeData.confidence === 'low' ? 'selected' : ''}>Low - Significant unknowns</option>
                </select>
              </div>
              <div>
                <label class="label text-xs text-muted mb-2 flex items-center gap-1">${iconUser(14)} Edge Owner</label>
                <input class="input" id="owner-input" placeholder="Who owns this Edge definition?" value="${escapeHtml(edgeData.owner)}" />
              </div>
            </div>
          </div>

          ${!c.valid ? `
          <div class="card p-4" style="border-color:hsl(var(--warning)/0.3);background:hsl(var(--warning-soft))">
            <div class="flex items-start gap-3">
              ${iconAlertCircle(20, 'text-warning')}
              <div>
                <p class="font-medium" style="color:hsl(var(--warning))">Complete all required fields to proceed</p>
                <ul class="text-sm mt-1" style="color:hsl(var(--warning)/0.8)">
                  ${!c.hasOutcomes ? '<li>• Add at least one business outcome</li>' : ''}
                  ${c.hasOutcomes && !c.allMetrics ? '<li>• Add at least one metric to each outcome</li>' : ''}
                  ${!c.hasImpact ? '<li>• Describe expected impact</li>' : ''}
                  ${!c.hasOwner ? '<li>• Assign an owner</li>' : ''}
                </ul>
              </div>
            </div>
          </div>` : ''}
        </div>
      </div>
    </div>`;
}

function syncFormData() {
  edgeData.impact.shortTerm = ($('#impact-short') as HTMLTextAreaElement)?.value || '';
  edgeData.impact.midTerm = ($('#impact-mid') as HTMLTextAreaElement)?.value || '';
  edgeData.impact.longTerm = ($('#impact-long') as HTMLTextAreaElement)?.value || '';
  edgeData.confidence = ($('#confidence-select') as HTMLSelectElement)?.value || '';
  edgeData.owner = ($('#owner-input') as HTMLInputElement)?.value || '';
  document.querySelectorAll<HTMLInputElement>('[data-outcome-desc]').forEach(inp => {
    const oId = inp.getAttribute('data-outcome-desc')!;
    const outcome = edgeData.outcomes.find(o => o.id === oId);
    if (outcome) outcome.description = inp.value;
  });
  document.querySelectorAll<HTMLInputElement>('[data-metric]').forEach(inp => {
    const parts = (inp.getAttribute('data-metric') || '').split('|');
    const [oId, mId, field] = [parts[0]!, parts[1]!, parts[2]!];
    const outcome = edgeData.outcomes.find(o => o.id === oId);
    const metric = outcome?.metrics.find(m => m.id === mId);
    if (metric && field in metric) metric[field] = inp.value;
  });
}

function rerender(ideaId: string) {
  const container = $('#edge-content');
  if (container) { container.innerHTML = renderEdgePage(ideaId); bindEdgeEvents(ideaId); }
}

function bindEdgeEvents(ideaId: string) {
  $('#back-btn')?.addEventListener('click', () => navigateTo('ideas'));

  $('#add-outcome')?.addEventListener('click', () => {
    syncFormData();
    edgeData.outcomes.push({ id: `o${nextId++}`, description: '', metrics: [] });
    rerender(ideaId);
  });

  document.querySelectorAll<HTMLElement>('[data-add-template]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormData();
      edgeData.outcomes.push({ id: `o${nextId++}`, description: btn.getAttribute('data-add-template') || '', metrics: [] });
      rerender(ideaId);
    });
  });

  document.querySelectorAll<HTMLElement>('[data-remove-outcome]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormData();
      edgeData.outcomes = edgeData.outcomes.filter(o => o.id !== btn.getAttribute('data-remove-outcome'));
      rerender(ideaId);
    });
  });

  document.querySelectorAll<HTMLElement>('[data-add-metric]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormData();
      const oId = btn.getAttribute('data-add-metric')!;
      const outcome = edgeData.outcomes.find(o => o.id === oId);
      if (outcome) outcome.metrics.push({ id: `m${nextId++}`, name: '', target: '', unit: '' });
      rerender(ideaId);
    });
  });

  document.querySelectorAll<HTMLElement>('[data-remove-metric]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormData();
      const [oId, mId] = (btn.getAttribute('data-remove-metric') || '').split('|');
      const outcome = edgeData.outcomes.find(o => o.id === oId);
      if (outcome) outcome.metrics = outcome.metrics.filter(m => m.id !== mId);
      rerender(ideaId);
    });
  });

  $('#save-edge')?.addEventListener('click', () => {
    syncFormData();
    if (!getCompletion().valid) { showToast('Please complete all required fields', 'error'); return; }
    showToast('Edge data saved successfully', 'success');
    navigateTo('approval-detail', { id: ideaId });
  });
}

export async function init(params?: Record<string, string>): Promise<void> {
  const ideaId = params?.ideaId || '1';
  const container = $('#edge-content');
  if (container) container.innerHTML = renderSkeleton('detail');

  try {
    currentIdea = await getEdgeIdea(ideaId);
  } catch {
    if (container) {
      container.innerHTML = renderError('Failed to load Edge definition.');
      container.querySelector('[data-retry-btn]')?.addEventListener('click', () => init(params));
    }
    return;
  }

  edgeData = { outcomes: [], impact: { shortTerm: '', midTerm: '', longTerm: '' }, confidence: '', owner: 'Sarah Chen' };
  nextId = 1;
  rerender(ideaId);
}
