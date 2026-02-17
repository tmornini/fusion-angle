import {
  $, escapeHtml, showToast, navigateTo, getParams, openDialog, closeDialog,
  renderSkeleton, renderError,
  iconArrowLeft, iconAlertTriangle, iconTrendingUp, iconClock,
  iconUser, iconCalendar, iconTarget, iconLightbulb, iconCheckCircle,
  iconXCircle, iconMessageSquare, iconFileText, iconDollarSign,
  iconUsers, iconShield, iconGauge,
} from '../../site/script';
import { getApprovalIdea, getApprovalEdge, type ApprovalIdea, type ApprovalEdge } from '../../site/data';

const severityConfig: Record<string, string> = {
  high: 'badge-error',
  medium: 'badge-warning',
  low: 'badge-default',
};

function renderPage(idea: ApprovalIdea, edge: ApprovalEdge): string {
  return `
    <div style="min-height:100vh;background:hsl(var(--background))">
      <header style="position:sticky;top:0;z-index:10;background:hsl(var(--background)/0.95);backdrop-filter:blur(8px);border-bottom:1px solid hsl(var(--border))">
        <div style="max-width:60rem;margin:0 auto;padding:0 1.5rem">
          <div class="flex items-center justify-between" style="height:4rem;gap:0.5rem">
            <div class="flex items-center gap-4" style="min-width:0">
              <button class="btn btn-ghost btn-icon" id="back-btn">${iconArrowLeft(20)}</button>
              <div style="min-width:0">
                <p class="text-xs text-muted">Reviewing Idea</p>
                <h1 class="text-lg font-bold truncate">${escapeHtml(idea.title)}</h1>
              </div>
            </div>
            <span class="badge badge-error text-xs" style="flex-shrink:0">${idea.priority}</span>
          </div>
        </div>
      </header>

      <main style="max-width:60rem;margin:0 auto;padding:1.5rem;padding-bottom:8rem">
        <div class="flex flex-wrap items-center gap-4 text-sm text-muted mb-6">
          <span class="flex items-center gap-1">${iconUser(16)} <span class="font-medium" style="color:hsl(var(--foreground))">${escapeHtml(idea.submittedBy)}</span></span>
          <span class="flex items-center gap-1">${iconCalendar(16)} ${idea.submittedAt}</span>
          <span class="flex items-center gap-1">${iconTarget(16)} ${idea.category}</span>
          <span class="flex items-center gap-1 hidden-mobile">${iconFileText(16)} 3 attachments</span>
          <span class="flex items-center gap-1 hidden-mobile">${iconMessageSquare(16)} 7 comments</span>
        </div>

        <div class="card p-6 mb-6" style="background:linear-gradient(to right,hsl(var(--primary)/0.05),hsl(var(--primary)/0.1));border-color:hsl(var(--primary)/0.2)">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm text-muted mb-1">Innovation Score</p>
              <div class="flex items-baseline gap-2">
                <span class="text-4xl font-bold text-primary">${idea.score}</span>
                <span class="text-muted">/100</span>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2rem;text-align:center">
              <div><p class="text-sm text-muted mb-1">Impact</p><p class="text-xl font-semibold">${idea.impact.level}</p></div>
              <div><p class="text-sm text-muted mb-1">Effort</p><p class="text-xl font-semibold">${idea.effort.level}</p></div>
              <div><p class="text-sm text-muted mb-1">Timeline</p><p class="text-xl font-semibold">${idea.effort.timeEstimate}</p></div>
            </div>
          </div>
        </div>

        <div class="card p-6 mb-6">
          <h3 class="font-semibold mb-3 flex items-center gap-2">${iconLightbulb(20, 'text-primary')} Idea Overview</h3>
          <p class="text-sm leading-relaxed">${escapeHtml(idea.description)}</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem" class="detail-grid mb-6">
          <div class="card p-6">
            <h3 class="font-semibold mb-3 flex items-center gap-2">${iconTrendingUp(20)} Expected Impact</h3>
            <p class="text-sm">${escapeHtml(idea.impact.description)}</p>
          </div>
          <div class="card p-6">
            <h3 class="font-semibold mb-3 flex items-center gap-2">${iconClock(20)} Effort Required</h3>
            <div style="display:flex;flex-direction:column;gap:0.75rem">
              <div class="flex justify-between"><span class="text-sm text-muted">Timeline</span><span class="text-sm font-medium">${idea.effort.timeEstimate}</span></div>
              <div class="flex justify-between"><span class="text-sm text-muted">Team Size</span><span class="text-sm font-medium">${idea.effort.teamSize}</span></div>
            </div>
          </div>
        </div>

        <div class="card p-6 mb-6">
          <h3 class="font-semibold mb-3 flex items-center gap-2">${iconDollarSign(20, 'text-primary')} Cost Estimate</h3>
          <p class="text-2xl font-bold mb-1">${idea.cost.estimate}</p>
          <p class="text-sm text-muted">${idea.cost.breakdown}</p>
        </div>

        <div class="card p-6 mb-6" style="background:linear-gradient(to right,hsl(var(--primary)/0.05),hsl(var(--primary)/0.1));border-color:hsl(var(--primary)/0.2)">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold flex items-center gap-2">${iconTarget(20, 'text-primary')} Edge: Business Outcomes &amp; Success Criteria</h3>
            <span class="badge badge-success text-xs">${iconShield(12)} High Confidence</span>
          </div>
          ${edge.outcomes.map((o: any, i: number) => `
            <div class="p-4 rounded-lg mb-3" style="background:hsl(var(--background));border:1px solid hsl(var(--border))">
              <div class="flex items-start gap-2 mb-3">
                <div style="width:1.25rem;height:1.25rem;border-radius:9999px;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:hsl(var(--primary));flex-shrink:0">${i + 1}</div>
                <p class="font-medium text-sm">${escapeHtml(o.description)}</p>
              </div>
              <div style="padding-left:1.75rem" class="flex flex-wrap gap-2">
                ${o.metrics.map((m: any) => `
                  <span class="flex items-center gap-2 text-sm" style="padding:0.375rem 0.75rem;border-radius:9999px;background:hsl(var(--muted)/0.5);border:1px solid hsl(var(--border))">
                    ${iconGauge(14, 'text-primary')} ${escapeHtml(m.name)}: <span class="font-semibold text-primary">${m.target}${m.unit}</span>
                  </span>`).join('')}
              </div>
            </div>`).join('')}
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-top:0.5rem">
            <div class="p-3 rounded-lg" style="background:hsl(var(--success-soft));border:1px solid hsl(var(--success)/0.2)">
              <div class="flex items-center gap-1 mb-2"><span class="text-xs font-medium" style="color:hsl(var(--success))">${iconClock(14)} Short-term (0-3mo)</span></div>
              <p class="text-xs">${escapeHtml(edge.impact.shortTerm)}</p>
            </div>
            <div class="p-3 rounded-lg" style="background:hsl(var(--warning-soft));border:1px solid hsl(var(--warning)/0.2)">
              <div class="flex items-center gap-1 mb-2"><span class="text-xs font-medium" style="color:hsl(var(--warning))">${iconClock(14)} Mid-term (3-12mo)</span></div>
              <p class="text-xs">${escapeHtml(edge.impact.midTerm)}</p>
            </div>
            <div class="p-3 rounded-lg" style="background:hsl(var(--info-soft));border:1px solid hsl(var(--primary)/0.2)">
              <div class="flex items-center gap-1 mb-2"><span class="text-xs font-medium text-primary">${iconClock(14)} Long-term (12+mo)</span></div>
              <p class="text-xs">${escapeHtml(edge.impact.longTerm)}</p>
            </div>
          </div>
          <div class="flex items-center justify-between mt-3 pt-3" style="border-top:1px solid hsl(var(--border))">
            <span class="text-xs text-muted">Edge Owner</span>
            <span class="text-sm font-medium">${escapeHtml(edge.owner)}</span>
          </div>
        </div>

        <div class="card p-6 mb-6">
          <h3 class="font-semibold mb-4 flex items-center gap-2">${iconAlertTriangle(20)} Identified Risks</h3>
          <div style="display:flex;flex-direction:column;gap:0.75rem">
            ${idea.risks.map((r: any) => `
              <div class="p-4 rounded-lg" style="background:hsl(var(--muted)/0.3);border:1px solid hsl(var(--border))">
                <div class="flex items-center justify-between mb-2">
                  <h4 class="font-medium text-sm">${escapeHtml(r.title)}</h4>
                  <span class="badge ${severityConfig[r.severity]} text-xs">${r.severity}</span>
                </div>
                <p class="text-xs text-muted"><span class="font-medium">Mitigation:</span> ${escapeHtml(r.mitigation)}</p>
              </div>`).join('')}
          </div>
        </div>

        <div class="card p-6 mb-6">
          <h3 class="font-semibold mb-3">Key Assumptions</h3>
          <ul style="display:flex;flex-direction:column;gap:0.5rem">
            ${idea.assumptions.map((a: string) => `<li class="flex items-start gap-2 text-sm"><span class="text-primary mt-1">•</span> ${escapeHtml(a)}</li>`).join('')}
          </ul>
        </div>

        <div class="card p-6 mb-6">
          <h3 class="font-semibold mb-3 flex items-center gap-2">${iconUsers(20, 'text-primary')} Strategic Alignment</h3>
          <div class="flex flex-wrap gap-2">
            ${idea.alignments.map((a: string) => `<span class="badge badge-primary text-xs">${escapeHtml(a)}</span>`).join('')}
          </div>
        </div>
      </main>

      <div style="position:fixed;bottom:0;left:0;right:0;background:hsl(var(--background)/0.95);backdrop-filter:blur(8px);border-top:1px solid hsl(var(--border));z-index:20">
        <div style="max-width:60rem;margin:0 auto;padding:0.75rem 1.5rem">
          <div class="flex items-center justify-between gap-4">
            <button class="btn btn-outline gap-2" id="clarify-btn">${iconMessageSquare(16)} <span class="hidden-mobile">Request Clarification</span><span class="visible-mobile">Clarify</span></button>
            <div class="flex gap-3">
              <button class="btn btn-outline gap-2" id="reject-btn" style="border-color:hsl(var(--error)/0.3);color:hsl(var(--error))">${iconXCircle(16)} <span class="hidden-mobile">Send Back</span><span class="visible-mobile">Reject</span></button>
              <button class="btn gap-2" id="approve-btn" style="background:hsl(142 71% 45%);color:white">${iconCheckCircle(16)} Approve</button>
            </div>
          </div>
        </div>
      </div>

      <div id="reject-backdrop" class="dialog-backdrop hidden"></div>
      <div id="reject-dialog" class="dialog hidden" role="dialog" aria-modal="true" style="max-width:28rem">
        <div class="dialog-header">
          <h3 class="dialog-title">Send Back for Revision</h3>
          <p class="dialog-description">Provide feedback to help the submitter improve their idea.</p>
        </div>
        <div class="py-4">
          <textarea class="textarea" id="reject-feedback" placeholder="Explain what changes or additional information is needed..." rows="4" style="resize:none"></textarea>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-outline" id="reject-cancel">Cancel</button>
          <button class="btn btn-error" id="reject-confirm">Send Back</button>
        </div>
      </div>

      <div id="clarify-backdrop" class="dialog-backdrop hidden"></div>
      <div id="clarify-dialog" class="dialog hidden" role="dialog" aria-modal="true" style="max-width:28rem">
        <div class="dialog-header">
          <h3 class="dialog-title">Request Clarification</h3>
          <p class="dialog-description">Ask the submitter for additional details before making a decision.</p>
        </div>
        <div class="py-4">
          <textarea class="textarea" id="clarify-feedback" placeholder="What additional information do you need?" rows="4" style="resize:none"></textarea>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-outline" id="clarify-cancel">Cancel</button>
          <button class="btn btn-primary" id="clarify-confirm">Send Request</button>
        </div>
      </div>
    </div>`;
}

