import {
  $, navigateTo, html, setHtml, SafeHtml,
  iconSparkles, iconArrowLeft, iconArrowRight, iconLightbulb,
  iconTarget, iconAlertCircle, iconTrendingUp, iconWand, iconCheck,
} from '../../site/script';
import { PUT } from '../../../api/api';

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

function isStepComplete(): boolean {
  switch (currentStep) {
    case 1: return !!(formData.title.trim() && formData.problemStatement.trim());
    case 2: return !!formData.proposedSolution.trim();
    case 3: return !!formData.expectedOutcome.trim();
    default: return false;
  }
}

function buildProgressSteps(): SafeHtml {
  return html`${steps.map((step, index) => {
    const isCurrent = currentStep === step.id;
    const isCompleted = currentStep > step.id;
    const bgStyle = isCompleted
      ? 'background:hsl(var(--success));color:hsl(var(--success-foreground))'
      : isCurrent
        ? 'background:hsl(var(--primary));color:hsl(var(--primary-foreground))'
        : 'background:hsl(var(--muted));color:hsl(var(--muted-foreground))';

    const connector = index < steps.length - 1
      ? html`<div class="hidden-mobile" style="flex:1;height:0.25rem;margin:0 1rem;border-radius:9999px;${isCompleted ? 'background:hsl(var(--success))' : 'background:hsl(var(--muted))'}"></div>`
      : html``;

    return html`
      <div class="flex items-center" style="flex-shrink:0${index < steps.length - 1 ? ';flex:1' : ''}">
        <div class="flex flex-col items-center">
          <div style="width:3rem;height:3rem;border-radius:0.75rem;display:flex;align-items:center;justify-content:center;${bgStyle}">
            ${isCompleted ? iconCheck(20) : step.icon(20)}
          </div>
          <span class="mt-2 text-sm font-medium" style="white-space:nowrap;color:${currentStep >= step.id ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'}">${step.title}</span>
        </div>
        ${connector}
      </div>`;
  })}`;
}

