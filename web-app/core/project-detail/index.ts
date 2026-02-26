import {
  $, showToast, navigateTo, initials, initTabs, html, setHtml, SafeHtml,
  buildSkeleton, buildErrorState,
  iconTrendingUp, iconTrendingDown, iconClock, iconDollarSign, iconUsers,
  iconCalendar, iconTarget, iconCheckCircle2, iconAlertCircle, iconMessageSquare,
  iconFileText, iconHistory, iconMoreVertical, iconPlus, iconArrowUpRight,
  iconArrowDownRight, iconMinus, iconListTodo, iconGitBranch, iconDatabase,
  iconCode, iconShield, iconBarChart, iconGauge,
} from '../../site/script';
import { getProjectById, type ProjectDetail } from '../../site/data';

function buildVariance(baseline: number, current: number, isLowerBetter: boolean, unit: string, prefix = ''): SafeHtml {
  const diff = current - baseline;
  if (diff === 0) return html`<span class="text-muted">${iconMinus(16)} 0</span>`;
  const good = isLowerBetter ? diff < 0 : diff > 0;
  const icon = diff < 0 ? iconArrowDownRight(16) : iconArrowUpRight(16);
  const color = good ? 'color:hsl(var(--success))' : 'color:hsl(var(--error))';
  return html`<span style="${color}" class="flex items-center gap-1 font-bold text-sm">${icon} ${prefix}${Math.abs(diff)}${unit}</span>`;
}

function buildMilestoneIcon(status: string): SafeHtml {
  switch (status) {
    case 'completed': return html`<div style="width:1.5rem;height:1.5rem;border-radius:9999px;background:hsl(var(--success));display:flex;align-items:center;justify-content:center">${iconCheckCircle2(12, 'text-primary-fg')}</div>`;
    case 'in_progress': return html`<div style="width:1.5rem;height:1.5rem;border-radius:9999px;background:hsl(var(--warning));display:flex;align-items:center;justify-content:center">${iconAlertCircle(12, 'text-primary-fg')}</div>`;
    default: return html`<div style="width:1.5rem;height:1.5rem;border-radius:9999px;background:hsl(var(--muted));display:flex;align-items:center;justify-content:center">${iconClock(12, 'text-muted')}</div>`;
  }
}

function styleForMilestone(status: string): string {
  switch (status) {
    case 'completed': return 'color:hsl(var(--success))';
    case 'in_progress': return 'color:hsl(var(--warning))';
    default: return 'color:hsl(var(--muted-foreground))';
  }
}