export async function init(): Promise<void> {
  const params = getParams();
  const id = params['id'] || '1';

  const root = $('#page-root');
  if (!root) return;
  root.innerHTML = renderSkeleton('detail');

  let idea: ApprovalIdea;
  let edge: ApprovalEdge;
  try {
    [idea, edge] = await Promise.all([
      getApprovalIdea(id),
      getApprovalEdge(id),
    ]);
  } catch {
    root.innerHTML = renderError('Failed to load approval details.');
    root.querySelector('[data-retry-btn]')?.addEventListener('click', () => init());
    return;
  }

  root.innerHTML = renderPage(idea, edge);

  // Approve
  $('#approve-btn')?.addEventListener('click', () => {
    showToast('Idea approved successfully', 'success');
    navigateTo('idea-review-queue');
  });

  // Back
  $('#back-btn')?.addEventListener('click', () => navigateTo('idea-review-queue'));

  // Reject dialog
  const openReject = () => openDialog('reject');
  const closeReject = () => closeDialog('reject');
  $('#reject-btn')?.addEventListener('click', openReject);
  $('#reject-cancel')?.addEventListener('click', closeReject);
  $('#reject-backdrop')?.addEventListener('click', closeReject);
  $('#reject-confirm')?.addEventListener('click', () => {
    showToast('Idea sent back for revision', 'info');
    closeReject();
    navigateTo('idea-review-queue');
  });

  // Clarify dialog
  const openClarify = () => openDialog('clarify');
  const closeClarify = () => closeDialog('clarify');
  $('#clarify-btn')?.addEventListener('click', openClarify);
  $('#clarify-cancel')?.addEventListener('click', closeClarify);
  $('#clarify-backdrop')?.addEventListener('click', closeClarify);
  $('#clarify-confirm')?.addEventListener('click', () => {
    showToast('Clarification requested', 'info');
    closeClarify();
  });

  // Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeReject(); closeClarify(); }
  });
}
