import {
  $, showToast, navigateTo, html, setHtml, type SafeHtml, trusted,
  iconArrowLeft, iconTarget, iconTrendingUp, iconShield, iconPlus,
  iconTrash, iconCheck, iconAlertCircle, iconClock, iconUser, iconSave,
  buildSkeleton, buildErrorState,
} from '../../site/script';
import { getIdeaForEdge, getEdgeDataByIdeaId, type EdgeIdea } from '../../site/data';

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
let currentIdea: EdgeIdea | null = null;

function computeCompletionStatus() {
  const hasOutcomes = edgeData.outcomes.length > 0;
  const allOutcomesHaveMetrics = hasOutcomes && edgeData.outcomes.every(outcome => outcome.metrics.length > 0);
  const hasImpact = !!(edgeData.impact.shortTerm || edgeData.impact.midTerm || edgeData.impact.longTerm);
  const hasOwner = edgeData.owner.trim() !== '';
  const hasConfidence = edgeData.confidence !== '';
  const completionPercent = [hasOutcomes, allOutcomesHaveMetrics, hasImpact, hasOwner, hasConfidence].filter(Boolean).length * 20;
  const isComplete = hasOutcomes && allOutcomesHaveMetrics && hasImpact && hasOwner;
  return { hasOutcomes, allOutcomesHaveMetrics, hasImpact, hasOwner, hasConfidence, completionPercent, isComplete };
}

function buildCompletionIcon(satisfied: boolean): SafeHtml {
  return satisfied
    ? html`<span style="color:hsl(var(--success))">${iconCheck(14)}</span>`
    : html`<span style="color:hsl(var(--muted-foreground))">${iconAlertCircle(14)}</span>`;
}

