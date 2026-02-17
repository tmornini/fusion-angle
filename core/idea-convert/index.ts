import {
  $, escapeHtml, showToast, navigateTo, getParams, renderSkeleton, renderError,
  iconArrowLeft, iconArrowRight, iconRocket, iconCalendar, iconUsers,
  iconTarget, iconDollarSign, iconClock, iconTrendingUp,
  iconCheckCircle2, iconAlertCircle, iconLoader, iconFolderKanban,
} from '../../site/script';
import { getIdeaForConversion, type ConvertIdea } from '../../site/data';

const requiredFields = ['projectName', 'projectLead', 'startDate', 'targetEndDate', 'budget', 'priority'];

let projectDetails: Record<string, string> = {};

function completedCount(): number {
  return requiredFields.filter(f => projectDetails[f]?.trim()).length;
}

function canConvert(): boolean {
  return completedCount() === requiredFields.length;
}

function fieldCheck(field: string): string {
  return projectDetails[field]?.trim() ? `<span style="color:hsl(142 71% 45%)">${iconCheckCircle2(16)}</span>` : '';
}

function renderPage(idea: ConvertIdea, ideaId: string): string {
  const done = completedCount();
  const pct = (done / requiredFields.length) * 100;

  return `
    <div style="min-height:100vh;background:hsl(var(--background))">
      <header style="border-bottom:1px solid hsl(var(--border));background:hsl(var(--card)/0.5);backdrop-filter:blur(8px);position:sticky;top:0;z-index:50">
        <div style="max-width:72rem;margin:0 auto;padding:0 1.5rem">
          <div class="flex items-center justify-between" style="height:4rem">
            <div class="flex items-center gap-4">
              <button class="btn btn-ghost btn-icon" id="back-to-scoring">${iconArrowLeft(20)}</button>
              <div class="flex items-center gap-3">
                <div class="gradient-hero rounded-lg flex items-center justify-center" style="width:2.25rem;height:2.25rem;color:hsl(var(--primary-foreground))">${iconRocket(20)}</div>
                <span class="text-xl font-display font-bold">Convert to Project</span>
              </div>
            </div>
            <div class="hidden-mobile flex items-center gap-2 text-sm">
              <span class="text-muted">${done}/${requiredFields.length} required fields</span>
              <div style="width:6rem;height:0.5rem;background:hsl(var(--muted));border-radius:9999px;overflow:hidden">
                <div style="height:100%;background:hsl(142 71% 45%);transition:width 0.3s;width:${pct}%"></div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div style="max-width:72rem;margin:0 auto;padding:2rem 1.5rem">
        <div class="convert-grid" style="display:grid;grid-template-columns:2fr 3fr;gap:2rem">
          <div>
            <div class="card p-6" style="position:sticky;top:6rem">
              <div class="flex items-center gap-2 text-sm font-medium text-muted mb-4">${iconFolderKanban(16)} Idea Summary</div>
              <h2 class="text-xl font-display font-bold mb-4">${escapeHtml(idea.title)}</h2>
              <div style="display:flex;flex-direction:column;gap:1rem;margin-bottom:1.5rem">
                <div><h4 class="text-sm font-medium text-muted mb-1">Problem</h4><p class="text-sm">${escapeHtml(idea.problemStatement)}</p></div>
                <div><h4 class="text-sm font-medium text-muted mb-1">Solution</h4><p class="text-sm">${escapeHtml(idea.proposedSolution)}</p></div>
                <div><h4 class="text-sm font-medium text-muted mb-1">Expected Outcome</h4><p class="text-sm">${escapeHtml(idea.expectedOutcome)}</p></div>
              </div>
              <div style="border-top:1px solid hsl(var(--border));padding-top:1rem;display:flex;flex-direction:column;gap:0.75rem">
                <div class="flex items-center justify-between">
                  <span class="flex items-center gap-2 text-muted">${iconClock(16)} <span class="text-sm">Est. Time</span></span>
                  <span class="font-medium">${idea.estimatedTime}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="flex items-center gap-2 text-muted">${iconDollarSign(16)} <span class="text-sm">Est. Cost</span></span>
                  <span class="font-medium">${idea.estimatedCost}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="flex items-center gap-2 text-muted">${iconTrendingUp(16)} <span class="text-sm">Priority Score</span></span>
                  <span class="font-bold" style="color:hsl(142 71% 45%)">${idea.score}/100</span>
                </div>
              </div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:1.5rem">
            <div class="card p-6">
              <div class="flex items-center gap-2 mb-6">${iconAlertCircle(20, 'text-warning')} <span class="font-medium">Complete these details to create a project</span></div>
              <div style="display:flex;flex-direction:column;gap:1.5rem">
                <div>
                  <label class="label mb-2 font-medium flex items-center gap-2">Project Name ${fieldCheck('projectName')}</label>
                  <input class="input" id="f-projectName" value="${escapeHtml(projectDetails.projectName || '')}" placeholder="Give your project a clear name" />
                </div>
                <div>
                  <label class="label mb-2 font-medium flex items-center gap-2">Project Lead ${fieldCheck('projectLead')}</label>
                  <select class="input" id="f-projectLead">
                    <option value="">Who will own this project?</option>
                    <option value="sarah" ${projectDetails.projectLead === 'sarah' ? 'selected' : ''}>Sarah Chen - Product Manager</option>
                    <option value="mike" ${projectDetails.projectLead === 'mike' ? 'selected' : ''}>Mike Thompson - Engineering Lead</option>
                    <option value="jessica" ${projectDetails.projectLead === 'jessica' ? 'selected' : ''}>Jessica Park - Data Science Lead</option>
                    <option value="david" ${projectDetails.projectLead === 'david' ? 'selected' : ''}>David Martinez - Marketing Director</option>
                  </select>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
                  <div>
                    <label class="label mb-2 font-medium flex items-center gap-2">${iconCalendar(16, 'text-muted')} Start Date ${fieldCheck('startDate')}</label>
                    <input class="input" type="date" id="f-startDate" value="${projectDetails.startDate || ''}" />
                  </div>
                  <div>
                    <label class="label mb-2 font-medium flex items-center gap-2">${iconTarget(16, 'text-muted')} Target End Date ${fieldCheck('targetEndDate')}</label>
                    <input class="input" type="date" id="f-targetEndDate" value="${projectDetails.targetEndDate || ''}" />
                  </div>
                </div>
                <div>
                  <label class="label mb-2 font-medium flex items-center gap-2">${iconDollarSign(16, 'text-muted')} Allocated Budget ${fieldCheck('budget')}</label>
                  <select class="input" id="f-budget">
                    <option value="">Select budget range</option>
                    <option value="0-25k">Under $25,000</option>
                    <option value="25-50k">$25,000 - $50,000</option>
                    <option value="50-100k">$50,000 - $100,000</option>
                    <option value="100-250k">$100,000 - $250,000</option>
                    <option value="250k+">$250,000+</option>
                  </select>
                  <p class="text-xs text-muted mt-1">AI estimate: ${idea.estimatedCost}</p>
                </div>
                <div>
                  <label class="label mb-2 font-medium flex items-center gap-2">Priority Level ${fieldCheck('priority')}</label>
                  <select class="input" id="f-priority">
                    <option value="">How urgent is this project?</option>
                    <option value="critical">Critical - Must start immediately</option>
                    <option value="high">High - Start within 2 weeks</option>
                    <option value="medium">Medium - Start within 1 month</option>
                    <option value="low">Low - Can wait for capacity</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="card p-6">
              <div class="flex items-center gap-2 mb-6">${iconUsers(20, 'text-primary')} <span class="font-medium">Additional Details</span> <span class="text-xs text-muted">(Optional)</span></div>
              <div style="display:flex;flex-direction:column;gap:1.5rem">
                <div>
                  <label class="label mb-2 font-medium">First Milestone</label>
                  <input class="input" id="f-firstMilestone" placeholder="e.g., Complete data pipeline setup" value="${escapeHtml(projectDetails.firstMilestone || '')}" />
                  <p class="text-xs text-muted mt-1">What is the first measurable goal for this project?</p>
                </div>
                <div>
                  <label class="label mb-2 font-medium">Success Criteria</label>
                  <textarea class="textarea" id="f-successCriteria" placeholder="How will you know when this project is complete and successful?" rows="4" style="resize:none">${escapeHtml(projectDetails.successCriteria || '')}</textarea>
                </div>
              </div>
            </div>

            <div class="card p-6" id="convert-confirm" style="border:2px solid ${canConvert() ? 'hsl(142 71% 45%/0.3)' : 'transparent'};${canConvert() ? 'background:hsl(142 71% 45%/0.05)' : ''}">
              <div class="flex items-start gap-4">
                <div style="width:3rem;height:3rem;border-radius:0.75rem;display:flex;align-items:center;justify-content:center;${canConvert() ? 'background:hsl(142 71% 45%);color:white' : 'background:hsl(var(--muted));color:hsl(var(--muted-foreground))'}">${iconRocket(24)}</div>
                <div style="flex:1">
                  <h3 class="font-semibold mb-1">${canConvert() ? 'Ready to Create Project' : 'Complete Required Fields'}</h3>
                  <p class="text-sm text-muted mb-4">
                    ${canConvert()
                      ? 'All required information has been provided. Click below to officially create this project.'
                      : `${requiredFields.length - completedCount()} required field${requiredFields.length - completedCount() > 1 ? 's' : ''} remaining`}
                  </p>
                  <div class="flex gap-3">
                    <button class="btn btn-ghost" id="back-scoring-2">${iconArrowLeft(16)} Back to Scoring</button>
                    <button class="btn btn-hero gap-2" id="convert-btn" ${canConvert() ? '' : 'disabled'}>Create Project ${iconArrowRight(16)}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

export async function init(): Promise<void> {
  const params = getParams();
  const ideaId = params['ideaId'] || '1';

  const root = $('#page-root');
  if (!root) return;
  root.innerHTML = renderSkeleton('detail');

  let idea: ConvertIdea;
  try {
    idea = await getIdeaForConversion(ideaId);
  } catch {
    root.innerHTML = renderError('Failed to load idea for conversion.');
    root.querySelector('[data-retry-btn]')?.addEventListener('click', () => init());
    return;
  }

  projectDetails = {
    projectName: idea.title,
    projectLead: '',
    startDate: '',
    targetEndDate: '',
    budget: '',
    priority: '',
    firstMilestone: '',
    successCriteria: '',
  };

  root.innerHTML = renderPage(idea, ideaId);

  const syncFields = () => {
    requiredFields.concat(['firstMilestone', 'successCriteria']).forEach(f => {
      const el = $(`#f-${f}`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (el) projectDetails[f] = el.value;
    });
  };

  document.querySelectorAll<HTMLElement>('.card input, .card select, .card textarea').forEach(el => {
    el.addEventListener('input', () => {
      syncFields();
      const btn = $('#convert-btn') as HTMLButtonElement;
      if (btn) btn.disabled = !canConvert();
    });
    el.addEventListener('change', () => {
      syncFields();
      const btn = $('#convert-btn') as HTMLButtonElement;
      if (btn) btn.disabled = !canConvert();
    });
  });

  $('#convert-btn')?.addEventListener('click', () => {
    syncFields();
    if (!canConvert()) return;
    const btn = $('#convert-btn')!;
    btn.innerHTML = `${iconLoader(16)} Creating Project...`;
    (btn as HTMLButtonElement).disabled = true;
    setTimeout(() => {
      showToast('Project created successfully!', 'success');
      navigateTo('dashboard');
    }, 2000);
  });

  $('#back-to-scoring')?.addEventListener('click', () => navigateTo('idea-scoring', { ideaId }));
  $('#back-scoring-2')?.addEventListener('click', () => navigateTo('idea-scoring', { ideaId }));
}
