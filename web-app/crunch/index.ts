import { $, $$, $textarea } from '../app/dom';
import { html, setHtml, type SafeHtml, trusted } from '../app/safe-html';
import {
  iconUpload, iconFileSpreadsheet, iconFileText, iconHelpCircle,
  iconCheck, iconChevronRight, iconChevronDown,
  iconSparkles, iconMessageSquare, iconTable, iconHash, iconCalendar,
  iconType, iconToggleLeft,
} from '../app/icons';
import { navigateTo } from '../app/core';
import { buildErrorState } from '../app/loading-states';
import { getCrunchColumns, type CrunchColumn } from '../app/adapters';

let step: 'upload' | 'label' | 'review' = 'upload';
let columns: CrunchColumn[] = [];
let expandedColumnId: string | null = null;
let businessContext = '';

function buildDataTypeIcon(type: string): SafeHtml {
  switch (type) {
    case 'number': return iconHash(16, 'text-muted');
    case 'date': return iconCalendar(16, 'text-muted');
    case 'boolean': return iconToggleLeft(16, 'text-muted');
    default: return iconType(16, 'text-muted');
  }
}

function completionPercent(): number {
  if (!columns.length) return 0;
  const labeledCount = columns.filter(column => column.friendlyName && column.description && (!column.isAcronym || column.acronymExpansion)).length;
  return Math.round((labeledCount / columns.length) * 100);
}

function buildStepIndicator(): SafeHtml {
  const steps = [
    { key: 'upload', label: 'Upload', icon: iconUpload },
    { key: 'label', label: 'Label & Explain', icon: iconMessageSquare },
    { key: 'review', label: 'Review', icon: iconCheck },
  ];
  return html`${steps.map((s, i) => {
    const isActive = s.key === step;
    const isComplete = (step === 'label' && i === 0) || (step === 'review' && i <= 1);
    return html`<div class="flex items-center gap-2" style="flex-shrink:0">
      <div class="flex items-center gap-2" style="padding:0.375rem 1rem;border-radius:9999px;${trusted(isActive ? 'background:hsl(var(--primary));color:hsl(var(--primary-foreground))' : isComplete ? 'background:hsl(var(--success) / 0.1);color:hsl(var(--success));border:1px solid hsl(var(--success) / 0.2)' : 'background:hsl(var(--muted));color:hsl(var(--muted-foreground))')}">
        ${isComplete ? iconCheck(16) : s.icon(16)}
        <span class="text-sm font-medium">${s.label}</span>
      </div>
      ${i < 2 ? iconChevronRight(16, 'text-muted') : html``}
    </div>`;
  })}`;
}

function buildUploadStep(): SafeHtml {
  return html`
    <div style="display:flex;flex-direction:column;gap:1.5rem">
      <div class="card" id="crunch-dropzone" style="padding:3rem;text-align:center;border:2px dashed hsl(var(--border));cursor:pointer">
        <div style="width:4rem;height:4rem;border-radius:1rem;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 1rem">
          ${iconUpload(32, 'text-primary')}
        </div>
        <p class="text-lg font-medium mb-1">Drop your file here or click to browse</p>
        <p class="text-sm text-muted mb-4">Supports Excel (.xlsx, .xls), CSV, and Google Sheets exports</p>
        <div class="flex items-center justify-center gap-4 text-xs text-muted">
          <span class="flex items-center gap-1">${iconFileSpreadsheet(14)} Spreadsheets</span>
          <span class="flex items-center gap-1">${iconFileText(14)} CSV Files</span>
        </div>
      </div>
      <div class="card" style="padding:1.5rem;background:hsl(var(--warning)/0.05);border:1px solid hsl(var(--warning)/0.2)">
        <div class="flex items-start gap-3">
          <div style="width:2.5rem;height:2.5rem;border-radius:0.75rem;background:hsl(var(--warning)/0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0">${iconHelpCircle(20, 'text-warning')}</div>
          <div>
            <h3 class="font-medium text-sm mb-1">What happens next?</h3>
            <p class="text-sm text-muted">After upload, we'll ask you simple questions about each column in your data. You'll tell us what abbreviations mean, what the data represents, and any business rules.</p>
          </div>
        </div>
      </div>
    </div>`;
}

