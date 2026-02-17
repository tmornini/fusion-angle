import {
  $, escapeHtml, showToast, navigateTo, initials, initTabs, renderSkeleton, renderError,
  iconTrendingUp, iconTrendingDown, iconClock, iconDollarSign, iconUsers,
  iconCalendar, iconTarget, iconCheckCircle2, iconAlertCircle, iconMessageSquare,
  iconFileText, iconHistory, iconMoreVertical, iconPlus, iconArrowUpRight,
  iconArrowDownRight, iconMinus, iconListTodo, iconGitBranch, iconDatabase,
  iconCode, iconShield, iconBarChart, iconGauge,
} from '../../site/script';
import { getProjectById, type ProjectDetail } from '../../site/data';

function varianceHtml(baseline: number, current: number, isLowerBetter: boolean, unit: string, prefix = ''): string {
  const diff = current - baseline;
  if (diff === 0) return `<span class="text-muted">${iconMinus(16)} 0</span>`;
  const good = isLowerBetter ? diff < 0 : diff > 0;
  const icon = diff < 0 ? iconArrowDownRight(16) : iconArrowUpRight(16);
  const color = good ? 'color:hsl(142 71% 45%)' : 'color:hsl(var(--error))';
  return `<span style="${color}" class="flex items-center gap-1 font-bold text-sm">${icon} ${prefix}${Math.abs(diff)}${unit}</span>`;
}

function milestoneIcon(status: string): string {
  switch (status) {
    case 'completed': return `<div style="width:1.5rem;height:1.5rem;border-radius:9999px;background:hsl(142 71% 45%);display:flex;align-items:center;justify-content:center">${iconCheckCircle2(12, 'text-primary-fg')}</div>`;
    case 'in_progress': return `<div style="width:1.5rem;height:1.5rem;border-radius:9999px;background:hsl(var(--warning));display:flex;align-items:center;justify-content:center">${iconAlertCircle(12, 'text-primary-fg')}</div>`;
    default: return `<div style="width:1.5rem;height:1.5rem;border-radius:9999px;background:hsl(var(--muted));display:flex;align-items:center;justify-content:center">${iconClock(12, 'text-muted')}</div>`;
  }
}

function milestoneColor(status: string): string {
  switch (status) {
    case 'completed': return 'color:hsl(142 71% 45%)';
    case 'in_progress': return 'color:hsl(var(--warning))';
    default: return 'color:hsl(var(--muted-foreground))';
  }
}

