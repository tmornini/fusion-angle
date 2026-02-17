import {
  $, escapeHtml, navigateTo,
  iconSparkles, iconArrowLeft, iconArrowRight, iconLightbulb,
  iconTarget, iconAlertCircle, iconTrendingUp, iconWand, iconCheck,
} from '../../site/script';

const steps = [
  { id: 1, title: 'The Problem', icon: iconAlertCircle, description: 'What challenge are you trying to solve?' },
  { id: 2, title: 'The Solution', icon: iconLightbulb, description: 'How will you address this problem?' },
  { id: 3, title: 'The Impact', icon: iconTrendingUp, description: 'What value will this create?' },
];

let currentStep = 1;
const formData = {
  title: '',
  problemStatement: '',
  proposedSolution: '',
  expectedOutcome: '',
  targetUsers: '',
  successMetrics: '',
};

function canProceed(): boolean {
  switch (currentStep) {
    case 1: return !!(formData.title.trim() && formData.problemStatement.trim());
    case 2: return !!formData.proposedSolution.trim();
    case 3: return !!formData.expectedOutcome.trim();
    default: return false;
  }
}

function renderProgressSteps(): string {
  return steps.map((step, index) => {
    const isCurrent = currentStep === step.id;
    const isCompleted = currentStep > step.id;
    const bgStyle = isCompleted
      ? 'background:hsl(142 71% 45%);color:white'
      : isCurrent
        ? 'background:hsl(var(--primary));color:hsl(var(--primary-foreground))'
        : 'background:hsl(var(--muted));color:hsl(var(--muted-foreground))';

    const connector = index < steps.length - 1
      ? `<div class="hidden-mobile" style="flex:1;height:0.25rem;margin:0 1rem;border-radius:9999px;${isCompleted ? 'background:hsl(142 71% 45%)' : 'background:hsl(var(--muted))'}"></div>`
      : '';

    return `
      <div class="flex items-center" style="flex-shrink:0${index < steps.length - 1 ? ';flex:1' : ''}">
        <div class="flex flex-col items-center">
          <div style="width:3rem;height:3rem;border-radius:0.75rem;display:flex;align-items:center;justify-content:center;${bgStyle}">
            ${isCompleted ? iconCheck(20) : step.icon(20)}
          </div>
          <span class="mt-2 text-sm font-medium" style="white-space:nowrap;color:${currentStep >= step.id ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'}">${step.title}</span>
        </div>
        ${connector}
      </div>`;
  }).join('');
}

function renderStepContent(): string {
  if (currentStep === 1) {
    return `
      <div style="display:flex;flex-direction:column;gap:1.5rem">
        <div>
          <label class="label mb-2 block font-medium">Give your idea a clear title</label>
          <input class="input" id="field-title" placeholder="e.g., AI-Powered Customer Segmentation" value="${escapeHtml(formData.title)}" style="font-size:1.125rem;padding:0.75rem 1rem" />
          <p class="text-xs text-muted mt-1">Keep it short and descriptive – think of what you would search for</p>
        </div>
        <div>
          <label class="label mb-2 block font-medium">What problem does this solve?</label>
          <textarea class="textarea" id="field-problem" placeholder="Describe the current pain point or challenge. Who experiences it? How often? What is the cost of not solving it?" rows="5" style="resize:none">${escapeHtml(formData.problemStatement)}</textarea>
          <p class="text-xs text-muted mt-1">Focus on the impact – why does this matter to the business?</p>
        </div>
        <div>
          <label class="label mb-2 block font-medium">Who will benefit from this? <span class="text-muted" style="font-weight:normal">(optional)</span></label>
          <input class="input" id="field-target" placeholder="e.g., Sales team, customers, operations managers" value="${escapeHtml(formData.targetUsers)}" />
        </div>
      </div>`;
  }
  if (currentStep === 2) {
    return `
      <div style="display:flex;flex-direction:column;gap:1.5rem">
        <div>
          <label class="label mb-2 block font-medium">How would you solve this?</label>
          <textarea class="textarea" id="field-solution" placeholder="Describe your proposed approach. What would change? What technology or process would you use?" rows="7" style="resize:none">${escapeHtml(formData.proposedSolution)}</textarea>
          <p class="text-xs text-muted mt-1">You do not need all the answers – outline your best thinking</p>
        </div>
        <div class="p-4 rounded-xl" style="background:hsl(var(--primary)/0.05);border:1px solid hsl(var(--primary)/0.1)">
          <div class="flex items-start gap-3">
            ${iconTarget(20, 'text-primary')}
            <div>
              <p class="text-sm font-medium mb-1">Tip: Think scope</p>
              <p class="text-sm text-muted">What is the smallest version of this idea that could prove value? Starting small often leads to faster wins.</p>
            </div>
          </div>
        </div>
      </div>`;
  }
  return `
    <div style="display:flex;flex-direction:column;gap:1.5rem">
      <div>
        <label class="label mb-2 block font-medium">What outcome do you expect?</label>
        <textarea class="textarea" id="field-outcome" placeholder="If this works, what changes? Be specific: revenue impact, time saved, errors reduced, satisfaction improved..." rows="5" style="resize:none">${escapeHtml(formData.expectedOutcome)}</textarea>
        <p class="text-xs text-muted mt-1">Think about what success looks like in 6-12 months</p>
      </div>
      <div>
        <label class="label mb-2 block font-medium">How would you measure success? <span class="text-muted" style="font-weight:normal">(optional)</span></label>
        <textarea class="textarea" id="field-metrics" placeholder="e.g., 20% reduction in processing time, 15% increase in conversion rate, NPS improvement of 10 points" rows="4" style="resize:none">${escapeHtml(formData.successMetrics)}</textarea>
      </div>
      <div class="p-4 rounded-xl" style="background:hsl(var(--success-soft));border:1px solid hsl(var(--success)/0.2)">
        <div class="flex items-start gap-3">
          ${iconTrendingUp(20, 'text-success')}
          <div>
            <p class="text-sm font-medium mb-1">Next: AI Scoring</p>
            <p class="text-sm text-muted">After submitting, our AI will estimate impact, time, and cost based on your inputs.</p>
          </div>
        </div>
      </div>
    </div>`;
}

