import {
  $, escapeHtml, showToast, navigateTo,
  iconGitBranch, iconPlus, iconTrash, iconCheck, iconUsers, iconClock,
  iconChevronRight, iconChevronDown, iconChevronUp, iconGripVertical,
  iconShare, iconDownload, iconEye, iconEdit, iconFileText, iconMail,
  iconDatabase, iconGlobe, iconPhone, iconMessageSquare, iconFolderOpen,
  renderSkeleton, renderError, renderEmpty,
} from '../../site/script';
import { getFlowData, type ProcessStep, type FlowData } from '../../site/data';

const toolIcons: Record<string, (s?: number, c?: string) => string> = {
  Email: iconMail, Database: iconDatabase, Website: iconGlobe,
  Phone: iconPhone, Chat: iconMessageSquare, Files: iconFolderOpen, Document: iconFileText,
};

let processSteps: ProcessStep[] = [];
let processName = '';
let processDescription = '';
let processDepartment = '';
let viewMode: 'edit' | 'preview' = 'edit';
let expandedStepId: string | null = null;

function stepTypeColor(type: string): string {
  switch (type) {
    case 'start': return 'background:hsl(142 71% 45%/0.1);border:2px solid hsl(142 71% 45%/0.3);color:hsl(142 71% 45%)';
    case 'end': return 'background:hsl(var(--error)/0.1);border:2px solid hsl(var(--error)/0.3);color:hsl(var(--error))';
    case 'decision': return 'background:hsl(var(--warning)/0.1);border:2px solid hsl(var(--warning)/0.3);color:hsl(var(--warning))';
    default: return 'background:hsl(var(--primary)/0.1);border:2px solid hsl(var(--primary)/0.3);color:hsl(var(--primary))';
  }
}

function syncFormFields(): void {
  const n = $('#flow-name') as HTMLInputElement;
  const d = $('#flow-desc') as HTMLTextAreaElement;
  const dept = $('#flow-dept') as HTMLSelectElement;
  if (n) processName = n.value;
  if (d) processDescription = d.value;
  if (dept) processDepartment = dept.value;

  processSteps.forEach(step => {
    const title = $(`[data-step-field="${step.id}:title"]`) as HTMLInputElement;
    const desc = $(`[data-step-field="${step.id}:description"]`) as HTMLTextAreaElement;
    const owner = $(`[data-step-field="${step.id}:owner"]`) as HTMLInputElement;
    const role = $(`[data-step-field="${step.id}:role"]`) as HTMLInputElement;
    const dur = $(`[data-step-field="${step.id}:duration"]`) as HTMLInputElement;
    const type = $(`[data-step-field="${step.id}:type"]`) as HTMLSelectElement;
    if (title) step.title = title.value;
    if (desc) step.description = desc.value;
    if (owner) step.owner = owner.value;
    if (role) step.role = role.value;
    if (dur) step.duration = dur.value;
    if (type) step.type = type.value as ProcessStep['type'];
  });
}

