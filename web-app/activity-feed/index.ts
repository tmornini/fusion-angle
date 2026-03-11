import { $ } from '../app/dom';
import { html, setHtml, SafeHtml, trusted } from '../app/safe-html';
import {
  iconActivity, iconLightbulb, iconStar, iconFolderKanban,
  iconCheckCircle2, iconMessageSquare, iconUserPlus, iconEdit,
  iconArrowRight, iconSearch, iconChevronRight,
} from '../app/icons';
import { buildSkeleton, withLoadingState } from '../app/loading-states';
import { getActivityFeed, type Activity } from '../app/adapters';

function buildActivityIcon(type: string): SafeHtml {
  const iconMap: Record<string, { icon: (size?: number) => SafeHtml; bg: string }> = {
    idea_created: { icon: iconLightbulb, bg: 'background:hsl(var(--warning-soft));color:hsl(var(--warning-text))' },
    idea_scored: { icon: iconStar, bg: 'background:hsl(var(--info-soft));color:hsl(var(--info-text))' },
    project_created: { icon: iconFolderKanban, bg: 'background:hsl(var(--primary) / 0.1);color:hsl(var(--primary))' },
    task_completed: { icon: iconCheckCircle2, bg: 'background:hsl(var(--success-soft));color:hsl(var(--success-text))' },
    comment_added: { icon: iconMessageSquare, bg: 'background:hsl(var(--info-soft));color:hsl(var(--info-text))' },
    user_joined: { icon: iconUserPlus, bg: 'background:hsl(var(--info-soft));color:hsl(var(--info-text))' },
    status_changed: { icon: iconEdit, bg: 'background:hsl(var(--warning-soft));color:hsl(var(--warning-text))' },
    idea_converted: { icon: iconArrowRight, bg: 'background:hsl(var(--success-soft));color:hsl(var(--success-text))' },
  };
  const entry = iconMap[type] || { icon: iconActivity, bg: 'background:hsl(var(--muted));color:hsl(var(--muted-foreground))' };
  return html`<div style="width:2.5rem;height:2.5rem;border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;flex-shrink:0;${entry.bg}">${entry.icon(20)}</div>`;
}

function buildActivity(activity: Activity): SafeHtml {
  const meta = activity.score
    ? html`<div class="badge badge-default text-xs mt-1">${iconStar(12)} Score: ${activity.score}</div>`
    : activity.status
      ? html`<div class="badge badge-default text-xs mt-1">${activity.status}</div>`
      : activity.comment
        ? html`<p class="text-sm text-muted mt-1" style="font-style:italic">"${activity.comment}"</p>`
        : html``;
  return html`
    <div class="flex items-start gap-4 p-4 rounded-lg activity-row">
      ${buildActivityIcon(activity.type)}
      <div style="flex:1;min-width:0">
        <p class="text-sm"><span class="font-medium">${activity.actor}</span><span class="text-muted"> ${activity.action} </span><span class="font-medium">${activity.target}</span></p>
        ${meta}
        <p class="text-xs text-muted mt-1">${activity.timestamp}</p>
      </div>
    </div>`;
}

export async function init(): Promise<void> {
  const container = $('#activity-feed-content');
  if (!container) return;

  const activities = await withLoadingState(container, buildSkeleton('card-list', { count: 6 }), getActivityFeed, () => init(), {
    icon: iconActivity(24),
    title: 'No Activity Yet',
    description: 'Activity from your team will appear here as they work on ideas and projects.',
  });
  if (!activities) return;

  setHtml(container, html`
    <div style="max-width:48rem;margin:0 auto">
      <nav class="flex items-center gap-2 text-sm text-muted mb-6">
        <a href="../account/index.html" class="hover-link">Account</a>
        ${iconChevronRight(14)} <span>Activity Feed</span>
      </nav>

      <div class="mb-8">
        <div class="flex items-center gap-3 mb-2">
          <div class="gradient-hero rounded-lg flex items-center justify-center" style="width:2.5rem;height:2.5rem;color:hsl(var(--primary-foreground))">${iconActivity(20)}</div>
          <h1 class="text-3xl font-display font-bold">Activity Feed</h1>
        </div>
        <p class="text-muted">Stay updated on recent actions across your ideas and projects</p>
      </div>

      <div class="flex items-center gap-4 mb-6">
        <div class="search-wrapper" style="flex:1">
          <span class="search-icon">${iconSearch(16)}</span>
          <input class="input search-input" placeholder="Search activity..." id="activity-search" aria-label="Search activity" />
        </div>
        <select class="input" style="width:10rem" id="activity-filter" aria-label="Filter by activity type">
          <option value="all">All Activity</option>
          <option value="idea">Ideas</option>
          <option value="project">Projects</option>
          <option value="task">Tasks</option>
          <option value="team">Teams</option>
        </select>
      </div>

      <div id="activity-list">
        ${activities.map(buildActivity)}
      </div>

      <div class="text-center mt-8">
        <button class="btn btn-outline">Load More Activity</button>
      </div>
    </div>`);
}
