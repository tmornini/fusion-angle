import {
  $, escapeHtml,
  iconActivity, iconLightbulb, iconStar, iconFolderKanban,
  iconCheckCircle2, iconMessageSquare, iconUserPlus, iconEdit,
  iconArrowRight, iconSearch, iconChevronRight,
  renderSkeleton, renderError, renderEmpty,
} from '../../site/script';
import { getActivityFeed, type ActivityItem } from '../../site/data';

function activityIconHtml(type: string): string {
  const iconMap: Record<string, { icon: (s?: number) => string; bg: string }> = {
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
  return `<div style="width:2.5rem;height:2.5rem;border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;flex-shrink:0;${entry.bg}">${entry.icon(20)}</div>`;
}

function renderActivity(a: ActivityItem): string {
  let meta = '';
  if (a.score) meta = `<div class="badge badge-default text-xs mt-1">${iconStar(12)} Score: ${a.score}</div>`;
  if (a.status) meta = `<div class="badge badge-default text-xs mt-1">${a.status}</div>`;
  if (a.comment) meta = `<p class="text-sm text-muted mt-1" style="font-style:italic">"${escapeHtml(a.comment)}"</p>`;
  return `
    <div class="flex items-start gap-4 p-4 rounded-lg" style="transition:background var(--duration-fast)" onmouseover="this.style.background='hsl(var(--muted)/0.3)'" onmouseout="this.style.background='transparent'">
      ${activityIconHtml(a.type)}
      <div style="flex:1;min-width:0">
        <p class="text-sm"><span class="font-medium">${escapeHtml(a.actor)}</span><span class="text-muted"> ${a.action} </span><span class="font-medium">${escapeHtml(a.target)}</span></p>
        ${meta}
        <p class="text-xs text-muted mt-1">${a.timestamp}</p>
      </div>
    </div>`;
}

export async function init(): Promise<void> {
  const container = $('#activity-feed-content');
  if (!container) return;

  container.innerHTML = renderSkeleton('card-list', { count: 6 });

  let activities: ActivityItem[];
  try {
    activities = await getActivityFeed();
  } catch {
    container.innerHTML = renderError('Failed to load activity feed.');
    container.querySelector('[data-retry-btn]')?.addEventListener('click', () => init());
    return;
  }

  if (activities.length === 0) {
    container.innerHTML = renderEmpty(iconActivity(24), 'No Activity Yet', 'Activity from your team will appear here as they work on ideas and projects.');
    return;
  }

  container.innerHTML = `
    <div style="max-width:48rem;margin:0 auto">
      <nav class="flex items-center gap-2 text-sm text-muted mb-6">
        <a href="../account/index.html" class="text-primary">Account</a>
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
          <input class="input search-input" placeholder="Search activity..." id="activity-search" />
        </div>
        <select class="input" style="width:10rem" id="activity-filter">
          <option value="all">All Activity</option>
          <option value="idea">Ideas</option>
          <option value="project">Projects</option>
          <option value="task">Tasks</option>
          <option value="team">Teams</option>
        </select>
      </div>

      <div id="activity-list">
        ${activities.map(renderActivity).join('')}
      </div>

      <div class="text-center mt-8">
        <button class="btn btn-outline">Load More Activity</button>
      </div>
    </div>`;
}