function buildStepContent(): SafeHtml {
  if (currentStep === 1) {
    return html`
      <div style="display:flex;flex-direction:column;gap:1.5rem">
        <div>
          <label class="label mb-2 block font-medium">Give your idea a clear title</label>
          <input class="input" id="idea-create-field-title" placeholder="e.g., AI-Powered Customer Segmentation" value="${formData.title}" style="font-size:1.125rem;padding:0.75rem 1rem" />
          <p class="text-xs text-muted mt-1">Keep it short and descriptive – think of what you would search for</p>
        </div>
        <div>
          <label class="label mb-2 block font-medium">What problem does this solve?</label>
          <textarea class="textarea" id="idea-create-field-problem" placeholder="Describe the current pain point or challenge. Who experiences it? How often? What is the cost of not solving it?" rows="5" style="resize:none">${formData.problemStatement}</textarea>
          <p class="text-xs text-muted mt-1">Focus on the impact – why does this matter to the business?</p>
        </div>
        <div>
          <label class="label mb-2 block font-medium">Who will benefit from this? <span class="text-muted" style="font-weight:normal">(optional)</span></label>
          <input class="input" id="idea-create-field-target" placeholder="e.g., Sales team, customers, operations managers" value="${formData.targetUsers}" />
        </div>
      </div>`;
  }
  if (currentStep === 2) {
    return html`
      <div style="display:flex;flex-direction:column;gap:1.5rem">
        <div>
          <label class="label mb-2 block font-medium">How would you solve this?</label>
          <textarea class="textarea" id="idea-create-field-solution" placeholder="Describe your proposed approach. What would change? What technology or process would you use?" rows="7" style="resize:none">${formData.proposedSolution}</textarea>
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
  return html`
    <div style="display:flex;flex-direction:column;gap:1.5rem">
      <div>
        <label class="label mb-2 block font-medium">What outcome do you expect?</label>
        <textarea class="textarea" id="idea-create-field-outcome" placeholder="If this works, what changes? Be specific: revenue impact, time saved, errors reduced, satisfaction improved..." rows="5" style="resize:none">${formData.expectedOutcome}</textarea>
        <p class="text-xs text-muted mt-1">Think about what success looks like in 6-12 months</p>
      </div>
      <div>
        <label class="label mb-2 block font-medium">How would you measure success? <span class="text-muted" style="font-weight:normal">(optional)</span></label>
        <textarea class="textarea" id="idea-create-field-metrics" placeholder="e.g., 20% reduction in processing time, 15% increase in conversion rate, NPS improvement of 10 points" rows="4" style="resize:none">${formData.successMetrics}</textarea>
      </div>
      <div class="p-4 rounded-xl" style="background:hsl(var(--success-soft));border:1px solid hsl(var(--success)/0.2)">
        <div class="flex items-start gap-3">
          ${iconTrendingUp(20, 'text-success')}
          <div>
            <p class="text-sm font-medium mb-1">Next: Convert to Project</p>
            <p class="text-sm text-muted">After submitting, you can convert this idea into a project with timeline, budget, and team details.</p>
          </div>
        </div>
      </div>
    </div>`;
}

function buildWizardPage(): SafeHtml {
  return html`
    <div style="min-height:100vh;background:hsl(var(--background))">
      <header style="border-bottom:1px solid hsl(var(--border));background:hsl(var(--card)/0.5);backdrop-filter:blur(8px);position:sticky;top:0;z-index:50">
        <div style="max-width:48rem;margin:0 auto;padding:0 1.5rem">
          <div class="flex items-center justify-between" style="height:4rem">
            <div class="flex items-center gap-4">
              <button class="btn btn-ghost btn-icon" id="idea-create-back-btn">${iconArrowLeft(20)}</button>
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
          ${buildProgressSteps()}
        </div>
        <div class="card p-6" id="idea-create-step-content">
          <div class="mb-6">
            <h2 class="text-2xl font-display font-bold mb-2">${steps[currentStep - 1]!.title}</h2>
            <p class="text-muted">${steps[currentStep - 1]!.description}</p>
          </div>
          ${buildStepContent()}
          <div class="flex items-center justify-between gap-3 mt-8 pt-6" style="border-top:1px solid hsl(var(--border))">
            <button class="btn btn-ghost gap-2" id="idea-create-step-back">${iconArrowLeft(16)} ${currentStep === 1 ? 'Cancel' : 'Back'}</button>
            <span class="text-sm text-muted">Step ${currentStep} of ${steps.length}</span>
            <button class="btn btn-hero gap-2" id="idea-create-step-next" ${isStepComplete() ? '' : 'disabled'}>
              ${currentStep === 3 ? html`Submit Idea ${iconCheck(16)}` : html`Continue ${iconArrowRight(16)}`}
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

function mutateWizard() {
  const root = $('#page-root');
  if (root) { setHtml(root, buildWizardPage()); bindWizardEvents(); }
}

function syncFormFields() {
  if (currentStep === 1) {
    formData.title = ($('#idea-create-field-title') as HTMLInputElement)?.value || '';
    formData.problemStatement = ($('#idea-create-field-problem') as HTMLTextAreaElement)?.value || '';
    formData.targetUsers = ($('#idea-create-field-target') as HTMLInputElement)?.value || '';
  } else if (currentStep === 2) {
    formData.proposedSolution = ($('#idea-create-field-solution') as HTMLTextAreaElement)?.value || '';
  } else if (currentStep === 3) {
    formData.expectedOutcome = ($('#idea-create-field-outcome') as HTMLTextAreaElement)?.value || '';
    formData.successMetrics = ($('#idea-create-field-metrics') as HTMLTextAreaElement)?.value || '';
  }
}

function bindWizardEvents() {
  $('#idea-create-back-btn')?.addEventListener('click', () => {
    if (currentStep > 1) { syncFormFields(); currentStep--; mutateWizard(); }
    else navigateTo('ideas');
  });
  $('#idea-create-step-back')?.addEventListener('click', () => {
    if (currentStep > 1) { syncFormFields(); currentStep--; mutateWizard(); }
    else navigateTo('ideas');
  });
  $('#idea-create-step-next')?.addEventListener('click', async () => {
    syncFormFields();
    if (!isStepComplete()) return;
    if (currentStep < 3) { currentStep++; mutateWizard(); }
    else {
      const ideaId = crypto.randomUUID();
      await PUT(`ideas/${ideaId}`, {
        title: formData.title,
        problem_statement: formData.problemStatement,
        proposed_solution: formData.proposedSolution,
        expected_outcome: formData.expectedOutcome,
        description: formData.targetUsers,
        status: 'scored',
        submitted_by_id: '1',
        score: 0, estimated_impact: 0, estimated_time: 0, estimated_cost: 0,
        priority: 0, edge_status: 'missing', category: '', readiness: '',
        waiting_days: 0, impact_label: '', effort_label: '', submitted_at: new Date().toISOString(),
      });
      navigateTo('ideas');
    }
  });
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('#idea-create-step-content input, #idea-create-step-content textarea').forEach(input => {
    input.addEventListener('input', () => {
      syncFormFields();
      const nextBtn = $('#idea-create-step-next') as HTMLButtonElement;
      if (nextBtn) nextBtn.disabled = !isStepComplete();
    });
  });
}

export async function init(): Promise<void> {
  currentStep = 1;
  (Object.keys(formData) as Array<keyof typeof formData>).forEach(key => formData[key] = '');
  mutateWizard();
}