function renderPage(): string {
  return `
    <div style="min-height:100vh;background:hsl(var(--background))">
      <header style="border-bottom:1px solid hsl(var(--border));background:hsl(var(--card)/0.5);backdrop-filter:blur(8px);position:sticky;top:0;z-index:50">
        <div style="max-width:48rem;margin:0 auto;padding:0 1.5rem">
          <div class="flex items-center justify-between" style="height:4rem">
            <div class="flex items-center gap-4">
              <button class="btn btn-ghost btn-icon" id="back-btn">${iconArrowLeft(20)}</button>
              <div class="flex items-center gap-3">
                <div class="gradient-hero rounded-lg flex items-center justify-center" style="width:2.25rem;height:2.25rem;color:hsl(var(--primary-foreground))">${iconSparkles(20)}</div>
                <span class="text-xl font-display font-bold">New Idea</span>
              </div>
            </div>
            <button class="btn btn-ghost btn-sm gap-2 text-primary">
              ${iconWand(16)} <span class="hidden-mobile">Generate with AI</span><span class="visible-mobile">AI</span>
            </button>
          </div>
        </div>
      </header>
      <div style="max-width:48rem;margin:0 auto;padding:2rem 1.5rem">
        <div class="flex items-center justify-between mb-8" style="overflow-x:auto;padding-bottom:0.5rem">
          ${renderProgressSteps()}
        </div>
        <div class="card p-6" id="step-content">
          <div class="mb-6">
            <h2 class="text-2xl font-display font-bold mb-2">${steps[currentStep - 1]!.title}</h2>
            <p class="text-muted">${steps[currentStep - 1]!.description}</p>
          </div>
          ${renderStepContent()}
          <div class="flex items-center justify-between gap-3 mt-8 pt-6" style="border-top:1px solid hsl(var(--border))">
            <button class="btn btn-ghost gap-2" id="step-back">${iconArrowLeft(16)} ${currentStep === 1 ? 'Cancel' : 'Back'}</button>
            <span class="text-sm text-muted">Step ${currentStep} of ${steps.length}</span>
            <button class="btn btn-hero gap-2" id="step-next" ${canProceed() ? '' : 'disabled'}>
              ${currentStep === 3 ? `Score Idea ${iconTrendingUp(16)}` : `Continue ${iconArrowRight(16)}`}
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

function rerender() {
  const root = $('#page-root');
  if (root) { root.innerHTML = renderPage(); bindEvents(); }
}

function saveCurrentFields() {
  if (currentStep === 1) {
    formData.title = ($('#field-title') as HTMLInputElement)?.value || '';
    formData.problemStatement = ($('#field-problem') as HTMLTextAreaElement)?.value || '';
    formData.targetUsers = ($('#field-target') as HTMLInputElement)?.value || '';
  } else if (currentStep === 2) {
    formData.proposedSolution = ($('#field-solution') as HTMLTextAreaElement)?.value || '';
  } else if (currentStep === 3) {
    formData.expectedOutcome = ($('#field-outcome') as HTMLTextAreaElement)?.value || '';
    formData.successMetrics = ($('#field-metrics') as HTMLTextAreaElement)?.value || '';
  }
}

function bindEvents() {
  $('#back-btn')?.addEventListener('click', () => {
    if (currentStep > 1) { saveCurrentFields(); currentStep--; rerender(); }
    else navigateTo('ideas');
  });
  $('#step-back')?.addEventListener('click', () => {
    if (currentStep > 1) { saveCurrentFields(); currentStep--; rerender(); }
    else navigateTo('ideas');
  });
  $('#step-next')?.addEventListener('click', () => {
    saveCurrentFields();
    if (!canProceed()) return;
    if (currentStep < 3) { currentStep++; rerender(); }
    else navigateTo('idea-scoring', { ideaId: 'new' });
  });
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('#step-content input, #step-content textarea').forEach(input => {
    input.addEventListener('input', () => {
      saveCurrentFields();
      const nextBtn = $('#step-next') as HTMLButtonElement;
      if (nextBtn) nextBtn.disabled = !canProceed();
    });
  });
}

export async function init(): Promise<void> {
  currentStep = 1;
  (Object.keys(formData) as Array<keyof typeof formData>).forEach(k => formData[k] = '');
  rerender();
}
