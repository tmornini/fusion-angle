import {
  $, escapeHtml, navigateTo,
  iconUpload, iconFileSpreadsheet, iconFileText, iconHelpCircle,
  iconCheck, iconChevronRight, iconChevronDown,
  iconSparkles, iconMessageSquare, iconTable, iconHash, iconCalendar,
  iconType, iconToggleLeft,
} from '../../site/script';
import { getCrunchColumns, type CrunchColumn } from '../../site/data';

let step: 'upload' | 'label' | 'review' = 'upload';
let columns: CrunchColumn[] = [];
let expandedColumnId: string | null = null;
let businessContext = '';

function dataTypeIcon(type: string): string {
  switch (type) {
    case 'number': return iconHash(16, 'text-muted');
    case 'date': return iconCalendar(16, 'text-muted');
    case 'boolean': return iconToggleLeft(16, 'text-muted');
    default: return iconType(16, 'text-muted');
  }
}

function completionPct(): number {
  if (!columns.length) return 0;
  const done = columns.filter(c => c.friendlyName && c.description && (!c.isAcronym || c.acronymExpansion)).length;
  return Math.round((done / columns.length) * 100);
}

function stepIndicator(): string {
  const steps = [
    { key: 'upload', label: 'Upload', icon: iconUpload },
    { key: 'label', label: 'Label & Explain', icon: iconMessageSquare },
    { key: 'review', label: 'Review', icon: iconCheck },
  ];
  return steps.map((s, i) => {
    const active = s.key === step;
    const complete = (step === 'label' && i === 0) || (step === 'review' && i <= 1);
    return `<div class="flex items-center gap-2" style="flex-shrink:0">
      <div class="flex items-center gap-2" style="padding:0.375rem 1rem;border-radius:9999px;${active ? 'background:hsl(var(--primary));color:hsl(var(--primary-foreground))' : complete ? 'background:hsl(142 71% 45%/0.1);color:hsl(142 71% 45%);border:1px solid hsl(142 71% 45%/0.2)' : 'background:hsl(var(--muted));color:hsl(var(--muted-foreground))'}">
        ${complete ? iconCheck(16) : s.icon(16)}
        <span class="text-sm font-medium">${s.label}</span>
      </div>
      ${i < 2 ? iconChevronRight(16, 'text-muted') : ''}
    </div>`;
  }).join('');
}

function renderUploadStep(): string {
  return `
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

function renderLabelStep(): string {
  const pct = completionPct();
  const labeled = columns.filter(c => c.friendlyName && c.description).length;
  return `
    <div style="display:flex;flex-direction:column;gap:1.5rem">
      <div class="card" style="padding:1rem">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;background:hsl(142 71% 45%/0.1);display:flex;align-items:center;justify-content:center">${iconFileSpreadsheet(20, 'text-success')}</div>
            <div><p class="font-medium text-sm">Q4_Sales_Report.xlsx</p><p class="text-xs text-muted">2.3 MB • 1,247 rows • ${columns.length} columns</p></div>
          </div>
          <div class="flex items-center gap-3">
            <div class="text-right"><p class="text-sm font-medium">${pct}% complete</p><p class="text-xs text-muted">${labeled} of ${columns.length} columns labeled</p></div>
            <div style="width:6rem"><div class="progress" style="height:0.5rem"><div class="progress-fill" style="width:${pct}%"></div></div></div>
          </div>
        </div>
      </div>

      <div class="card" style="padding:1.5rem">
        <div class="flex items-start gap-3 mb-4">
          ${iconSparkles(20, 'text-primary')}
          <div><h3 class="font-medium text-sm">What is this data about?</h3><p class="text-xs text-muted">Give us some context to help understand your business data better.</p></div>
        </div>
        <textarea class="textarea" id="crunch-context" placeholder="Example: This is our quarterly sales report..." style="min-height:5rem;resize:none">${escapeHtml(businessContext)}</textarea>
      </div>

      <div style="display:flex;flex-direction:column;gap:0.75rem">
        <h3 class="font-medium">Help us understand each column</h3>
        ${columns.map(col => {
          const expanded = expandedColumnId === col.id;
          const complete = col.friendlyName && col.description && (!col.isAcronym || col.acronymExpansion);
          return `
            <div class="card" style="${complete ? 'border-color:hsl(142 71% 45%/0.3);background:hsl(142 71% 45%/0.03)' : ''};overflow:hidden">
              <div style="padding:1rem;cursor:pointer" data-col-toggle="${col.id}">
                <div class="flex items-center gap-3">
                  <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;display:flex;align-items:center;justify-content:center;${complete ? 'background:hsl(142 71% 45%/0.1)' : 'background:hsl(var(--muted))'}">${complete ? iconCheck(20, 'text-success') : dataTypeIcon(col.dataType)}</div>
                  <div style="flex:1;min-width:0">
                    <div class="flex flex-wrap items-center gap-2">
                      <code style="font-size:0.75rem;background:hsl(var(--muted));padding:0.125rem 0.5rem;border-radius:0.25rem">${col.originalName}</code>
                      ${col.isAcronym ? '<span style="font-size:0.625rem;padding:0.125rem 0.5rem;border-radius:9999px;background:hsl(var(--warning)/0.1);color:hsl(var(--warning));border:1px solid hsl(var(--warning)/0.2)">Acronym</span>' : ''}
                    </div>
                    <p class="text-sm text-muted" style="margin-top:0.25rem">${col.friendlyName || 'Click to label this column'}</p>
                  </div>
                  <div class="flex items-center gap-3">
                    <div class="text-right hidden-mobile"><p class="text-xs text-muted">Sample values</p><p class="text-sm">${col.sampleValues.slice(0, 2).join(', ')}</p></div>
                    ${expanded ? iconChevronDown(20, 'text-muted') : iconChevronRight(20, 'text-muted')}
                  </div>
                </div>
              </div>
              ${expanded ? `
                <div style="padding:0 1rem 1rem;border-top:1px solid hsl(var(--border));padding-top:1rem;background:hsl(var(--muted)/0.2)">
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem" class="convert-grid">
                    <div><label class="label mb-1 text-xs">What would you call this column?</label><input class="input" data-col-field="${col.id}:friendlyName" placeholder="e.g., Customer ID" value="${escapeHtml(col.friendlyName)}"/></div>
                    <div><label class="label mb-1 text-xs">Data type</label>
                      <select class="input" data-col-field="${col.id}:dataType">
                        <option value="text" ${col.dataType === 'text' ? 'selected' : ''}>Text</option>
                        <option value="number" ${col.dataType === 'number' ? 'selected' : ''}>Number</option>
                        <option value="date" ${col.dataType === 'date' ? 'selected' : ''}>Date</option>
                        <option value="boolean" ${col.dataType === 'boolean' ? 'selected' : ''}>Yes/No</option>
                      </select>
                    </div>
                  </div>
                  ${col.isAcronym ? `<div style="margin-top:1rem"><label class="label mb-1 text-xs">What does "${col.originalName}" stand for?</label><input class="input" data-col-field="${col.id}:acronymExpansion" placeholder="e.g., Customer Identifier" value="${escapeHtml(col.acronymExpansion)}"/></div>` : ''}
                  <div style="margin-top:1rem"><label class="label mb-1 text-xs">Describe what this column contains</label><textarea class="textarea" data-col-field="${col.id}:description" placeholder="e.g., A unique identifier assigned to each customer..." style="resize:none" rows="2">${escapeHtml(col.description)}</textarea></div>
                </div>
              ` : ''}
            </div>`;
        }).join('')}
      </div>

      <div class="flex items-center justify-between" style="padding-top:1rem">
        <button class="btn btn-ghost" id="crunch-back-upload">Upload Different File</button>
        <button class="btn btn-primary gap-2" id="crunch-to-review" ${pct < 100 ? 'disabled' : ''}>Continue to Review ${iconChevronRight(16)}</button>
      </div>
    </div>`;
}

function renderReviewStep(): string {
  return `
    <div class="card" style="padding:2rem;text-align:center">
      <div style="width:4rem;height:4rem;border-radius:1rem;background:hsl(142 71% 45%/0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem">
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

function syncColumnFields(): void {
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-col-field]').forEach(el => {
    const [colId, field] = (el.getAttribute('data-col-field') || '').split(':');
    const col = columns.find(c => c.id === colId);
    if (col && field) {
      const k = field as keyof CrunchColumn;
      if (k === 'friendlyName' || k === 'description' || k === 'dataType' || k === 'acronymExpansion') col[k] = el.value;
      else if (k === 'isAcronym') col[k] = el.value === 'true';
    }
  });
  const ctx = $('#crunch-context') as HTMLTextAreaElement;
  if (ctx) businessContext = ctx.value;
}

