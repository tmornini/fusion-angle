import {
  $, showToast, navigateTo, html, setHtml, type SafeHtml, trusted,
  iconGitBranch, iconPlus, iconTrash, iconCheck, iconUsers, iconClock,
  iconChevronRight, iconChevronDown, iconChevronUp, iconGripVertical,
  iconShare, iconDownload, iconEye, iconEdit, iconFileText, iconMail,
  iconDatabase, iconGlobe, iconPhone, iconMessageSquare, iconFolderOpen,
  buildSkeleton, buildErrorState, buildEmptyState,
} from '../../site/script';
import { getFlow, type ProcessStep, type Flow } from '../../site/data';

const toolIconConfig: Record<string, (size?: number, cssClass?: string) => SafeHtml> = {
  Email: iconMail, Database: iconDatabase, Website: iconGlobe,
  Phone: iconPhone, Chat: iconMessageSquare, Files: iconFolderOpen, Document: iconFileText,
};

let processSteps: ProcessStep[] = [];
let processName = '';
let processDescription = '';
let processDepartment = '';
let viewMode: 'edit' | 'preview' = 'edit';
let expandedStepId: string | null = null;

function styleForStepType(type: string): string {
  switch (type) {
    case 'start': return 'background:hsl(var(--success) / 0.1);border:2px solid hsl(var(--success) / 0.3);color:hsl(var(--success))';
    case 'end': return 'background:hsl(var(--error)/0.1);border:2px solid hsl(var(--error)/0.3);color:hsl(var(--error))';
    case 'decision': return 'background:hsl(var(--warning)/0.1);border:2px solid hsl(var(--warning)/0.3);color:hsl(var(--warning))';
    default: return 'background:hsl(var(--primary)/0.1);border:2px solid hsl(var(--primary)/0.3);color:hsl(var(--primary))';
  }
}

function syncFormFields(): void {
  const nameInput = $('#flow-name') as HTMLInputElement;
  const descriptionInput = $('#flow-description') as HTMLTextAreaElement;
  const dept = $('#flow-department') as HTMLSelectElement;
  if (nameInput) processName = nameInput.value;
  if (descriptionInput) processDescription = descriptionInput.value;
  if (dept) processDepartment = dept.value;

  processSteps.forEach(step => {
    const title = $(`[data-step-id="${step.id}"][data-field-name="title"]`) as HTMLInputElement;
    const descriptionField = $(`[data-step-id="${step.id}"][data-field-name="description"]`) as HTMLTextAreaElement;
    const owner = $(`[data-step-id="${step.id}"][data-field-name="owner"]`) as HTMLInputElement;
    const role = $(`[data-step-id="${step.id}"][data-field-name="role"]`) as HTMLInputElement;
    const durationInput = $(`[data-step-id="${step.id}"][data-field-name="duration"]`) as HTMLInputElement;
    const type = $(`[data-step-id="${step.id}"][data-field-name="type"]`) as HTMLSelectElement;
    if (title) step.title = title.value;
    if (descriptionField) step.description = descriptionField.value;
    if (owner) step.owner = owner.value;
    if (role) step.role = role.value;
    if (durationInput) step.duration = durationInput.value;
    if (type) step.type = type.value as ProcessStep['type'];
  });
}