function buildLabelStep(): SafeHtml {
  const percent = completionPercent();
  const labeled = columns.filter(column => column.friendlyName && column.description).length;
  return html`
    <div style="display:flex;flex-direction:column;gap:1.5rem">
      <div class="card" style="padding:1rem">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;background:hsl(var(--success) / 0.1);display:flex;align-items:center;justify-content:center">${iconFileSpreadsheet(20, 'text-success')}</div>
            <div><p class="font-medium text-sm">Q4_Sales_Report.xlsx</p><p class="text-xs text-muted">2.3 MB • 1,247 rows • ${columns.length} columns</p></div>
          </div>
          <div class="flex items-center gap-3">
            <div class="text-right"><p class="text-sm font-medium">${percent}% complete</p><p class="text-xs text-muted">${labeled} of ${columns.length} ${columns.length === 1 ? 'column' : 'columns'} labeled</p></div>
            <div style="width:6rem"><div class="progress" style="height:0.5rem"><div class="progress-fill" style="width:${percent}%"></div></div></div>
          </div>
        </div>
      </div>

      <div class="card" style="padding:1.5rem">
        <div class="flex items-start gap-3 mb-4">
          ${iconSparkles(20, 'text-primary')}
          <div><h3 class="font-medium text-sm">What is this data about?</h3><p class="text-xs text-muted">Give us some context to help understand your business data better.</p></div>
        </div>
        <textarea class="textarea" id="crunch-context" placeholder="Example: This is our quarterly sales report..." style="min-height:5rem;resize:none">${businessContext}</textarea>
      </div>

      <div style="display:flex;flex-direction:column;gap:0.75rem">
        <h3 class="font-medium">Help us understand each column</h3>
        ${columns.map(column => {
          const isExpanded = expandedColumnId === column.id;
          const isColumnLabeled = column.friendlyName && column.description && (!column.isAcronym || column.acronymExpansion);
          return html`
            <div class="card" style="${trusted(isColumnLabeled ? 'border-color:hsl(var(--success) / 0.3);background:hsl(var(--success) / 0.03)' : '')};overflow:hidden">
              <div style="padding:1rem;cursor:pointer" data-column-toggle="${column.id}">
                <div class="flex items-center gap-3">
                  <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;display:flex;align-items:center;justify-content:center;${trusted(isColumnLabeled ? 'background:hsl(var(--success) / 0.1)' : 'background:hsl(var(--muted))')}">${isColumnLabeled ? iconCheck(20, 'text-success') : buildDataTypeIcon(column.dataType)}</div>
                  <div style="flex:1;min-width:0">
                    <div class="flex flex-wrap items-center gap-2">
                      <code style="font-size:0.75rem;background:hsl(var(--muted));padding:0.125rem 0.5rem;border-radius:0.25rem">${column.originalName}</code>
                      ${column.isAcronym ? html`<span class="pill" style="background:hsl(var(--warning)/0.1);color:hsl(var(--warning));border:1px solid hsl(var(--warning)/0.2)">Acronym</span>` : html``}
                    </div>
                    <p class="text-sm text-muted" style="margin-top:0.25rem">${column.friendlyName || 'Click to label this column'}</p>
                  </div>
                  <div class="flex items-center gap-3">
                    <div class="text-right hidden-mobile"><p class="text-xs text-muted">Sample values</p><p class="text-sm">${column.sampleValues.slice(0, 2).join(', ')}</p></div>
                    ${isExpanded ? iconChevronDown(20, 'text-muted') : iconChevronRight(20, 'text-muted')}
                  </div>
                </div>
              </div>
              ${isExpanded ? html`
                <div style="padding:0 1rem 1rem;border-top:1px solid hsl(var(--border));padding-top:1rem;background:hsl(var(--muted)/0.2)">
                  <div class="convert-grid" style="gap:1rem">
                    <div><label class="label mb-1 text-xs">What would you call this column?</label><input class="input" data-column-id="${column.id}" data-field-name="friendlyName" placeholder="e.g., Customer ID" value="${column.friendlyName}"/></div>
                    <div><label class="label mb-1 text-xs">Data type</label>
                      <select class="input" data-column-id="${column.id}" data-field-name="dataType">
                        <option value="text" ${trusted(column.dataType === 'text' ? 'selected' : '')}>Text</option>
                        <option value="number" ${trusted(column.dataType === 'number' ? 'selected' : '')}>Number</option>
                        <option value="date" ${trusted(column.dataType === 'date' ? 'selected' : '')}>Date</option>
                        <option value="boolean" ${trusted(column.dataType === 'boolean' ? 'selected' : '')}>Yes/No</option>
                      </select>
                    </div>
                  </div>
                  ${column.isAcronym ? html`<div style="margin-top:1rem"><label class="label mb-1 text-xs">What does "${column.originalName}" stand for?</label><input class="input" data-column-id="${column.id}" data-field-name="acronymExpansion" placeholder="e.g., Customer Identifier" value="${column.acronymExpansion}"/></div>` : html``}
                  <div style="margin-top:1rem"><label class="label mb-1 text-xs">Describe what this column contains</label><textarea class="textarea" data-column-id="${column.id}" data-field-name="description" placeholder="e.g., A unique identifier assigned to each customer..." style="resize:none" rows="2">${column.description}</textarea></div>
                </div>
              ` : html``}
            </div>`;
        })}
      </div>

      <div class="flex items-center justify-between" style="padding-top:1rem">
        <button class="btn btn-ghost" id="crunch-back-upload">Upload Different File</button>
        <button class="btn btn-primary gap-2" id="crunch-to-review" ${trusted(percent < 100 ? 'disabled' : '')}>Continue to Review ${iconChevronRight(16)}</button>
      </div>
    </div>`;
}

