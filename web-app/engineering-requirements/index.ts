import { $, $textarea } from '../app/dom';
import { html, setHtml, SafeHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import { buildSkeleton, buildErrorState } from '../app/loading-states';
import {
  iconArrowLeft, iconLightbulb, iconTarget, iconUsers, iconMessageSquare,
  iconAlertTriangle, iconCheckCircle2, iconSend, iconFileText,
  iconClock, iconDollarSign, iconUser, iconChevronRight,
} from '../app/icons';
import { navigateTo } from '../app/core';
import { getProjectForEngineering, getClarificationsByProjectId, buildUserMap, type EngineeringProject, type Clarification } from '../app/adapters';

type TeamMember = EngineeringProject['team'][number];

function buildClarification(clarification: Clarification): SafeHtml {
  const isPending = clarification.status === 'pending';
  return html`
    <div class="card" style="border:1px solid ${isPending ? 'hsl(var(--warning)/0.3)' : 'hsl(var(--border))'};${isPending ? 'background:hsl(var(--warning)/0.05)' : ''};padding:1rem">
      <div class="flex items-start gap-3 mb-3">
        <div style="padding:0.5rem;border-radius:9999px;${isPending ? 'background:hsl(var(--warning)/0.1)' : 'background:hsl(var(--muted))'}">${iconMessageSquare(16, isPending ? 'text-warning' : 'text-muted')}</div>
        <div style="flex:1">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-medium">${clarification.askedBy}</span>
            <span class="text-xs text-muted">${clarification.askedAt}</span>
            <span class="badge ${isPending ? 'badge-warning' : 'badge-success'} text-xs">${isPending ? 'Awaiting response' : 'Answered'}</span>
          </div>
          <p>${clarification.question}</p>
        </div>
      </div>
      ${clarification.answer ? html`
        <div style="margin-left:2.5rem;margin-top:1rem;padding:0.75rem;border-radius:0.5rem;background:hsl(var(--muted)/0.5);border-left:2px solid hsl(var(--primary))">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-medium">${clarification.answeredBy!}</span>
            <span class="text-xs text-muted">${clarification.answeredAt}</span>
          </div>
          <p>${clarification.answer}</p>
        </div>
      ` : html``}
    </div>`;
}

export async function init(params?: Record<string, string>): Promise<void> {
  const projectId = params?.['projectId'] || '1';

  const root = $('#engineering-requirements-content');
  if (!root) return;
  setHtml(root, buildSkeleton('detail'));

  let project: EngineeringProject;
  let clarifications: Clarification[];
  try {
    const userMap = await buildUserMap();
    [project, clarifications] = await Promise.all([
      getProjectForEngineering(projectId, userMap),
      getClarificationsByProjectId(projectId, userMap),
    ]);
  } catch {
    setHtml(root, buildErrorState('Failed to load engineering requirements.'));
    root.querySelector('[data-retry-btn]')?.addEventListener('click', () => init());
    return;
  }

  const pendingCount = clarifications.filter(clarification => clarification.status === 'pending').length;
  const answeredCount = clarifications.filter(clarification => clarification.status === 'answered').length;

  setHtml(root, html`
    <div style="max-width:56rem;margin:0 auto">
      <div class="flex items-center gap-2 text-sm text-muted mb-4">
        <a href="../projects/index.html" class="hover-link">Projects</a><span>/</span>
        <a href="../project-detail/index.html?projectId=${projectId}" class="hover-link">${project.title}</a><span>/</span>
        <span>Engineering Requirements</span>
      </div>

      <div class="flex items-start justify-between mb-8">
        <div>
          <h1 class="text-2xl font-display font-bold mb-2">Engineering Requirements</h1>
          <p class="text-muted">Business context and clarifications for ${project.title}</p>
        </div>
        <button class="btn btn-outline gap-2" id="requirements-back">${iconArrowLeft(16)} Back to Project</button>
      </div>

      <div class="stats-grid mb-8">
        <div class="card p-4"><div class="flex items-center gap-3">
          <div style="padding:0.5rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1)">${iconClock(20, 'text-primary')}</div>
          <div><p class="text-lg font-bold">${project.timeline}</p><p class="text-xs text-muted">Timeline</p></div>
        </div></div>
        <div class="card p-4"><div class="flex items-center gap-3">
          <div style="padding:0.5rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1)">${iconDollarSign(20, 'text-primary')}</div>
          <div><p class="text-lg font-bold">${project.budget}</p><p class="text-xs text-muted">Budget</p></div>
        </div></div>
        <div class="card p-4"><div class="flex items-center gap-3">
          <div style="padding:0.5rem;border-radius:0.5rem;background:hsl(var(--warning)/0.1)">${iconMessageSquare(20, 'text-warning')}</div>
          <div><p class="text-lg font-bold">${pendingCount}</p><p class="text-xs text-muted">Pending Questions</p></div>
        </div></div>
        <div class="card p-4"><div class="flex items-center gap-3">
          <div style="padding:0.5rem;border-radius:0.5rem;background:hsl(var(--success-soft))">${iconCheckCircle2(20, 'text-success')}</div>
          <div><p class="text-lg font-bold">${answeredCount}</p><p class="text-xs text-muted">Answered</p></div>
        </div></div>
      </div>

      <div class="card p-6 mb-6">
        <h3 class="flex items-center gap-2 text-lg font-display font-semibold mb-4">${iconLightbulb(20, 'text-primary')} Business Context</h3>
        <div style="display:flex;flex-direction:column;gap:1.5rem">
          <div><h4 class="text-sm font-semibold mb-2">Problem Statement</h4><p class="text-muted">${project.businessContext.problem}</p></div>
          <div><h4 class="text-sm font-semibold mb-2">Expected Outcome</h4><p class="text-muted">${project.businessContext.expectedOutcome}</p></div>
        </div>
      </div>

      <div class="card p-6 mb-6">
        <h3 class="flex items-center gap-2 text-lg font-display font-semibold mb-4">${iconTarget(20, 'text-success')} Success Metrics</h3>
        <div style="display:flex;flex-direction:column;gap:0.5rem">
          ${project.businessContext.successMetrics.map((metric: string) => html`
            <div class="flex items-start gap-2">${iconCheckCircle2(16, 'text-success')} <span>${metric}</span></div>
          `)}
        </div>
      </div>

      <div class="card p-6 mb-6">
        <h3 class="flex items-center gap-2 text-lg font-display font-semibold mb-4">${iconAlertTriangle(20, 'text-warning')} Constraints & Requirements</h3>
        <div style="display:flex;flex-direction:column;gap:0.5rem">
          ${project.businessContext.constraints.map((constraint: string) => html`
            <div class="flex items-start gap-2"><span class="text-warning">•</span> <span>${constraint}</span></div>
          `)}
        </div>
      </div>

      <div class="card p-6 mb-6">
        <h3 class="flex items-center gap-2 text-lg font-display font-semibold mb-4">${iconUsers(20, 'text-primary')} Team Contacts</h3>
        <div class="convert-grid" style="gap:0.75rem">
          ${project.team.map((teamMember: TeamMember) => html`
            <div class="flex items-center gap-3" style="padding:0.75rem;border-radius:0.5rem;background:hsl(var(--muted)/0.3)">
              <div style="width:2.5rem;height:2.5rem;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:${teamMember.type === 'business' ? 'hsl(var(--primary)/0.1)' : 'hsl(var(--success-soft))'}">${iconUser(20, teamMember.type === 'business' ? 'text-primary' : 'text-success')}</div>
              <div style="flex:1;min-width:0"><p class="font-medium">${teamMember.name}</p><p class="text-xs text-muted">${teamMember.role}</p></div>
              <span class="badge ${teamMember.type === 'business' ? 'badge-primary' : 'badge-success'} text-xs">${teamMember.type}</span>
            </div>
          `)}
        </div>
      </div>

      <div class="card p-6 mb-8">
        <h3 class="flex items-center gap-2 text-lg font-display font-semibold mb-4">${iconFileText(20, 'text-primary')} Source Idea</h3>
        <a href="../idea-convert/index.html?ideaId=${project.linkedIdea.id}" class="flex items-center justify-between" style="padding:1rem;border-radius:0.5rem;background:hsl(var(--muted)/0.3);text-decoration:none;color:inherit">
          <div class="flex items-center gap-3">
            <div style="padding:0.5rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1)">${iconLightbulb(20, 'text-primary')}</div>
            <div><p class="font-medium">${project.linkedIdea.title}</p><p class="text-xs text-muted">View original idea</p></div>
          </div>
          <div class="flex items-center gap-3">
            <span class="badge badge-success text-xs">Score: ${project.linkedIdea.score}</span>
            ${iconChevronRight(20, 'text-muted')}
          </div>
        </a>
      </div>

      <div style="margin-bottom:2rem">
        <h2 class="text-xl font-display font-semibold mb-4 flex items-center gap-2">${iconMessageSquare(20, 'text-primary')} Clarifications</h2>
        <div class="card" style="padding:1rem;margin-bottom:1rem">
          <textarea class="textarea" id="requirements-question" placeholder="Ask a clarifying question to the business team..." style="min-height:5rem;resize:none;margin-bottom:0.75rem"></textarea>
          <div style="display:flex;justify-content:flex-end">
            <button class="btn btn-primary gap-2" id="requirements-send" disabled>${iconSend(16)} Send Question</button>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:1rem" id="requirements-thread">
          ${clarifications.map(buildClarification)}
        </div>
      </div>

      <div class="flex items-center justify-between" style="padding:1rem;border-radius:0.75rem;background:hsl(var(--muted)/0.3);border:1px solid hsl(var(--border))">
        <span class="text-sm text-muted">${pendingCount > 0 ? `${pendingCount} ${pendingCount === 1 ? 'question' : 'questions'} awaiting business response` : 'All questions have been answered'}</span>
        <div class="flex gap-3">
          <button class="btn btn-outline" id="requirements-back-footer">Back to Project</button>
          <button class="btn btn-primary gap-2" id="requirements-complete">${iconCheckCircle2(16)} Mark Requirements Complete</button>
        </div>
      </div>
    </div>`);

  // Event bindings
  const questionField = $textarea('#requirements-question');
  const sendButton = $('#requirements-send');
  questionField?.addEventListener('input', () => { if (sendButton instanceof HTMLButtonElement) sendButton.disabled = !questionField.value.trim(); });
  sendButton?.addEventListener('click', () => {
    showToast('Question sent to business team', 'success');
    if (questionField) questionField.value = '';
    if (sendButton instanceof HTMLButtonElement) sendButton.disabled = true;
  });

  $('#requirements-complete')?.addEventListener('click', () => {
    showToast('Requirements marked as complete', 'success');
    navigateTo('project-detail', { projectId });
  });

  $('#requirements-back')?.addEventListener('click', () => navigateTo('project-detail', { projectId }));
  $('#requirements-back-footer')?.addEventListener('click', () => navigateTo('project-detail', { projectId }));
}