function buildProjectDetail(project: ProjectDetail, projectId: string): SafeHtml {
  return html`
    <div style="max-width:64rem;margin:0 auto">
      <!-- Breadcrumb -->
      <div class="flex items-center gap-2 text-sm text-muted mb-4">
        <a href="../projects/index.html" class="hover-link">Projects</a>
        <span>/</span>
        <span>${project.title}</span>
      </div>

      <!-- Header -->
      <div class="flex items-start justify-between gap-4 mb-6">
        <div>
          <div class="flex flex-wrap items-center gap-3 mb-2">
            <h1 class="text-xl font-display font-bold">${project.title}</h1>
            <span class="badge badge-success text-xs">${iconCheckCircle2(14)} Approved</span>
          </div>
          <p class="text-sm text-muted">Led by ${project.projectLead} • ${project.progress}% complete</p>
        </div>
        <button class="btn btn-outline btn-icon">${iconMoreVertical(20)}</button>
      </div>

      <!-- Quick Action Links -->
      <div class="actions-grid mb-8" style="gap:0.75rem">
        <a href="#" class="card card-hover" style="padding:1rem;text-decoration:none;color:inherit" data-navigate-to-engineering>
          <div class="flex items-center gap-3">
            <div style="padding:0.5rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1)">${iconCode(20, 'text-primary')}</div>
            <div style="min-width:0"><p class="font-medium text-sm">Engineering</p><p class="text-xs text-muted hidden-mobile">Requirements & clarifications</p></div>
          </div>
        </a>
        <a href="../team/index.html" class="card card-hover" style="padding:1rem;text-decoration:none;color:inherit">
          <div class="flex items-center gap-3">
            <div style="padding:0.5rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1)">${iconUsers(20, 'text-primary')}</div>
            <div style="min-width:0"><p class="font-medium text-sm">Team</p><p class="text-xs text-muted hidden-mobile">Manage assignments</p></div>
          </div>
        </a>
        <a href="../flow/index.html" class="card card-hover" style="padding:1rem;text-decoration:none;color:inherit">
          <div class="flex items-center gap-3">
            <div style="padding:0.5rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1)">${iconGitBranch(20, 'text-primary')}</div>
            <div style="min-width:0"><p class="font-medium text-sm">Flow</p><p class="text-xs text-muted hidden-mobile">Document processes</p></div>
          </div>
        </a>
        <a href="../crunch/index.html" class="card card-hover" style="padding:1rem;text-decoration:none;color:inherit">
          <div class="flex items-center gap-3">
            <div style="padding:0.5rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1)">${iconDatabase(20, 'text-primary')}</div>
            <div style="min-width:0"><p class="font-medium text-sm">Crunch</p><p class="text-xs text-muted hidden-mobile">Data inputs</p></div>
          </div>
        </a>
      </div>

      <div class="detail-grid" style="gap:2rem">
        <!-- Main Column -->
        <div style="display:flex;flex-direction:column;gap:1.5rem">
          <!-- Summary -->
          <div class="card p-6">
            <h2 class="text-lg font-display font-semibold mb-4">Project Summary</h2>
            <p class="text-sm text-muted mb-6">${project.description}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
              <div class="flex items-center gap-3" style="padding:0.75rem;border-radius:0.5rem;background:hsl(var(--muted)/0.5)">
                ${iconCalendar(20, 'text-primary')}
                <div><p class="text-xs text-muted">Start Date</p><p class="text-sm font-medium">${project.startDate}</p></div>
              </div>
              <div class="flex items-center gap-3" style="padding:0.75rem;border-radius:0.5rem;background:hsl(var(--muted)/0.5)">
                ${iconTarget(20, 'text-primary')}
                <div><p class="text-xs text-muted">Target End</p><p class="text-sm font-medium">${project.targetEndDate}</p></div>
              </div>
            </div>
            <div style="margin-top:1.5rem">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium">Overall Progress</span>
                <span class="text-sm font-bold text-primary">${project.progress}%</span>
              </div>
              <div class="progress"><div class="progress-fill" style="width:${project.progress}%"></div></div>
            </div>
          </div>

          <!-- Baseline vs Current -->
          <div class="card p-6">
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-lg font-display font-semibold">Baseline vs Current</h2>
              <span class="text-xs text-muted">Real-time comparison</span>
            </div>
            <div class="score-grid">
              ${[
                { label: 'Time', icon: iconClock, baseline: project.metrics.time.baseline, current: project.metrics.time.current, unit: 'h', prefix: '', isLowerBetter: true },
                { label: 'Cost', icon: iconDollarSign, baseline: project.metrics.cost.baseline / 1000, current: project.metrics.cost.current / 1000, unit: 'k', prefix: '$', isLowerBetter: true },
                { label: 'Impact', icon: iconTrendingUp, baseline: project.metrics.impact.baseline, current: project.metrics.impact.current, unit: ' pts', prefix: '', isLowerBetter: false },
              ].map(metric => html`
                <div style="padding:1rem;border-radius:0.75rem;background:hsl(var(--muted)/0.3);border:1px solid hsl(var(--border))">
                  <div class="flex items-center gap-2 mb-3">${metric.icon(20, 'text-primary')} <span class="font-medium">${metric.label}</span></div>
                  <div style="display:flex;flex-direction:column;gap:0.5rem">
                    <div class="flex items-center justify-between"><span class="text-xs text-muted">Baseline</span><span class="text-sm font-medium">${metric.baseline ? `${metric.prefix}${metric.baseline}${metric.unit}` : '—'}</span></div>
                    <div class="flex items-center justify-between"><span class="text-xs text-muted">Current</span><span class="text-sm font-medium">${metric.current ? `${metric.prefix}${metric.current}${metric.unit}` : '—'}</span></div>
                    <div style="padding-top:0.5rem;border-top:1px solid hsl(var(--border))" class="flex items-center justify-between">
                      <span class="text-xs font-medium text-muted">Variance</span>
                      ${buildVariance(metric.baseline, metric.current, metric.isLowerBetter, metric.unit, metric.prefix)}
                    </div>
                  </div>
                </div>
              `)}
            </div>
          </div>

          <!-- Edge Baseline KPIs -->
          <div class="card p-6">
            <div class="flex items-center justify-between gap-3 mb-6">
              <div class="flex items-center gap-3">
                <div style="padding:0.5rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1)">${iconTarget(20, 'text-primary')}</div>
                <div>
                  <h2 class="text-lg font-display font-semibold">Edge Baseline KPIs</h2>
                  <p class="text-xs text-muted">Original success criteria from idea approval</p>
                </div>
              </div>
              <span class="badge badge-success text-xs">${iconShield(12)} High Confidence</span>
            </div>

            <div style="display:flex;flex-direction:column;gap:1rem;margin-bottom:1.5rem">
              <h3 class="text-sm font-medium flex items-center gap-2">${iconBarChart(16, 'text-primary')} Business Outcomes & Metrics</h3>
              ${project.edge.outcomes.map((outcome, oi) => html`
                <div style="padding:1rem;border-radius:0.5rem;background:hsl(var(--muted)/0.3);border:1px solid hsl(var(--border))">
                  <div class="flex items-start gap-3 mb-3">
                    <div style="width:1.5rem;height:1.5rem;border-radius:9999px;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:hsl(var(--primary));flex-shrink:0">${oi + 1}</div>
                    <p class="font-medium">${outcome.description}</p>
                  </div>
                  <div style="padding-left:2.25rem;display:flex;flex-direction:column;gap:0.5rem">
                    ${outcome.metrics.map(kpi => {
                      const target = parseFloat(kpi.target);
                      const current = parseFloat(kpi.current);
                      const isOnTrack = kpi.unit === '$' ? current <= target : current >= target * 0.9;
                      return html`
                        <div class="flex items-center justify-between gap-2" style="padding:0.5rem;border-radius:0.25rem;background:hsl(var(--background));border:1px solid hsl(var(--border))">
                          <div class="flex items-center gap-2">${iconGauge(16, 'text-muted')} <span class="text-sm">${kpi.name}</span></div>
                          <div class="flex items-center gap-4">
                            <div class="text-right"><p class="text-xs text-muted">Target</p><p class="text-sm font-medium">${kpi.unit === '$' ? '$' : ''}${kpi.target}${kpi.unit === '$' ? '' : kpi.unit}</p></div>
                            <div class="text-right"><p class="text-xs text-muted">Current</p><p class="text-sm font-medium ${isOnTrack ? 'text-success' : 'text-warning'}">${kpi.unit === '$' ? '$' : ''}${kpi.current}${kpi.unit === '$' ? '' : kpi.unit}</p></div>
                            <div style="width:0.5rem;height:0.5rem;border-radius:9999px;background:${isOnTrack ? 'hsl(var(--success))' : 'hsl(var(--warning))'}"></div>
                          </div>
                        </div>`;
                    })}
                  </div>
                </div>
              `)}
            </div>

            <!-- Impact Timeline -->
            <div style="display:flex;flex-direction:column;gap:0.75rem">
              <h3 class="text-sm font-medium flex items-center gap-2">${iconTrendingUp(16, 'text-primary')} Expected Impact Timeline</h3>
              <div class="score-grid" style="gap:0.75rem">
                <div style="padding:0.75rem;border-radius:0.5rem;background:hsl(var(--success-soft));border:1px solid hsl(var(--success) / 0.2)">
                  <div class="flex items-center gap-1 mb-2">${iconClock(14, 'text-success')} <span class="text-xs font-medium text-success">Short-term (0-3mo)</span></div>
                  <p class="text-xs">${project.edge.impact.shortTerm}</p>
                </div>
                <div style="padding:0.75rem;border-radius:0.5rem;background:hsl(var(--warning-soft));border:1px solid hsl(var(--warning)/0.2)">
                  <div class="flex items-center gap-1 mb-2">${iconClock(14, 'text-warning')} <span class="text-xs font-medium text-warning">Mid-term (3-12mo)</span></div>
                  <p class="text-xs">${project.edge.impact.midTerm}</p>
                </div>
                <div style="padding:0.75rem;border-radius:0.5rem;background:hsl(var(--primary)/0.05);border:1px solid hsl(var(--primary)/0.2)">
                  <div class="flex items-center gap-1 mb-2">${iconClock(14, 'text-primary')} <span class="text-xs font-medium text-primary">Long-term (12+mo)</span></div>
                  <p class="text-xs">${project.edge.impact.longTerm}</p>
                </div>
              </div>
            </div>

            <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid hsl(var(--border))" class="flex items-center justify-between">
              <span class="text-xs text-muted">Edge Owner</span>
              <span class="text-sm font-medium">${project.edge.owner}</span>
            </div>
          </div>

          <!-- Tabs -->
          <div class="card p-6">
            <div class="tabs" role="tablist" style="margin-bottom:1.5rem">
              ${[
                { id: 'tasks', label: 'Tasks', icon: iconListTodo },
                { id: 'discussion', label: 'Discussion', icon: iconMessageSquare },
                { id: 'history', label: 'History', icon: iconHistory },
                { id: 'linked', label: 'Linked Data', icon: iconFileText },
              ].map((tab, tabIndex) => html`
                <button class="tab${tabIndex === 0 ? ' active' : ''}" role="tab" data-tab="${tab.id}">${tab.icon(16)} ${tab.label}</button>
              `)}
            </div>

            <div id="tab-tasks" class="tab-panel">
              <div style="display:flex;flex-direction:column;gap:0.75rem">
                ${project.tasks.map(task => {
                  const prioColor = task.priority === 'High' ? 'background:hsl(var(--error-soft));color:hsl(var(--error-text));border:1px solid hsl(var(--error-border))' : task.priority === 'Medium' ? 'background:hsl(var(--warning-soft));color:hsl(var(--warning-text));border:1px solid hsl(var(--warning-border))' : 'background:hsl(var(--muted)/0.5);color:hsl(var(--muted-foreground));border:1px solid hsl(var(--border))';
                  return html`
                  <div class="card" style="padding:1rem">
                    <div class="flex items-start justify-between gap-3 mb-2">
                      <div style="flex:1">
                        <div class="flex items-center gap-2 mb-1">
                          <span class="font-medium text-sm">${task.name}</span>
                          <span class="pill" style="${prioColor}">${task.priority}</span>
                          ${task.assigned ? html`<span class="pill" style="background:hsl(var(--primary)/0.1);color:hsl(var(--primary))">${iconUsers(10)} AI Recommended</span>` : html``}
                        </div>
                        <p class="text-xs text-muted mb-2">${task.description}</p>
                        <div class="flex flex-wrap gap-1.5">
                          ${task.skills.map(skill => html`<span class="pill-tag" style="background:hsl(var(--muted)/0.5)">${skill}</span>`)}
                          <span class="text-xs text-muted" style="margin-left:0.25rem">${iconClock(12)} ${task.hours}h est.</span>
                        </div>
                      </div>
                      <button class="btn btn-outline btn-sm text-xs">${task.assigned ? task.assigned : 'Assign'}</button>
                    </div>
                  </div>`;
                })}
              </div>
              <div class="flex items-center justify-between mt-4 pt-4" style="border-top:1px solid hsl(var(--border))">
                <span class="text-sm text-muted">${project.tasks.filter(task => task.assigned).length} assigned, ${project.tasks.filter(task => !task.assigned).length} unassigned</span>
                <button class="btn btn-primary btn-sm">Save Assignments</button>
              </div>
            </div>
            <div id="tab-discussion" class="tab-panel" style="display:none">
              <div style="display:flex;flex-direction:column;gap:1rem">
                <div class="flex gap-3">
                  <div style="width:2.5rem;height:2.5rem;border-radius:9999px;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                    <span class="text-sm font-bold text-primary">D</span>
                  </div>
                  <div style="flex:1">
                    <textarea class="textarea" id="project-discussion-comment" placeholder="Add a comment or update..." style="min-height:5rem;resize:none"></textarea>
                    <div style="display:flex;justify-content:flex-end;margin-top:0.5rem">
                      <button class="btn btn-primary btn-sm" id="project-discussion-post-btn" disabled>Post Comment</button>
                    </div>
                  </div>
                </div>
                <div style="border-top:1px solid hsl(var(--border));padding-top:1rem;display:flex;flex-direction:column;gap:1rem">
                  ${project.discussions.map(discussion => html`
                    <div class="flex gap-3">
                      <div style="width:2.5rem;height:2.5rem;border-radius:9999px;background:hsl(var(--muted));display:flex;align-items:center;justify-content:center;flex-shrink:0">
                        <span class="text-sm font-bold text-muted">${initials(discussion.author)}</span>
                      </div>
                      <div>
                        <div class="flex items-center gap-2 mb-1">
                          <span class="font-medium">${discussion.author}</span>
                          <span class="text-xs text-muted">${discussion.date}</span>
                        </div>
                        <p class="text-sm text-muted">${discussion.message}</p>
                      </div>
                    </div>
                  `)}
                </div>
              </div>
            </div>
            <div id="tab-history" class="tab-panel" style="display:none">
              <div style="display:flex;flex-direction:column;gap:0.75rem">
                ${project.versions.map((version, versionIndex) => html`
                  <div class="flex items-start gap-4" style="padding:1rem;border-radius:0.5rem;${versionIndex === 0 ? 'background:hsl(var(--primary)/0.05);border:1px solid hsl(var(--primary)/0.2)' : 'background:hsl(var(--muted)/0.3)'}">
                    <span style="padding:0.25rem 0.5rem;border-radius:0.25rem;font-size:0.75rem;font-weight:700;${versionIndex === 0 ? 'background:hsl(var(--primary));color:hsl(var(--primary-foreground))' : 'background:hsl(var(--muted));color:hsl(var(--muted-foreground))'}">${version.version}</span>
                    <div style="flex:1">
                      <p class="font-medium">${version.changes}</p>
                      <p class="text-xs text-muted" style="margin-top:0.25rem">${version.author} • ${version.date}</p>
                    </div>
                  </div>
                `)}
              </div>
            </div>
            <div id="tab-linked" class="tab-panel" style="display:none">
              <div style="text-align:center;padding:2rem 0">
                ${iconFileText(48, 'text-muted')}
                <p class="text-muted mt-4 mb-4">No linked data yet</p>
                <button class="btn btn-outline btn-sm gap-2">${iconPlus(16)} Link Data Source</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div style="display:flex;flex-direction:column;gap:1.5rem">
          <!-- Team -->
          <div class="card p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-display font-semibold">Team</h3>
              <button class="btn btn-ghost btn-sm gap-1">${iconPlus(14)} Add</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.75rem">
              ${project.team.map(teamMember => html`
                <div class="flex items-center gap-3">
                  <div style="width:2.25rem;height:2.25rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                    <span class="text-xs font-bold text-primary">${initials(teamMember.name)}</span>
                  </div>
                  <div style="flex:1;min-width:0">
                    <p class="text-sm font-medium" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${teamMember.name}</p>
                    <p class="text-xs text-muted">${teamMember.role}</p>
                  </div>
                </div>
              `)}
            </div>
          </div>

          <!-- Milestones -->
          <div class="card p-6">
            <h3 class="font-display font-semibold mb-4">Milestones</h3>
            <div style="position:relative">
              ${project.milestones.map((milestone, milestoneIndex) => html`
                <div class="flex gap-3" style="padding-bottom:${milestoneIndex < project.milestones.length - 1 ? '1rem' : '0'}">
                  <div style="display:flex;flex-direction:column;align-items:center">
                    ${buildMilestoneIcon(milestone.status)}
                    ${milestoneIndex < project.milestones.length - 1 ? html`<div style="width:2px;flex:1;background:hsl(var(--border));margin-top:0.25rem"></div>` : html``}
                  </div>
                  <div style="flex:1;padding-bottom:0.5rem">
                    <p class="text-sm font-medium" style="${styleForMilestone(milestone.status)}">${milestone.title}</p>
                    <p class="text-xs text-muted">${milestone.date}</p>
                  </div>
                </div>
              `)}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

export async function init(params?: Record<string, string>): Promise<void> {
  const projectId = params?.projectId || '1';

  const container = $('#project-detail-content');
  if (!container) return;
  setHtml(container, buildSkeleton('detail'));

  let project: ProjectDetail;
  try {
    project = await getProjectById(projectId);
  } catch {
    setHtml(container, buildErrorState('Failed to load project details. The project may not exist.'));
    container.querySelector('[data-retry-btn]')?.addEventListener('click', () => init(params));
    return;
  }

  setHtml(container, buildProjectDetail(project, projectId));

  // Engineering nav
  document.querySelectorAll<HTMLElement>('[data-navigate-to-engineering]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); navigateTo('engineering-requirements', { projectId }); });
  });

  // Tabs
  initTabs('.tab[data-tab]', '.tab-panel');

  // Comment box
  const comment = $('#project-discussion-comment') as HTMLTextAreaElement;
  const postBtn = $('#project-discussion-post-btn') as HTMLButtonElement;
  comment?.addEventListener('input', () => { if (postBtn) postBtn.disabled = !comment.value.trim(); });
  postBtn?.addEventListener('click', () => {
    showToast('Comment posted', 'success');
    if (comment) comment.value = '';
    if (postBtn) postBtn.disabled = true;
  });
}