function buildEditMode(): SafeHtml {
  return html`
    <div style="display:flex;flex-direction:column;gap:0.75rem">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-display font-semibold">Process Steps</h2>
        <span class="text-sm text-muted">${processSteps.length} steps</span>
      </div>
      ${processSteps.map((step, i) => {
        const isExpanded = expandedStepId === step.id;
        return html`
          <div style="position:relative">
            ${i < processSteps.length - 1 ? html`<div style="position:absolute;left:1.5rem;top:100%;width:2px;height:0.75rem;background:hsl(var(--border));z-index:0"></div>` : html``}
            <div class="card" style="${trusted(isExpanded ? 'box-shadow:0 0 0 2px hsl(var(--primary))' : '')};overflow:hidden">
              <div style="padding:1rem;cursor:pointer" data-step-header="${step.id}">
                <div class="flex items-center gap-3">
                  <div class="hidden-mobile text-muted" style="cursor:grab">${iconGripVertical(16)}</div>
                  <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;${trusted(styleForStepType(step.type))}">
                    <span class="text-sm font-bold">${i + 1}</span>
                  </div>
                  <div style="flex:1;min-width:0">
                    <div class="flex flex-wrap items-center gap-2 mb-0.5">
                      <span class="font-medium text-sm" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${step.title || 'Untitled Step'}</span>
                      ${!step.title ? html`<span class="pill" style="background:hsl(var(--warning)/0.1);color:hsl(var(--warning));border:1px solid hsl(var(--warning)/0.2)">Needs info</span>` : html``}
                    </div>
                    ${step.owner ? html`<div class="flex items-center gap-2 text-xs text-muted">${iconUsers(12)} <span>${step.owner}</span>${step.duration ? html` <span class="hidden-mobile">•</span> ${iconClock(12)} <span class="hidden-mobile">${step.duration}</span>` : html``}</div>` : html``}
                  </div>
                  <div class="flex items-center gap-1">
                    <button class="btn btn-ghost btn-icon btn-sm" data-action="move-step" data-step-id="${step.id}" data-direction="up" ${trusted(i === 0 ? 'disabled' : '')}>${iconChevronUp(16)}</button>
                    <button class="btn btn-ghost btn-icon btn-sm" data-action="move-step" data-step-id="${step.id}" data-direction="down" ${trusted(i === processSteps.length - 1 ? 'disabled' : '')}>${iconChevronDown(16)}</button>
                    <button class="btn btn-ghost btn-icon btn-sm" data-remove-step="${step.id}" style="color:hsl(var(--error))">${iconTrash(16)}</button>
                    ${isExpanded ? iconChevronDown(20, 'text-muted') : iconChevronRight(20, 'text-muted')}
                  </div>
                </div>
              </div>
              ${isExpanded ? html`
                <div style="padding:0 1rem 1rem;border-top:1px solid hsl(var(--border));padding-top:1rem;background:hsl(var(--muted)/0.2)">
                  <div class="convert-grid" style="gap:1rem">
                    <div style="grid-column:span 2"><label class="label mb-1 text-xs">What happens in this step?</label><input class="input" data-step-id="${step.id}" data-field-name="title" value="${step.title}" placeholder="e.g., Review and approve customer application"/></div>
                    <div style="grid-column:span 2"><label class="label mb-1 text-xs">Describe this step in detail</label><textarea class="textarea" data-step-id="${step.id}" data-field-name="description" style="resize:none" placeholder="Explain what needs to happen...">${step.description}</textarea></div>
                    <div><label class="label mb-1 text-xs">Who is responsible?</label><input class="input" data-step-id="${step.id}" data-field-name="owner" value="${step.owner}" placeholder="e.g., Customer Success Team"/></div>
                    <div><label class="label mb-1 text-xs">Specific Role</label><input class="input" data-step-id="${step.id}" data-field-name="role" value="${step.role}" placeholder="e.g., Account Manager"/></div>
                    <div><label class="label mb-1 text-xs">How long does this take?</label><input class="input" data-step-id="${step.id}" data-field-name="duration" value="${step.duration}" placeholder="e.g., 30 minutes"/></div>
                    <div><label class="label mb-1 text-xs">Step Type</label>
                      <select class="input" data-step-id="${step.id}" data-field-name="type">
                        <option value="start" ${trusted(step.type === 'start' ? 'selected' : '')}>Start</option>
                        <option value="action" ${trusted(step.type === 'action' ? 'selected' : '')}>Action</option>
                        <option value="decision" ${trusted(step.type === 'decision' ? 'selected' : '')}>Decision</option>
                        <option value="end" ${trusted(step.type === 'end' ? 'selected' : '')}>End</option>
                      </select>
                    </div>
                    <div style="grid-column:span 2">
                      <label class="label mb-1 text-xs">Tools Used</label>
                      <div class="flex flex-wrap gap-1.5">
                        ${Object.entries(toolIconConfig).map(([name, iconFn]) => {
                          const isSelected = step.tools.includes(name);
                          return html`<button data-action="toggle-tool" data-step-id="${step.id}" data-tool-name="${name}" style="display:flex;align-items:center;gap:0.375rem;padding:0.25rem 0.75rem;border-radius:0.5rem;font-size:0.75rem;border:none;cursor:pointer;${trusted(isSelected ? 'background:hsl(var(--primary));color:hsl(var(--primary-foreground))' : 'background:hsl(var(--muted));color:hsl(var(--muted-foreground))')}">${iconFn(14)} ${name}</button>`;
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ` : html``}
            </div>
          </div>`;
      })}
      <button class="btn btn-outline gap-2" style="width:100%;border-style:dashed" id="flow-add-step">${iconPlus(16)} Add Step</button>
    </div>`;
}

function buildPreviewMode(): SafeHtml {
  return html`
    <div style="display:flex;flex-direction:column;gap:1.5rem">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-display font-semibold">${processName}</h2>
        <div class="flex items-center gap-2">
          <button class="btn btn-outline btn-sm gap-2">${iconShare(14)} Share</button>
          <button class="btn btn-outline btn-sm gap-2">${iconDownload(14)} Export</button>
        </div>
      </div>
      <p class="text-sm text-muted">${processDescription}</p>
      <div style="position:relative;padding-left:1.5rem">
        <div style="position:absolute;left:0.75rem;top:0;bottom:0;width:2px;background:hsl(var(--border))"></div>
        ${processSteps.map((step, i) => html`
          <div style="position:relative;padding-bottom:${i < processSteps.length - 1 ? '2rem' : '0'}">
            <div style="position:absolute;left:0;width:1.5rem;height:1.5rem;border-radius:9999px;display:flex;align-items:center;justify-content:center;transform:translateX(calc(-50% - 1px));${trusted(styleForStepType(step.type))};background:hsl(var(--background))">
              <span style="font-size:0.625rem;font-weight:700">${i + 1}</span>
            </div>
            <div class="card" style="margin-left:1.5rem;padding:1rem">
              <h4 class="font-medium text-sm mb-1">${step.title}</h4>
              <p class="text-xs text-muted mb-2">${step.description}</p>
              <div class="flex flex-wrap items-center gap-3 text-xs text-muted">
                <span class="flex items-center gap-1">${iconUsers(12)} ${step.owner} (${step.role})</span>
                <span class="flex items-center gap-1">${iconClock(12)} ${step.duration}</span>
              </div>
              ${step.tools.length ? html`
                <div class="flex flex-wrap gap-1.5" style="margin-top:0.75rem">
                  ${step.tools.map(toolName => html`<span class="pill-tag" style="font-size:0.625rem">${toolIconConfig[toolName]?.(12) || html``} ${toolName}</span>`)}
                </div>
              ` : html``}
            </div>
          </div>
        `)}
      </div>
    </div>`;
}