function renderProjectDetail(p: ProjectDetail, projectId: string): string {
  return `
    <div style="max-width:64rem;margin:0 auto">
      <!-- Breadcrumb -->
      <div class="flex items-center gap-2 text-sm text-muted mb-4">
        <a href="../projects/index.html" class="hover-link">Projects</a>
        <span>/</span>
        <span>${escapeHtml(p.title)}</span>
      </div>

      <!-- Header -->
      <div class="flex items-start justify-between gap-4 mb-6">
        <div>
          <div class="flex flex-wrap items-center gap-3 mb-2">
            <h1 class="text-xl font-display font-bold">${escapeHtml(p.title)}</h1>
            <span class="badge badge-success text-xs">${iconCheckCircle2(14)} Approved</span>
          </div>
          <p class="text-sm text-muted">Led by ${p.projectLead} • ${p.progress}% complete</p>
        </div>
        <button class="btn btn-outline btn-icon">${iconMoreVertical(20)}</button>
      </div>

      <!-- Quick Action Links -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;margin-bottom:2rem" class="actions-grid">
        <a href="#" class="card card-hover" style="padding:1rem;text-decoration:none;color:inherit" data-nav-eng>
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

      <div class="detail-grid" style="display:grid;grid-template-columns:2fr 1fr;gap:2rem">
        <!-- Main Column -->
        <div style="display:flex;flex-direction:column;gap:1.5rem">
          <!-- Summary -->
          <div class="card p-6">
            <h2 class="text-lg font-display font-semibold mb-4">Project Summary</h2>
            <p class="text-sm text-muted mb-6">${escapeHtml(p.description)}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
              <div class="flex items-center gap-3" style="padding:0.75rem;border-radius:0.5rem;background:hsl(var(--muted)/0.5)">
                ${iconCalendar(20, 'text-primary')}
                <div><p class="text-xs text-muted">Start Date</p><p class="text-sm font-medium">${p.startDate}</p></div>
              </div>
              <div class="flex items-center gap-3" style="padding:0.75rem;border-radius:0.5rem;background:hsl(var(--muted)/0.5)">
                ${iconTarget(20, 'text-primary')}
                <div><p class="text-xs text-muted">Target End</p><p class="text-sm font-medium">${p.targetEndDate}</p></div>
              </div>
            </div>
            <div style="margin-top:1.5rem">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium">Overall Progress</span>
                <span class="text-sm font-bold text-primary">${p.progress}%</span>
              </div>
              <div class="progress"><div class="progress-fill" style="width:${p.progress}%"></div></div>
            </div>
          </div>

          <!-- Baseline vs Current -->
          <div class="card p-6">
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-lg font-display font-semibold">Baseline vs Current</h2>
              <span class="text-xs text-muted">Real-time comparison</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem" class="score-grid">
              ${[
                { label: 'Time', icon: iconClock, baseline: p.metrics.time.baseline, current: p.metrics.time.current, unit: 'h', prefix: '', lower: true },
                { label: 'Cost', icon: iconDollarSign, baseline: p.metrics.cost.baseline / 1000, current: p.metrics.cost.current / 1000, unit: 'k', prefix: '$', lower: true },
                { label: 'Impact', icon: iconTrendingUp, baseline: p.metrics.impact.baseline, current: p.metrics.impact.current, unit: ' pts', prefix: '', lower: false },
              ].map(m => `
                <div style="padding:1rem;border-radius:0.75rem;background:hsl(var(--muted)/0.3);border:1px solid hsl(var(--border))">
                  <div class="flex items-center gap-2 mb-3">${m.icon(20, 'text-primary')} <span class="font-medium">${m.label}</span></div>
                  <div style="display:flex;flex-direction:column;gap:0.5rem">
                    <div class="flex items-center justify-between"><span class="text-xs text-muted">Baseline</span><span class="text-sm font-medium">${m.prefix}${m.baseline}${m.unit}</span></div>
                    <div class="flex items-center justify-between"><span class="text-xs text-muted">Current</span><span class="text-sm font-medium">${m.prefix}${m.current}${m.unit}</span></div>
                    <div style="padding-top:0.5rem;border-top:1px solid hsl(var(--border))" class="flex items-center justify-between">
                      <span class="text-xs font-medium text-muted">Variance</span>
                      ${varianceHtml(m.baseline, m.current, m.lower, m.unit, m.prefix)}
                    </div>
                  </div>
                </div>
              `).join('')}
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
              ${p.edge.outcomes.map((outcome, oi) => `
                <div style="padding:1rem;border-radius:0.5rem;background:hsl(var(--muted)/0.3);border:1px solid hsl(var(--border))">
                  <div class="flex items-start gap-3 mb-3">
                    <div style="width:1.5rem;height:1.5rem;border-radius:9999px;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:hsl(var(--primary));flex-shrink:0">${oi + 1}</div>
                    <p class="font-medium">${escapeHtml(outcome.description)}</p>
                  </div>
                  <div style="padding-left:2.25rem;display:flex;flex-direction:column;gap:0.5rem">
                    ${outcome.metrics.map(m => {
                      const target = parseFloat(m.target);
                      const current = parseFloat(m.current);
                      const onTrack = m.unit === '$' ? current <= target : current >= target * 0.9;
                      return `
                        <div class="flex items-center justify-between gap-2" style="padding:0.5rem;border-radius:0.25rem;background:hsl(var(--background));border:1px solid hsl(var(--border))">
                          <div class="flex items-center gap-2">${iconGauge(16, 'text-muted')} <span class="text-sm">${escapeHtml(m.name)}</span></div>
                          <div class="flex items-center gap-4">
                            <div class="text-right"><p class="text-xs text-muted">Target</p><p class="text-sm font-medium">${m.unit === '$' ? '$' : ''}${m.target}${m.unit === '$' ? '' : m.unit}</p></div>
                            <div class="text-right"><p class="text-xs text-muted">Current</p><p class="text-sm font-medium ${onTrack ? 'text-success' : 'text-warning'}">${m.unit === '$' ? '$' : ''}${m.current}${m.unit === '$' ? '' : m.unit}</p></div>
                            <div style="width:0.5rem;height:0.5rem;border-radius:9999px;background:${onTrack ? 'hsl(142 71% 45%)' : 'hsl(var(--warning))'}"></div>
                          </div>
                        </div>`;
                    }).join('')}
                  </div>
                </div>
              `).join('')}
            </div>

            <!-- Impact Timeline -->
            <div style="display:flex;flex-direction:column;gap:0.75rem">
              <h3 class="text-sm font-medium flex items-center gap-2">${iconTrendingUp(16, 'text-primary')} Expected Impact Timeline</h3>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem" class="score-grid">
                <div style="padding:0.75rem;border-radius:0.5rem;background:hsl(var(--success-soft));border:1px solid hsl(142 71% 45%/0.2)">
                  <div class="flex items-center gap-1 mb-2">${iconClock(14, 'text-success')} <span class="text-xs font-medium text-success">Short-term (0-3mo)</span></div>
                  <p class="text-xs">${p.edge.impact.shortTerm}</p>
                </div>
                <div style="padding:0.75rem;border-radius:0.5rem;background:hsl(var(--warning-soft));border:1px solid hsl(var(--warning)/0.2)">
                  <div class="flex items-center gap-1 mb-2">${iconClock(14, 'text-warning')} <span class="text-xs font-medium text-warning">Mid-term (3-12mo)</span></div>
                  <p class="text-xs">${p.edge.impact.midTerm}</p>
                </div>
                <div style="padding:0.75rem;border-radius:0.5rem;background:hsl(var(--primary)/0.05);border:1px solid hsl(var(--primary)/0.2)">
                  <div class="flex items-center gap-1 mb-2">${iconClock(14, 'text-primary')} <span class="text-xs font-medium text-primary">Long-term (12+mo)</span></div>
                  <p class="text-xs">${p.edge.impact.longTerm}</p>
                </div>
              </div>
            </div>

            <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid hsl(var(--border))" class="flex items-center justify-between">
              <span class="text-xs text-muted">Edge Owner</span>
              <span class="text-sm font-medium">${p.edge.owner}</span>
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
              ].map((t, i) => `
                <button class="tab${i === 0 ? ' active' : ''}" role="tab" data-tab="${t.id}">${t.icon(16)} ${t.label}</button>
              `).join('')}
            </div>

            <div id="tab-tasks" class="tab-panel">
              <div style="display:flex;flex-direction:column;gap:0.75rem">
                ${p.tasks.map(task => {
                  const prioColor = task.priority === 'High' ? 'background:hsl(var(--error-soft));color:hsl(var(--error-text));border:1px solid hsl(var(--error-border))' : task.priority === 'Medium' ? 'background:hsl(var(--warning-soft));color:hsl(var(--warning-text));border:1px solid hsl(var(--warning-border))' : 'background:hsl(var(--muted)/0.5);color:hsl(var(--muted-foreground));border:1px solid hsl(var(--border))';
                  return `
                  <div class="card" style="padding:1rem">
                    <div class="flex items-start justify-between gap-3 mb-2">
                      <div style="flex:1">
                        <div class="flex items-center gap-2 mb-1">
                          <span class="font-medium text-sm">${escapeHtml(task.name)}</span>
                          <span style="font-size:0.625rem;padding:0.125rem 0.5rem;border-radius:9999px;${prioColor}">${task.priority}</span>
                          ${task.assigned ? `<span style="font-size:0.625rem;padding:0.125rem 0.5rem;border-radius:9999px;background:hsl(var(--primary)/0.1);color:hsl(var(--primary))">${iconUsers(10)} AI Recommended</span>` : ''}
                        </div>
                        <p class="text-xs text-muted mb-2">${escapeHtml(task.desc)}</p>
                        <div class="flex flex-wrap gap-1.5">
                          ${task.skills.map(s => `<span style="font-size:0.625rem;padding:0.125rem 0.5rem;border-radius:0.375rem;background:hsl(var(--muted)/0.5);color:hsl(var(--muted-foreground))">${escapeHtml(s)}</span>`).join('')}
                          <span class="text-xs text-muted" style="margin-left:0.25rem">${iconClock(12)} ${task.hours}h est.</span>
                        </div>
                      </div>
                      <button class="btn btn-outline btn-sm text-xs">${task.assigned ? escapeHtml(task.assigned) : 'Assign'}</button>
                    </div>
                  </div>`;
                }).join('')}
              </div>
              <div class="flex items-center justify-between mt-4 pt-4" style="border-top:1px solid hsl(var(--border))">
                <span class="text-sm text-muted">1 assigned, 4 unassigned</span>
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
                    <textarea class="textarea" id="pd-comment" placeholder="Add a comment or update..." style="min-height:5rem;resize:none"></textarea>
                    <div style="display:flex;justify-content:flex-end;margin-top:0.5rem">
                      <button class="btn btn-primary btn-sm" id="pd-post-btn" disabled>Post Comment</button>
                    </div>
                  </div>
                </div>
                <div style="border-top:1px solid hsl(var(--border));padding-top:1rem;display:flex;flex-direction:column;gap:1rem">
                  ${p.discussions.map(d => `
                    <div class="flex gap-3">
                      <div style="width:2.5rem;height:2.5rem;border-radius:9999px;background:hsl(var(--muted));display:flex;align-items:center;justify-content:center;flex-shrink:0">
                        <span class="text-sm font-bold text-muted">${initials(d.author)}</span>
                      </div>
                      <div>
                        <div class="flex items-center gap-2 mb-1">
                          <span class="font-medium">${escapeHtml(d.author)}</span>
                          <span class="text-xs text-muted">${d.date}</span>
                        </div>
                        <p class="text-sm text-muted">${escapeHtml(d.message)}</p>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
            <div id="tab-history" class="tab-panel" style="display:none">
              <div style="display:flex;flex-direction:column;gap:0.75rem">
                ${p.versions.map((v, i) => `
                  <div class="flex items-start gap-4" style="padding:1rem;border-radius:0.5rem;${i === 0 ? 'background:hsl(var(--primary)/0.05);border:1px solid hsl(var(--primary)/0.2)' : 'background:hsl(var(--muted)/0.3)'}">
                    <span style="padding:0.25rem 0.5rem;border-radius:0.25rem;font-size:0.75rem;font-weight:700;${i === 0 ? 'background:hsl(var(--primary));color:hsl(var(--primary-foreground))' : 'background:hsl(var(--muted));color:hsl(var(--muted-foreground))'}">${v.version}</span>
                    <div style="flex:1">
                      <p class="font-medium">${escapeHtml(v.changes)}</p>
                      <p class="text-xs text-muted" style="margin-top:0.25rem">${v.author} • ${v.date}</p>
                    </div>
                  </div>
                `).join('')}
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
              ${p.team.map(m => `
                <div class="flex items-center gap-3">
                  <div style="width:2.25rem;height:2.25rem;border-radius:0.5rem;background:hsl(var(--primary)/0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                    <span class="text-xs font-bold text-primary">${initials(m.name)}</span>
                  </div>
                  <div style="flex:1;min-width:0">
                    <p class="text-sm font-medium" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(m.name)}</p>
                    <p class="text-xs text-muted">${m.role}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Milestones -->
          <div class="card p-6">
            <h3 class="font-display font-semibold mb-4">Milestones</h3>
            <div style="position:relative">
              ${p.milestones.map((m, i) => `
                <div class="flex gap-3" style="padding-bottom:${i < p.milestones.length - 1 ? '1rem' : '0'}">
                  <div style="display:flex;flex-direction:column;align-items:center">
                    ${milestoneIcon(m.status)}
                    ${i < p.milestones.length - 1 ? '<div style="width:2px;flex:1;background:hsl(var(--border));margin-top:0.25rem"></div>' : ''}
                  </div>
                  <div style="flex:1;padding-bottom:0.5rem">
                    <p class="text-sm font-medium" style="${milestoneColor(m.status)}">${escapeHtml(m.title)}</p>
                    <p class="text-xs text-muted">${m.date}</p>
                  </div>
                </div>
              `).join('')}
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
  container.innerHTML = renderSkeleton('detail');

  let project: ProjectDetail;
  try {
    project = await getProjectById(projectId);
  } catch {
    container.innerHTML = renderError('Failed to load project details. The project may not exist.');
    container.querySelector('[data-retry-btn]')?.addEventListener('click', () => init(params));
    return;
  }

  container.innerHTML = renderProjectDetail(project, projectId);

  // Engineering nav
  document.querySelectorAll<HTMLElement>('[data-nav-eng]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); navigateTo('engineering-requirements', { projectId }); });
  });

  // Tabs
  initTabs('.tab[data-tab]', '.tab-panel');

  // Comment box
  const comment = $('#pd-comment') as HTMLTextAreaElement;
  const postBtn = $('#pd-post-btn') as HTMLButtonElement;
  comment?.addEventListener('input', () => { if (postBtn) postBtn.disabled = !comment.value.trim(); });
  postBtn?.addEventListener('click', () => {
    showToast('Comment posted', 'success');
    if (comment) comment.value = '';
    if (postBtn) postBtn.disabled = true;
  });
}