function buildEdgePage(ideaId: string): SafeHtml {
  const idea = currentIdea!;
  const completion = computeCompletionStatus();
  const statusLabel = completion.isComplete ? 'Complete' : completion.completionPercent > 0 ? 'In Progress' : 'Incomplete';
  const statusClassName = completion.isComplete ? 'badge-success' : completion.completionPercent > 0 ? 'badge-warning' : 'badge-error';

  const outcomesHtml = edgeData.outcomes.length === 0
    ? html`<div class="text-center p-8" style="border:2px dashed hsl(var(--border));border-radius:var(--radius-lg)">
        ${iconTarget(40, 'text-muted')}
        <p class="text-sm text-muted mb-4 mt-3">No outcomes defined yet</p>
        <div class="flex flex-wrap justify-center gap-2">
          ${outcomeTemplates.map(template => html`<button class="btn btn-outline btn-sm text-xs" data-add-template="${template}">${template}</button>`)}
        </div>
      </div>`
    : html`${edgeData.outcomes.map((outcome, idx) => html`
      <div class="p-4 rounded-lg" style="background:hsl(var(--muted)/0.3);border:1px solid hsl(var(--border))">
        <div class="flex items-start gap-3 mb-3">
          <div style="width:1.5rem;height:1.5rem;border-radius:9999px;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:600;color:hsl(var(--primary));flex-shrink:0">${idx + 1}</div>
          <input class="input" style="flex:1" value="${outcome.description}" placeholder="Describe the business outcome..." data-outcome-description="${outcome.id}" />
          <button class="btn btn-ghost btn-icon btn-sm" data-remove-outcome="${outcome.id}">${iconTrash(16)}</button>
        </div>
        <div style="padding-left:2.25rem">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-muted">Success Metrics</span>
            <button class="btn btn-ghost btn-xs gap-1" data-add-metric="${outcome.id}">${iconPlus(12)} Add Metric</button>
          </div>
          ${outcome.metrics.length === 0
            ? html`<p class="text-xs text-muted" style="font-style:italic">Add at least one metric to measure this outcome</p>`
            : html`${outcome.metrics.map(metric => html`
              <div class="p-2 rounded mb-2" style="background:hsl(var(--background));border:1px solid hsl(var(--border))">
                <div class="flex items-center gap-2">
                  <input class="input" style="flex:1;height:2rem;font-size:0.875rem" value="${metric.name}" placeholder="Metric name" data-outcome-id="${outcome.id}" data-metric-id="${metric.id}" data-metric-field="name" />
                  <input class="input" style="width:5rem;height:2rem;font-size:0.875rem" value="${metric.target}" placeholder="Target" data-outcome-id="${outcome.id}" data-metric-id="${metric.id}" data-metric-field="target" />
                  <input class="input" style="width:4rem;height:2rem;font-size:0.875rem" value="${metric.unit}" placeholder="Unit" data-outcome-id="${outcome.id}" data-metric-id="${metric.id}" data-metric-field="unit" />
                  <button class="btn btn-ghost btn-icon btn-xs" data-action="remove-metric" data-outcome-id="${outcome.id}" data-metric-id="${metric.id}">${iconTrash(14)}</button>
                </div>
              </div>`)}`}
        </div>
      </div>`)}`;

  return html`
    <div>
      <div class="flex items-center justify-between gap-4 mb-6">
        <div class="flex items-center gap-4">
          <button class="btn btn-ghost btn-icon" id="edge-back-btn">${iconArrowLeft(20)}</button>
          <div>
            <div class="badge badge-primary text-sm mb-2">${iconTarget(14)} Business Case Definition</div>
            <div class="flex items-center gap-3 mb-1">
              <h1 class="text-2xl font-display font-bold">Edge</h1>
              <span class="badge ${statusClassName}">${statusLabel}</span>
            </div>
            <p class="text-sm text-muted">Define outcomes, metrics, and expected impact</p>
          </div>
        </div>
        <button class="btn btn-hero gap-2" id="edge-save-btn" ${trusted(completion.isComplete ? '' : 'disabled')}>
          ${iconSave(16)} Save &amp; Continue
        </button>
      </div>

      <!-- Progress -->
      <div class="card p-4 mb-6">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium">Completion</span>
          <span class="text-sm text-muted">${completion.completionPercent}%</span>
        </div>
        <div class="progress"><div class="progress-fill" style="width:${completion.completionPercent}%"></div></div>
        <div class="flex flex-wrap gap-3 mt-3">
          <div class="flex items-center gap-1 text-xs">${buildCompletionIcon(completion.hasOutcomes)} <span class="${completion.hasOutcomes ? 'text-success' : 'text-muted'}">Outcomes</span></div>
          <div class="flex items-center gap-1 text-xs">${buildCompletionIcon(completion.allOutcomesHaveMetrics && completion.hasOutcomes)} <span class="${completion.allOutcomesHaveMetrics && completion.hasOutcomes ? 'text-success' : 'text-muted'}">Metrics</span></div>
          <div class="flex items-center gap-1 text-xs">${buildCompletionIcon(completion.hasImpact)} <span class="${completion.hasImpact ? 'text-success' : 'text-muted'}">Impact</span></div>
          <div class="flex items-center gap-1 text-xs">${buildCompletionIcon(completion.hasOwner)} <span class="${completion.hasOwner ? 'text-success' : 'text-muted'}">Owner</span></div>
        </div>
      </div>

      <div class="edge-grid">
        <!-- Left: Idea Summary -->
        <div>
          <div class="card p-5" style="position:sticky;top:1.5rem">
            <h3 class="font-display font-semibold mb-4 flex items-center gap-2">${iconTarget(20, 'text-primary')} Linked Idea</h3>
            <h4 class="font-medium mb-1">${idea.title}</h4>
            <p class="text-xs text-muted mb-4">Score: ${idea.score}</p>
            <p class="text-xs text-muted mb-1">Problem</p>
            <p class="text-sm mb-3">${idea.problem}</p>
            <p class="text-xs text-muted mb-1">Solution</p>
            <p class="text-sm mb-3">${idea.solution}</p>
            <div style="padding-top:0.75rem;border-top:1px solid hsl(var(--border))">
              <p class="text-xs text-muted mb-1">Submitted by</p>
              <p class="text-sm">${idea.submittedBy}</p>
            </div>
          </div>
        </div>

        <!-- Right: Edge Form -->
        <div style="display:flex;flex-direction:column;gap:1.5rem">
          <!-- Outcomes -->
          <div class="card p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-display font-semibold flex items-center gap-2">${iconTarget(20, 'text-primary')} Business Outcomes</h3>
              <button class="btn btn-outline btn-sm gap-1" id="edge-add-outcome">${iconPlus(16)} Add Outcome</button>
            </div>
            <div id="edge-outcomes">${outcomesHtml}</div>
          </div>

          <!-- Impact -->
          <div class="card p-5">
            <h3 class="font-display font-semibold mb-4 flex items-center gap-2">${iconTrendingUp(20, 'text-primary')} Expected Impact</h3>
            <div class="impact-grid">
              <div>
                <label class="label text-xs text-muted mb-2 flex items-center gap-1">${iconClock(14)} Short-term (0-3 months)</label>
                <textarea class="textarea text-sm" rows="4" id="edge-impact-short-term" placeholder="Expected impact in the first 3 months...">${edgeData.impact.shortTerm}</textarea>
              </div>
              <div>
                <label class="label text-xs text-muted mb-2 flex items-center gap-1">${iconClock(14)} Mid-term (3-12 months)</label>
                <textarea class="textarea text-sm" rows="4" id="edge-impact-mid-term" placeholder="Expected impact over 3-12 months...">${edgeData.impact.midTerm}</textarea>
              </div>
              <div>
                <label class="label text-xs text-muted mb-2 flex items-center gap-1">${iconClock(14)} Long-term (12+ months)</label>
                <textarea class="textarea text-sm" rows="4" id="edge-impact-long-term" placeholder="Expected impact after 12 months...">${edgeData.impact.longTerm}</textarea>
              </div>
            </div>
          </div>

          <!-- Confidence & Owner -->
          <div class="card p-5">
            <h3 class="font-display font-semibold mb-4 flex items-center gap-2">${iconShield(20, 'text-primary')} Confidence &amp; Ownership</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
              <div>
                <label class="label text-xs text-muted mb-2 block">Confidence Level</label>
                <select class="input" id="edge-confidence-select">
                  <option value="">Select confidence level</option>
                  <option value="high" ${trusted(edgeData.confidence === 'high' ? 'selected' : '')}>High - Strong evidence</option>
                  <option value="medium" ${trusted(edgeData.confidence === 'medium' ? 'selected' : '')}>Medium - Some uncertainty</option>
                  <option value="low" ${trusted(edgeData.confidence === 'low' ? 'selected' : '')}>Low - Significant unknowns</option>
                </select>
              </div>
              <div>
                <label class="label text-xs text-muted mb-2 flex items-center gap-1">${iconUser(14)} Edge Owner</label>
                <input class="input" id="edge-owner-input" placeholder="Who owns this Edge definition?" value="${edgeData.owner}" />
              </div>
            </div>
          </div>

          ${!completion.isComplete ? html`
          <div class="card p-4" style="border-color:hsl(var(--warning)/0.3);background:hsl(var(--warning-soft))">
            <div class="flex items-start gap-3">
              ${iconAlertCircle(20, 'text-warning')}
              <div>
                <p class="font-medium" style="color:hsl(var(--warning))">Complete all required fields to proceed</p>
                <ul class="text-sm mt-1" style="color:hsl(var(--warning)/0.8)">
                  ${!completion.hasOutcomes ? html`<li>• Add at least one business outcome</li>` : html``}
                  ${completion.hasOutcomes && !completion.allOutcomesHaveMetrics ? html`<li>• Add at least one metric to each outcome</li>` : html``}
                  ${!completion.hasImpact ? html`<li>• Describe expected impact</li>` : html``}
                  ${!completion.hasOwner ? html`<li>• Assign an owner</li>` : html``}
                </ul>
              </div>
            </div>
          </div>` : html``}
        </div>
      </div>
    </div>`;
}