function buildFlowPage(): SafeHtml {
  const deptOptions = ['Sales', 'Customer Success', 'Engineering', 'Operations', 'Finance', 'HR'];
  return html`
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
        <div class="convert-grid">
          <div><label class="label mb-1 text-xs">Process Name</label><input class="input" id="flow-name" value="${processName}" placeholder="e.g., Customer Onboarding" style="font-size:1.125rem;font-weight:500"/></div>
          <div><label class="label mb-1 text-xs">Department</label>
            <select class="input" id="flow-department">
              ${deptOptions.map(department => html`<option ${trusted(department === processDepartment ? 'selected' : '')}>${department}</option>`)}
            </select>
          </div>
          <div style="grid-column:span 2"><label class="label mb-1 text-xs">Description</label><textarea class="textarea" id="flow-description" style="resize:none" placeholder="Briefly describe what this process accomplishes...">${processDescription}</textarea></div>
        </div>
      </div>

      ${viewMode === 'edit' ? buildEditMode() : buildPreviewMode()}
    </div>`;
}

function mutateFlowPage(): void {
  const root = $('#flow-content');
  if (!root) return;
  setHtml(root, buildFlowPage());
  bindFlowEvents();
}

function bindFlowEvents(): void {
  document.querySelectorAll<HTMLElement>('[data-flow-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      syncFormFields();
      viewMode = btn.getAttribute('data-flow-mode') as 'edit' | 'preview';
      mutateFlowPage();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-step-header]').forEach(el => {
    el.addEventListener('click', () => {
      syncFormFields();
      const id = el.getAttribute('data-step-header');
      expandedStepId = expandedStepId === id ? null : id;
      mutateFlowPage();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="move-step"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      syncFormFields();
      const id = el.getAttribute('data-step-id');
      const dir = el.getAttribute('data-direction');
      const stepIndex = processSteps.findIndex(step => step.id === id);
      if (stepIndex < 0) return;
      const targetIndex = dir === 'up' ? stepIndex - 1 : stepIndex + 1;
      if (targetIndex < 0 || targetIndex >= processSteps.length) return;
      [processSteps[stepIndex], processSteps[targetIndex]] = [processSteps[targetIndex]!, processSteps[stepIndex]!];
      mutateFlowPage();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-remove-step]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      syncFormFields();
      processSteps = processSteps.filter(step => step.id !== el.getAttribute('data-remove-step'));
      mutateFlowPage();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-action="toggle-tool"]').forEach(el => {
    el.addEventListener('click', () => {
      syncFormFields();
      const stepId = el.getAttribute('data-step-id')!;
      const tool = el.getAttribute('data-tool-name')!;
      const step = processSteps.find(candidate => candidate.id === stepId);
      if (!step) return;
      step.tools = step.tools.includes(tool) ? step.tools.filter(toolName => toolName !== tool) : [...step.tools, tool];
      mutateFlowPage();
    });
  });

  $('#flow-add-step')?.addEventListener('click', () => {
    syncFormFields();
    processSteps.push({
      id: crypto.randomUUID(), title: '', description: '', owner: '', role: '',
      tools: [], duration: '', sortOrder: processSteps.length + 1, type: 'action',
    });
    expandedStepId = processSteps[processSteps.length - 1]!.id;
    mutateFlowPage();
  });
}

export async function init(): Promise<void> {
  const root = $('#flow-content');
  if (root) setHtml(root, buildSkeleton('card-list', { count: 4 }));

  let flowData: Flow;
  try {
    flowData = await getFlow();
  } catch {
    if (root) {
      setHtml(root, buildErrorState('Failed to load process data.'));
      root.querySelector('[data-retry-btn]')?.addEventListener('click', () => init());
    }
    return;
  }

  if (flowData.steps.length === 0) {
    if (root) setHtml(root, buildEmptyState(iconGitBranch(24), 'No Process Documented', 'Start documenting your processes to improve visibility and consistency.'));
    return;
  }

  processName = flowData.processName;
  processDescription = flowData.processDescription;
  processDepartment = flowData.processDepartment;
  processSteps = flowData.steps;
  viewMode = 'edit';
  expandedStepId = null;
  mutateFlowPage();
}