function buildReviewStep(): SafeHtml {
  return html`
    <div class="card" style="padding:2rem;text-align:center">
      <div style="width:4rem;height:4rem;border-radius:1rem;background:hsl(var(--success) / 0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem">
        ${iconCheck(32, 'text-success')}
      </div>
      <h2 class="text-2xl font-display font-bold mb-2">Data Translation Complete</h2>
      <p class="text-sm text-muted mb-8" style="max-width:28rem;margin-left:auto;margin-right:auto">Your data has been processed and is ready to use. All columns have been labeled and documented.</p>
      <div class="flex items-center justify-center gap-3">
        <button class="btn btn-outline" id="crunch-edit-labels">Edit Labels</button>
        <button class="btn btn-primary" id="crunch-to-dashboard">Continue to Dashboard</button>
      </div>
    </div>`;
}

function syncFormFields(): void {
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-column-id][data-field-name]').forEach(el => {
    const columnId = el.getAttribute('data-column-id');
    const field = el.getAttribute('data-field-name');
    const column = columns.find(candidate => candidate.id === columnId);
    if (column && field) {
      const columnKey = field as keyof CrunchColumn;
      if (columnKey === 'friendlyName' || columnKey === 'description' || columnKey === 'dataType' || columnKey === 'acronymExpansion') column[columnKey] = el.value;
      else if (columnKey === 'isAcronym') column[columnKey] = el.value === 'true';
    }
  });
  const contextField = $textarea('#crunch-context');
  if (contextField) businessContext = contextField.value;
}

function buildCrunchPage(): SafeHtml {
  return html`
    <div style="max-width:56rem;margin:0 auto">
      <div style="margin-bottom:2rem">
        <div class="badge badge-primary text-sm mb-3">${iconTable(14)} Data Translation Tool</div>
        <h1 class="text-2xl font-display font-bold mb-1">Crunch</h1>
        <p class="text-sm text-muted" style="max-width:32rem">Upload your business data and help us understand it. We'll guide you through labeling columns, explaining acronyms, and defining what everything means in plain language.</p>
      </div>

      <div class="flex items-center justify-center gap-3 mb-8" style="overflow-x:auto;padding-bottom:0.5rem">
        ${buildStepIndicator()}
      </div>

      ${step === 'upload' ? buildUploadStep() : step === 'label' ? buildLabelStep() : buildReviewStep()}
    </div>`;
}

let mockColumns: CrunchColumn[] = [];

function mutateCrunchPage(): void {
  const root = $('#crunch-content');
  if (!root) return;
  setHtml(root, buildCrunchPage());
  bindCrunchEvents();
}

function bindCrunchEvents(): void {
  if (step === 'upload') {
    $('#crunch-dropzone')?.addEventListener('click', () => {
      columns = mockColumns.map(c => ({ ...c }));
      step = 'label';
      mutateCrunchPage();
    });
  }

  if (step === 'label') {
    $$('[data-column-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        syncFormFields();
        const id = el.getAttribute('data-column-toggle');
        expandedColumnId = expandedColumnId === id ? null : id;
        mutateCrunchPage();
      });
    });

    $$('[data-column-id][data-field-name]').forEach(el => {
      el.addEventListener('input', () => {
        syncFormFields();
        const reviewBtn = $('#crunch-to-review');
        if (reviewBtn instanceof HTMLButtonElement) reviewBtn.disabled = completionPercent() < 100;
      });
    });

    $('#crunch-back-upload')?.addEventListener('click', () => { step = 'upload'; columns = []; mutateCrunchPage(); });
    $('#crunch-to-review')?.addEventListener('click', () => { syncFormFields(); step = 'review'; mutateCrunchPage(); });
  }

  if (step === 'review') {
    $('#crunch-edit-labels')?.addEventListener('click', () => { step = 'label'; mutateCrunchPage(); });
    $('#crunch-to-dashboard')?.addEventListener('click', () => navigateTo('dashboard'));
  }
}

export async function init(): Promise<void> {
  const container = $('#crunch-content');
  if (!container) return;
  try {
    mockColumns = await getCrunchColumns();
    step = 'upload';
    columns = [];
    expandedColumnId = null;
    businessContext = '';
    mutateCrunchPage();
  } catch {
    setHtml(container, buildErrorState('Failed to load Crunch data.'));
    container.querySelector('[data-retry-btn]')?.addEventListener('click', () => init());
  }
}