function renderPage(): string {
  return `
    <div style="max-width:56rem;margin:0 auto">
      <div style="margin-bottom:2rem">
        <div class="badge badge-primary text-sm mb-3">${iconTable(14)} Data Translation Tool</div>
        <h1 class="text-2xl font-display font-bold mb-1">Crunch</h1>
        <p class="text-sm text-muted" style="max-width:32rem">Upload your business data and help us understand it. We'll guide you through labeling columns, explaining acronyms, and defining what everything means in plain language.</p>
      </div>

      <div class="flex items-center justify-center gap-3 mb-8" style="overflow-x:auto;padding-bottom:0.5rem">
        ${stepIndicator()}
      </div>

      ${step === 'upload' ? renderUploadStep() : step === 'label' ? renderLabelStep() : renderReviewStep()}
    </div>`;
}

let mockColumns: CrunchColumn[] = [];

function rerender(): void {
  const root = $('#crunch-root');
  if (!root) return;
  root.innerHTML = renderPage();
  bindEvents();
}

function bindEvents(): void {
  if (step === 'upload') {
    $('#crunch-dropzone')?.addEventListener('click', () => {
      columns = mockColumns.map(c => ({ ...c }));
      step = 'label';
      rerender();
    });
  }

  if (step === 'label') {
    document.querySelectorAll<HTMLElement>('[data-col-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        syncColumnFields();
        const id = el.getAttribute('data-col-toggle');
        expandedColumnId = expandedColumnId === id ? null : id;
        rerender();
      });
    });

    document.querySelectorAll<HTMLElement>('[data-col-field]').forEach(el => {
      el.addEventListener('input', () => {
        syncColumnFields();
        const reviewBtn = $('#crunch-to-review') as HTMLButtonElement;
        if (reviewBtn) reviewBtn.disabled = completionPct() < 100;
      });
    });

    $('#crunch-back-upload')?.addEventListener('click', () => { step = 'upload'; columns = []; rerender(); });
    $('#crunch-to-review')?.addEventListener('click', () => { syncColumnFields(); step = 'review'; rerender(); });
  }

  if (step === 'review') {
    $('#crunch-edit-labels')?.addEventListener('click', () => { step = 'label'; rerender(); });
    $('#crunch-to-dashboard')?.addEventListener('click', () => navigateTo('dashboard'));
  }
}

export async function init(): Promise<void> {
  mockColumns = await getCrunchColumns();
  step = 'upload';
  columns = [];
  expandedColumnId = null;
  businessContext = '';
  rerender();
}
