import {
  $, showToast, navigateTo, html, setHtml, SafeHtml,
  buildSkeleton, buildErrorState,
  iconArrowLeft, iconArrowRight, iconRocket, iconCalendar, iconUsers,
  iconTarget, iconDollarSign, iconClock, iconTrendingUp,
  iconCheckCircle2, iconAlertCircle, iconLoader, iconFolderKanban,
} from '../../site/script';
import { getIdeaForConversion, type ConversionIdea } from '../../site/data';
import { PUT, GET } from '../../../api/api';

const requiredFields = ['project-name', 'project-lead', 'start-date', 'target-end-date', 'budget', 'priority'];

let projectDetails: Record<string, string> = {};

function completedFieldCount(): number {
  return requiredFields.filter(field => projectDetails[field]?.trim()).length;
}

function isReadyToConvert(): boolean {
  return completedFieldCount() === requiredFields.length;
}

function fieldCheckIcon(field: string): SafeHtml {
  return projectDetails[field]?.trim() ? html`<span style="color:hsl(var(--success))">${iconCheckCircle2(16)}</span>` : html``;
}

function buildConversionPage(idea: ConversionIdea, ideaId: string): SafeHtml {
  const completedCount = completedFieldCount();
  const percent = (completedCount / requiredFields.length) * 100;

  return html`
    <div style="min-height:100vh;background:hsl(var(--background))">
      <header style="border-bottom:1px solid hsl(var(--border));background:hsl(var(--card)/0.5);backdrop-filter:blur(8px);position:sticky;top:0;z-index:50">
        <div style="max-width:72rem;margin:0 auto;padding:0 1.5rem">
          <div class="flex items-center justify-between" style="height:4rem">
            <div class="flex items-center gap-4">
              <button class="btn btn-ghost btn-icon" id="convert-back-to-ideas">${iconArrowLeft(20)}</button>
              <div class="flex items-center gap-3">
                <div class="gradient-hero rounded-lg flex items-center justify-center" style="width:2.25rem;height:2.25rem;color:hsl(var(--primary-foreground))">${iconRocket(20)}</div>
                <span class="text-xl font-display font-bold">Convert to Project</span>
              </div>
            </div>
            <div class="hidden-mobile flex items-center gap-2 text-sm">
              <span class="text-muted">${completedCount}/${requiredFields.length} required fields</span>
              <div style="width:6rem;height:0.5rem;background:hsl(var(--muted));border-radius:9999px;overflow:hidden">
                <div style="height:100%;background:hsl(var(--success));transition:width 0.3s;width:${percent}%"></div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div style="max-width:72rem;margin:0 auto;padding:2rem 1.5rem">
        <div class="convert-grid" style="grid-template-columns:2fr 3fr;gap:2rem">
          <div>
            <div class="card p-6" style="position:sticky;top:6rem">
              <div class="flex items-center gap-2 text-sm font-medium text-muted mb-4">${iconFolderKanban(16)} Idea Summary</div>
              <h2 class="text-xl font-display font-bold mb-4">${idea.title}</h2>
              <div style="display:flex;flex-direction:column;gap:1rem;margin-bottom:1.5rem">
                <div><h4 class="text-sm font-medium text-muted mb-1">Problem</h4><p class="text-sm">${idea.problemStatement}</p></div>
                <div><h4 class="text-sm font-medium text-muted mb-1">Solution</h4><p class="text-sm">${idea.proposedSolution}</p></div>
                <div><h4 class="text-sm font-medium text-muted mb-1">Expected Outcome</h4><p class="text-sm">${idea.expectedOutcome}</p></div>
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
                  <span class="font-bold" style="color:hsl(var(--success))">${idea.score}/100</span>
                </div>
              </div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:1.5rem">
            <div class="card p-6">
              <div class="flex items-center gap-2 mb-6">${iconAlertCircle(20, 'text-warning')} <span class="font-medium">Complete these details to create a project</span></div>
              <div style="display:flex;flex-direction:column;gap:1.5rem">
                <div>
                  <label class="label mb-2 font-medium flex items-center gap-2">Project Name ${fieldCheckIcon('project-name')}</label>
                  <input class="input" id="convert-project-name" value="${projectDetails['project-name'] || ''}" placeholder="Give your project a clear name" />
                </div>
                <div>
                  <label class="label mb-2 font-medium flex items-center gap-2">Project Lead ${fieldCheckIcon('project-lead')}</label>
                  <select class="input" id="convert-project-lead">
                    <option value="">Who will own this project?</option>
                    <option value="sarah" ${projectDetails['project-lead'] === 'sarah' ? 'selected' : ''}>Sarah Chen - Product Manager</option>
                    <option value="mike" ${projectDetails['project-lead'] === 'mike' ? 'selected' : ''}>Mike Thompson - Engineering Lead</option>
                    <option value="jessica" ${projectDetails['project-lead'] === 'jessica' ? 'selected' : ''}>Jessica Park - Data Science Lead</option>
                    <option value="david" ${projectDetails['project-lead'] === 'david' ? 'selected' : ''}>David Martinez - Marketing Director</option>
                  </select>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
                  <div>
                    <label class="label mb-2 font-medium flex items-center gap-2">${iconCalendar(16, 'text-muted')} Start Date ${fieldCheckIcon('start-date')}</label>
                    <input class="input" type="date" id="convert-start-date" value="${projectDetails['start-date'] || ''}" />
                  </div>
                  <div>
                    <label class="label mb-2 font-medium flex items-center gap-2">${iconTarget(16, 'text-muted')} Target End Date ${fieldCheckIcon('target-end-date')}</label>
                    <input class="input" type="date" id="convert-target-end-date" value="${projectDetails['target-end-date'] || ''}" />
                  </div>
                </div>
                <div>
                  <label class="label mb-2 font-medium flex items-center gap-2">${iconDollarSign(16, 'text-muted')} Allocated Budget ${fieldCheckIcon('budget')}</label>
                  <select class="input" id="convert-budget">
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
                  <label class="label mb-2 font-medium flex items-center gap-2">Priority Level ${fieldCheckIcon('priority')}</label>
                  <select class="input" id="convert-priority">
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
                  <input class="input" id="convert-first-milestone" placeholder="e.g., Complete data pipeline setup" value="${projectDetails['first-milestone'] || ''}" />
                  <p class="text-xs text-muted mt-1">What is the first measurable goal for this project?</p>
                </div>
                <div>
                  <label class="label mb-2 font-medium">Success Criteria</label>
                  <textarea class="textarea" id="convert-success-criteria" placeholder="How will you know when this project is complete and successful?" rows="4" style="resize:none">${projectDetails['success-criteria'] || ''}</textarea>
                </div>
              </div>
            </div>

            <div class="card p-6" id="convert-confirm-section" style="border:2px solid ${isReadyToConvert() ? 'hsl(var(--success) / 0.3)' : 'transparent'};${isReadyToConvert() ? 'background:hsl(var(--success) / 0.05)' : ''}">
              <div class="flex items-start gap-4">
                <div style="width:3rem;height:3rem;border-radius:0.75rem;display:flex;align-items:center;justify-content:center;${isReadyToConvert() ? 'background:hsl(var(--success));color:hsl(var(--success-foreground))' : 'background:hsl(var(--muted));color:hsl(var(--muted-foreground))'}">${iconRocket(24)}</div>
                <div style="flex:1">
                  <h3 class="font-semibold mb-1">${isReadyToConvert() ? 'Ready to Create Project' : 'Complete Required Fields'}</h3>
                  <p class="text-sm text-muted mb-4">
                    ${isReadyToConvert()
                      ? 'All required information has been provided. Click below to officially create this project.'
                      : `${requiredFields.length - completedFieldCount()} required field${requiredFields.length - completedFieldCount() > 1 ? 's' : ''} remaining`}
                  </p>
                  <div class="flex gap-3">
                    <button class="btn btn-ghost" id="convert-back-to-ideas-2">${iconArrowLeft(16)} Back to Ideas</button>
                    <button class="btn btn-hero gap-2" id="convert-submit-btn" ${isReadyToConvert() ? '' : 'disabled'}>Create Project ${iconArrowRight(16)}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

export async function init(params?: Record<string, string>): Promise<void> {
  const ideaId = params?.['ideaId'] || '1';

  const root = $('#page-root');
  if (!root) return;
  setHtml(root, buildSkeleton('detail'));

  let idea: ConversionIdea;
  try {
    idea = await getIdeaForConversion(ideaId);
  } catch {
    setHtml(root, buildErrorState('Failed to load idea for conversion.'));
    root.querySelector('[data-retry-btn]')?.addEventListener('click', () => init());
    return;
  }

  projectDetails = {
    'project-name': idea.title,
    'project-lead': '',
    'start-date': '',
    'target-end-date': '',
    'budget': '',
    'priority': '',
    'first-milestone': '',
    'success-criteria': '',
  };

  setHtml(root, buildConversionPage(idea, ideaId));

  const syncFormFields = () => {
    requiredFields.concat(['first-milestone', 'success-criteria']).forEach(field => {
      const el = $(`#convert-${field}`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (el) projectDetails[field] = el.value;
    });
  };

  document.querySelectorAll<HTMLElement>('.card input, .card select, .card textarea').forEach(el => {
    el.addEventListener('input', () => {
      syncFormFields();
      const btn = $('#convert-submit-btn') as HTMLButtonElement;
      if (btn) btn.disabled = !isReadyToConvert();
    });
    el.addEventListener('change', () => {
      syncFormFields();
      const btn = $('#convert-submit-btn') as HTMLButtonElement;
      if (btn) btn.disabled = !isReadyToConvert();
    });
  });

  $('#convert-submit-btn')?.addEventListener('click', async () => {
    syncFormFields();
    if (!isReadyToConvert()) return;
    const btn = $('#convert-submit-btn')!;
    setHtml(btn, html`${iconLoader(16)} Creating Project...`);
    (btn as HTMLButtonElement).disabled = true;

    const leadMap: Record<string, string> = { sarah: '1', mike: '2', jessica: '3', david: '4' };
    const priorityMap: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };

    const projectId = crypto.randomUUID();
    try {
      await PUT(`projects/${projectId}`, {
        title: projectDetails['project-name'],
        description: projectDetails['success-criteria'] || '',
        status: 'approved',
        progress: 0,
        start_date: projectDetails['start-date'],
        target_end_date: projectDetails['target-end-date'],
        lead_id: leadMap[projectDetails['project-lead']!] || '1',
        estimated_time: 0,
        actual_time: 0,
        estimated_cost: 0,
        actual_cost: 0,
        estimated_impact: 0,
        actual_impact: 0,
        priority: priorityMap[projectDetails['priority']!] || 3,
        priority_score: 0,
        linked_idea_id: ideaId,
        business_context: '{}',
        timeline_label: '',
        budget_label: projectDetails['budget'] || '',
      });

      const existingIdea = await GET(`ideas/${ideaId}`);
      await PUT(`ideas/${ideaId}`, { ...existingIdea, status: 'approved' });

      if (projectDetails['first-milestone']?.trim()) {
        const milestoneId = crypto.randomUUID();
        await PUT(`projects/${projectId}/milestones/${milestoneId}`, {
          title: projectDetails['first-milestone'],
          status: 'pending',
          date: projectDetails['target-end-date'] || '',
          sort_order: 1,
        });
      }

      showToast('Project created successfully!', 'success');
      navigateTo('project-detail', { projectId });
    } catch {
      showToast('Failed to create project. Please try again.', 'error');
      setHtml(btn, html`Create Project ${iconArrowRight(16)}`);
      (btn as HTMLButtonElement).disabled = false;
    }
  });

  $('#convert-back-to-ideas')?.addEventListener('click', () => navigateTo('ideas'));
  $('#convert-back-to-ideas-2')?.addEventListener('click', () => navigateTo('ideas'));
}