function syncFormFields() {
  edgeData.impact.shortTerm = ($('#edge-impact-short-term') as HTMLTextAreaElement)?.value || '';
  edgeData.impact.midTerm = ($('#edge-impact-mid-term') as HTMLTextAreaElement)?.value || '';
  edgeData.impact.longTerm = ($('#edge-impact-long-term') as HTMLTextAreaElement)?.value || '';
  edgeData.confidence = ($('#edge-confidence-select') as HTMLSelectElement)?.value || '';
  edgeData.owner = ($('#edge-owner-input') as HTMLInputElement)?.value || '';
  document.querySelectorAll<HTMLInputElement>('[data-outcome-description]').forEach(descriptionInput => {
    const outcomeId = descriptionInput.getAttribute('data-outcome-description')!;
    const outcome = edgeData.outcomes.find(candidate => candidate.id === outcomeId);
    if (outcome) outcome.description = descriptionInput.value;
  });
  document.querySelectorAll<HTMLInputElement>('[data-metric-field]').forEach(metricInput => {
    const outcomeId = metricInput.getAttribute('data-outcome-id');
    const metricId = metricInput.getAttribute('data-metric-id');
    const field = metricInput.getAttribute('data-metric-field');
    const outcome = edgeData.outcomes.find(candidate => candidate.id === outcomeId);
    const metric = outcome?.metrics.find(candidate => candidate.id === metricId);
    if (metric && field && field in metric) metric[field] = metricInput.value;
  });
}