function renderEditMode(): string {
  return `
    <div style="display:flex;flex-direction:column;gap:0.75rem">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-display font-semibold">Process Steps</h2>
        <span class="text-sm text-muted">${processSteps.length} steps</span>
      </div>
      ${processSteps.map((step, i) => {
        const expanded = expandedStepId === step.id;
        return `
          <div style="position:relative">
            ${i < processSteps.length - 1 ? '<div style="position:absolute;left:1.5rem;top:100%;width:2px;height:0.75rem;background:hsl(var(--border));z-index:0"></div>' : ''}
            <div class="card" style="${expanded ? 'box-shadow:0 0 0 2px hsl(var(--primary))' : ''};overflow:hidden">
              <div style="padding:1rem;cursor:pointer" data-step-header="${step.id}">
                <div class="flex items-center gap-3">
                  <div class="hidden-mobile text-muted" style="cursor:grab">${iconGripVertical(16)}</div>
                  <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;${stepTypeColor(step.type)}">
                    <span class="text-sm font-bold">${i + 1}</span>
                  </div>
                  <div style="flex:1;min-width:0">
                    <div class="flex flex-wrap items-center gap-2 mb-0.5">
                      <span class="font-medium text-sm" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${step.title || 'Untitled Step'}</span>
                      ${!step.title ? '<span style="font-size:0.625rem;padding:0.125rem 0.5rem;border-radius:9999px;background:hsl(var(--warning)/0.1);color:hsl(var(--warning));border:1px solid hsl(var(--warning)/0.2)">Needs info</span>' : ''}
                    </div>
                    ${step.owner ? `<div class="flex items-center gap-2 text-xs text-muted">${iconUsers(12)} <span>${escapeHtml(step.owner)}</span>${step.duration ? ` <span class="hidden-mobile">•</span> ${iconClock(12)} <span class="hidden-mobile">${step.duration}</span>` : ''}</div>` : ''}
                  </div>
                  <div class="flex items-center gap-1">
                    <button class="btn btn-ghost btn-icon btn-sm" data-move-step="${step.id}:up" ${i === 0 ? 'disabled' : ''}>${iconChevronUp(16)}</button>
                    <button class="btn btn-ghost btn-icon btn-sm" data-move-step="${step.id}:down" ${i === processSteps.length - 1 ? 'disabled' : ''}>${iconChevronDown(16)}</button>
                    <button class="btn btn-ghost btn-icon btn-sm" data-remove-step="${step.id}" style="color:hsl(var(--error))">${iconTrash(16)}</button>
                    ${expanded ? iconChevronDown(20, 'text-muted') : iconChevronRight(20, 'text-muted')}
                  </div>
                </div>
              </div>
              ${expanded ? `
                <div style="padding:0 1rem 1rem;border-top:1px solid hsl(var(--border));padding-top:1rem;background:hsl(var(--muted)/0.2)">
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem" class="convert-grid">
                    <div style="grid-column:span 2"><label class="label mb-1 text-xs">What happens in this step?</label><input class="input" data-step-field="${step.id}:title" value="${escapeHtml(step.title)}" placeholder="e.g., Review and approve customer application"/></div>
                    <div style="grid-column:span 2"><label class="label mb-1 text-xs">Describe this step in detail</label><textarea class="textarea" data-step-field="${step.id}:description" style="resize:none" placeholder="Explain what needs to happen...">${escapeHtml(step.description)}</textarea></div>
                    <div><label class="label mb-1 text-xs">Who is responsible?</label><input class="input" data-step-field="${step.id}:owner" value="${escapeHtml(step.owner)}" placeholder="e.g., Customer Success Team"/></div>
                    <div><label class="label mb-1 text-xs">Specific Role</label><input class="input" data-step-field="${step.id}:role" value="${escapeHtml(step.role)}" placeholder="e.g., Account Manager"/></div>
                    <div><label class="label mb-1 text-xs">How long does this take?</label><input class="input" data-step-field="${step.id}:duration" value="${escapeHtml(step.duration)}" placeholder="e.g., 30 minutes"/></div>
                    <div><label class="label mb-1 text-xs">Step Type</label>
                      <select class="input" data-step-field="${step.id}:type">
                        <option value="start" ${step.type === 'start' ? 'selected' : ''}>Start</option>
                        <option value="action" ${step.type === 'action' ? 'selected' : ''}>Action</option>
                        <option value="decision" ${step.type === 'decision' ? 'selected' : ''}>Decision</option>
                        <option value="end" ${step.type === 'end' ? 'selected' : ''}>End</option>
                      </select>
                    </div>
                    <div style="grid-column:span 2">
                      <label class="label mb-1 text-xs">Tools Used</label>
                      <div class="flex flex-wrap gap-1.5">
                        ${Object.entries(toolIcons).map(([name, iconFn]) => {
                          const selected = step.tools.includes(name);
                          return `<button data-toggle-tool="${step.id}:${name}" style="display:flex;align-items:center;gap:0.375rem;padding:0.25rem 0.75rem;border-radius:0.5rem;font-size:0.75rem;border:none;cursor:pointer;${selected ? 'background:hsl(var(--primary));color:hsl(var(--primary-foreground))' : 'background:hsl(var(--muted));color:hsl(var(--muted-foreground))'}">${iconFn(14)} ${name}</button>`;
                        }).join('')}
                      </div>
                    </div>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>`;
      }).join('')}
      <button class="btn btn-outline gap-2" style="width:100%;border-style:dashed" id="flow-add-step">${iconPlus(16)} Add Step</button>
    </div>`;
}

function renderPreviewMode(): string {
  return `
    <div style="display:flex;flex-direction:column;gap:1.5rem">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-display font-semibold">${escapeHtml(processName)}</h2>
        <div class="flex items-center gap-2">
          <button class="btn btn-outline btn-sm gap-2">${iconShare(14)} Share</button>
          <button class="btn btn-outline btn-sm gap-2">${iconDownload(14)} Export</button>
        </div>
      </div>
      <p class="text-sm text-muted">${escapeHtml(processDescription)}</p>
      <div style="position:relative;padding-left:1.5rem">
        <div style="position:absolute;left:0.75rem;top:0;bottom:0;width:2px;background:hsl(var(--border))"></div>
        ${processSteps.map((step, i) => `
          <div style="position:relative;padding-bottom:${i < processSteps.length - 1 ? '2rem' : '0'}">
            <div style="position:absolute;left:0;width:1.5rem;height:1.5rem;border-radius:9999px;display:flex;align-items:center;justify-content:center;transform:translateX(calc(-50% - 1px));${stepTypeColor(step.type)};background:hsl(var(--background))">
              <span style="font-size:0.625rem;font-weight:700">${i + 1}</span>
            </div>
            <div class="card" style="margin-left:1.5rem;padding:1rem">
              <h4 class="font-medium text-sm mb-1">${escapeHtml(step.title)}</h4>
              <p class="text-xs text-muted mb-2">${escapeHtml(step.description)}</p>
              <div class="flex flex-wrap items-center gap-3 text-xs text-muted">
                <span class="flex items-center gap-1">${iconUsers(12)} ${escapeHtml(step.owner)} (${escapeHtml(step.role)})</span>
                <span class="flex items-center gap-1">${iconClock(12)} ${step.duration}</span>
              </div>
              ${step.tools.length ? `
                <div class="flex flex-wrap gap-1.5" style="margin-top:0.75rem">
                  ${step.tools.map(t => `<span class="flex items-center gap-1" style="padding:0.125rem 0.5rem;border-radius:0.25rem;background:hsl(var(--muted));font-size:0.625rem;color:hsl(var(--muted-foreground))">${toolIcons[t]?.(12) || ''} ${t}</span>`).join('')}
                </div>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function renderPage(): string {
  const deptOptions = ['Sales', 'Customer Success', 'Engineering', 'Operations', 'Finance', 'HR'];
  return `
    <div style="max-width:64rem;margin:0 auto">
      <div class="flex items-start justify-between gap-4 mb-6">
        <div>
          <div class="badge badge-primary text-sm mb-3">${iconGitBranch(14)} Process Documentation</div>
          <h1 class="text-2xl font-display font-bold mb-1">Flow</h1>
          <p class="text-sm text-muted" style="max-width:32rem">Document your business processes step by step. We'll help you create clear workflows that everyone can understand and follow.</p>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn ${viewMode === 'edit' ? 'btn-primary' : 'btn-outline'} btn-sm gap-2" data-flow-mode="edit">${iconEdit(14)} Edit</button>
          <button class="btn ${viewMode === 'preview' ? 'btn-primary' : 'btn-outline'} btn-sm gap-2" data-flow-mode="preview">${iconEye(14)} Preview</button>
        </div>
      </div>

      <div class="card" style="padding:1.5rem;margin-bottom:1.5rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem" class="convert-grid">
          <div><label class="label mb-1 text-xs">Process Name</label><input class="input" id="flow-name" value="${escapeHtml(processName)}" placeholder="e.g., Customer Onboarding" style="font-size:1.125rem;font-weight:500"/></div>
          <div><label class="label mb-1 text-xs">Department</label>
            <select class="input" id="flow-dept">
              ${deptOptions.map(d => `<option ${d === processDepartment ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>
          <div style="grid-column:span 2"><label class="label mb-1 text-xs">Description</label><textarea class="textarea" id="flow-desc" style="resize:none" placeholder="Briefly describe what this process accomplishes...">${escapeHtml(processDescription)}</textarea></div>
        </div>
      </div>

      ${viewMode === 'edit' ? renderEditMode() : renderPreviewMode()}
    </div>`;
}

function rerender(): void {
  const root = $('#flow-root');
  if (!root) return;
  root.innerHTML = renderPage();
  bindEvents();
}

function bindEvents(): void {
  document.querySelectorAll<HTMLElement>('[data-flow-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormFields();
      viewMode = btn.getAttribute('data-flow-mode') as 'edit' | 'preview';
      rerender();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-step-header]').forEach(el => {
    el.addEventListener('click', () => {
      syncFormFields();
      const id = el.getAttribute('data-step-header');
      expandedStepId = expandedStepId === id ? null : id;
      rerender();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-move-step]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      syncFormFields();
      const [id, dir] = (el.getAttribute('data-move-step') || '').split(':');
      const idx = processSteps.findIndex(s => s.id === id);
      if (idx < 0) return;
      const target = dir === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= processSteps.length) return;
      [processSteps[idx], processSteps[target]] = [processSteps[target]!, processSteps[idx]!];
      rerender();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-remove-step]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      syncFormFields();
      processSteps = processSteps.filter(s => s.id !== el.getAttribute('data-remove-step'));
      rerender();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-toggle-tool]').forEach(el => {
    el.addEventListener('click', () => {
      syncFormFields();
      const parts = (el.getAttribute('data-toggle-tool') || '').split(':');
      const stepId = parts[0]!, tool = parts[1]!;
      const step = processSteps.find(s => s.id === stepId);
      if (!step) return;
      step.tools = step.tools.includes(tool) ? step.tools.filter(t => t !== tool) : [...step.tools, tool];
      rerender();
    });
  });

  $('#flow-add-step')?.addEventListener('click', () => {
    syncFormFields();
    processSteps.push({
      id: Date.now().toString(), title: '', description: '', owner: '', role: '',
      tools: [], duration: '', order: processSteps.length + 1, type: 'action',
    });
    expandedStepId = processSteps[processSteps.length - 1]!.id;
    rerender();
  });
}

export async function init(): Promise<void> {
  const root = $('#flow-root');
  if (root) root.innerHTML = renderSkeleton('card-list', { count: 4 });

  let flowData: FlowData;
  try {
    flowData = await getFlowData();
  } catch {
    if (root) {
      root.innerHTML = renderError('Failed to load process data.');
      root.querySelector('[data-retry-btn]')?.addEventListener('click', () => init());
    }
    return;
  }

  if (flowData.steps.length === 0) {
    if (root) root.innerHTML = renderEmpty(iconGitBranch(24), 'No Process Documented', 'Start documenting your processes to improve visibility and consistency.');
    return;
  }

  processName = flowData.processName;
  processDescription = flowData.processDescription;
  processDepartment = flowData.processDepartment;
  processSteps = flowData.steps;
  viewMode = 'edit';
  expandedStepId = null;
  rerender();
}