function mutateEdgePage(ideaId: string) {
  const container = $('#edge-content');
  if (container) { setHtml(container, buildEdgePage(ideaId)); bindEdgeEvents(ideaId); }
}

function bindEdgeEvents(ideaId: string) {
  $('#edge-back-btn')?.addEventListener('click', () => navigateTo('ideas'));

  $('#edge-add-outcome')?.addEventListener('click', () => {
    syncFormFields();
    edgeData.outcomes.push({ id: crypto.randomUUID(), description: '', metrics: [] });
    mutateEdgePage(ideaId);
  });

  document.querySelectorAll<HTMLElement>('[data-add-template]').forEach(templateButton => {
    templateButton.addEventListener('click', () => {
      syncFormFields();
      edgeData.outcomes.push({ id: crypto.randomUUID(), description: templateButton.getAttribute('data-add-template') || '', metrics: [] });
      mutateEdgePage(ideaId);
    });
  });

  document.querySelectorAll<HTMLElement>('[data-remove-outcome]').forEach(removeButton => {
    removeButton.addEventListener('click', () => {
      syncFormFields();
      edgeData.outcomes = edgeData.outcomes.filter(outcome => outcome.id !== removeButton.getAttribute('data-remove-outcome'));
      mutateEdgePage(ideaId);
    });
  });

  document.querySelectorAll<HTMLElement>('[data-add-metric]').forEach(addButton => {
    addButton.addEventListener('click', () => {
      syncFormFields();
      const outcomeId = addButton.getAttribute('data-add-metric')!;
      const outcome = edgeData.outcomes.find(candidate => candidate.id === outcomeId);
      if (outcome) outcome.metrics.push({ id: crypto.randomUUID(), name: '', target: '', unit: '' });
      mutateEdgePage(ideaId);
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="remove-metric"]').forEach(removeButton => {
    removeButton.addEventListener('click', () => {
      syncFormFields();
      const outcomeId = removeButton.getAttribute('data-outcome-id');
      const metricId = removeButton.getAttribute('data-metric-id');
      const outcome = edgeData.outcomes.find(candidate => candidate.id === outcomeId);
      if (outcome) outcome.metrics = outcome.metrics.filter(metric => metric.id !== metricId);
      mutateEdgePage(ideaId);
    });
  });

  $('#edge-save-btn')?.addEventListener('click', () => {
    syncFormFields();
    if (!computeCompletionStatus().isComplete) { showToast('Please complete all required fields', 'error'); return; }
    showToast('Edge data saved successfully', 'success');
    navigateTo('approval-detail', { id: ideaId });
  });
}

export async function init(params?: Record<string, string>): Promise<void> {
  const ideaId = params?.ideaId || '1';
  const container = $('#edge-content');
  if (container) setHtml(container, buildSkeleton('detail'));

  try {
    currentIdea = await getIdeaForEdge(ideaId);
  } catch {
    if (container) {
      setHtml(container, buildErrorState('Failed to load Edge definition.'));
      container.querySelector('[data-retry-btn]')?.addEventListener('click', () => init(params));
    }
    return;
  }

  const saved = await getEdgeDataByIdeaId(ideaId);
  if (saved && saved.outcomes.length > 0) {
    edgeData = { outcomes: saved.outcomes, impact: saved.impact, confidence: saved.confidence, owner: saved.owner };
  } else {
    edgeData = { outcomes: [], impact: { shortTerm: '', midTerm: '', longTerm: '' }, confidence: '', owner: 'Sarah Chen' };
  }
  mutateEdgePage(ideaId);
}
