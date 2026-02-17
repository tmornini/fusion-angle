import {
  $, escapeHtml, navigateTo,
  iconUser, iconSettings, iconCreditCard, iconBuilding, iconCrown,
  iconCheckCircle2, iconActivity, iconUsers, iconFolderKanban,
  iconLightbulb, iconCalendar, iconTrendingUp, iconUserPlus,
  iconExternalLink, iconBell,
  renderSkeleton, renderError,
} from '../../site/script';
import { getAccountData, type AccountData } from '../../site/data';

function usageBarColor(current: number, limit: number): string {
  const pct = (current / limit) * 100;
  if (pct >= 90) return 'background:hsl(var(--error))';
  if (pct >= 70) return 'background:hsl(var(--warning))';
  return 'background:hsl(var(--primary))';
}

function usageBar(label: string, current: number, limit: number): string {
  const pct = Math.min(100, (current / limit) * 100);
  return `
    <div>
      <div class="flex items-center justify-between text-sm mb-1">
        <span class="text-muted">${label}</span>
        <span class="font-medium">${current} / ${limit}</span>
      </div>
      <div class="progress"><div class="progress-bar" style="width:${pct}%;${usageBarColor(current, limit)}"></div></div>
    </div>`;
}

function activityIcon(type: string): string {
  if (type === 'user_added') return `<div style="width:2rem;height:2rem;border-radius:var(--radius-lg);background:hsl(var(--info-soft));display:flex;align-items:center;justify-content:center;color:hsl(var(--info-text))">${iconUserPlus(16)}</div>`;
  if (type === 'project_created') return `<div style="width:2rem;height:2rem;border-radius:var(--radius-lg);background:hsl(var(--info-soft));display:flex;align-items:center;justify-content:center;color:hsl(var(--primary))">${iconFolderKanban(16)}</div>`;
  return `<div style="width:2rem;height:2rem;border-radius:var(--radius-lg);background:hsl(var(--success-soft));display:flex;align-items:center;justify-content:center;color:hsl(var(--success-text))">${iconCreditCard(16)}</div>`;
}

export async function init(): Promise<void> {
  const container = $('#account-content');
  if (!container) return;

  container.innerHTML = renderSkeleton('detail');

  let d: AccountData;
  try {
    d = await getAccountData();
  } catch {
    container.innerHTML = renderError('Failed to load account data.');
    container.querySelector('[data-retry-btn]')?.addEventListener('click', () => init());
    return;
  }

  const billingDate = new Date(d.company.nextBilling).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  container.innerHTML = `
    <div style="max-width:64rem;margin:0 auto">
      <div class="mb-8">
        <h1 class="text-3xl font-display font-bold mb-2">Account Overview</h1>
        <p class="text-muted">Manage your organization, users, and billing settings</p>
      </div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <button class="btn btn-outline" style="height:auto;padding:0.75rem 1rem;justify-content:flex-start;gap:0.75rem" data-nav-to="profile">
          <div style="width:2.5rem;height:2.5rem;border-radius:var(--radius-lg);background:hsl(var(--primary) / 0.1);display:flex;align-items:center;justify-content:center;color:hsl(var(--primary))">${iconUser(20)}</div>
          <div class="text-left">
            <p class="font-medium text-sm">My Profile</p>
            <p class="text-xs text-muted">Personal settings</p>
          </div>
        </button>
        <button class="btn btn-outline" style="height:auto;padding:0.75rem 1rem;justify-content:flex-start;gap:0.75rem" data-nav-to="company-settings">
          <div style="width:2.5rem;height:2.5rem;border-radius:var(--radius-lg);background:hsl(var(--info-soft));display:flex;align-items:center;justify-content:center;color:hsl(var(--info-text))">${iconSettings(20)}</div>
          <div class="text-left">
            <p class="font-medium text-sm">Company Settings</p>
            <p class="text-xs text-muted">Organization config</p>
          </div>
        </button>
        <button class="btn btn-outline" style="height:auto;padding:0.75rem 1rem;justify-content:flex-start;gap:0.75rem">
          <div style="width:2.5rem;height:2.5rem;border-radius:var(--radius-lg);background:hsl(var(--success-soft));display:flex;align-items:center;justify-content:center;color:hsl(var(--success-text))">${iconCreditCard(20)}</div>
          <div class="text-left">
            <p class="font-medium text-sm">Billing</p>
            <p class="text-xs text-muted">Plans & invoices</p>
          </div>
        </button>
      </div>

      <!-- Company Overview -->
      <div class="card card-hover p-6 mb-6">
        <div class="flex items-center justify-between gap-4 mb-6" style="flex-wrap:wrap">
          <div class="flex items-center gap-4" style="flex:1">
            <div style="width:3.5rem;height:3.5rem;border-radius:var(--radius-xl);background:linear-gradient(135deg,hsl(var(--primary) / 0.2),hsl(var(--primary) / 0.05));display:flex;align-items:center;justify-content:center;color:hsl(var(--primary))">${iconBuilding(28)}</div>
            <div>
              <h2 class="text-xl font-display font-semibold">${escapeHtml(d.company.name)}</h2>
              <div class="flex items-center gap-2 mt-1">
                <span class="badge badge-default text-xs">${iconCrown(12)} ${d.company.plan} Plan</span>
                <span class="status-badge-success">${iconCheckCircle2(12)} Active</span>
              </div>
            </div>
          </div>
          <div class="status-badge-success" style="padding:0.5rem 1rem;align-self:flex-start">
            <div class="flex items-center gap-2">
              ${iconActivity(16)}
              <span class="text-sm font-medium">${d.health.status}</span>
            </div>
            <p class="text-xs mt-1">Health Score: ${d.health.score}%</p>
          </div>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="p-4 rounded-lg" style="background:hsl(var(--muted) / 0.3)">
            <div class="flex items-center gap-2 text-muted mb-1">${iconUsers(16)} <span class="text-xs">Active Users</span></div>
            <p class="text-2xl font-bold">${d.company.usedSeats}<span class="text-sm font-normal text-muted">/${d.company.seats}</span></p>
          </div>
          <div class="p-4 rounded-lg" style="background:hsl(var(--muted) / 0.3)">
            <div class="flex items-center gap-2 text-muted mb-1">${iconFolderKanban(16)} <span class="text-xs">Projects</span></div>
            <p class="text-2xl font-bold">${d.usage.projects.current}</p>
          </div>
          <div class="p-4 rounded-lg" style="background:hsl(var(--muted) / 0.3)">
            <div class="flex items-center gap-2 text-muted mb-1">${iconLightbulb(16)} <span class="text-xs">Ideas</span></div>
            <p class="text-2xl font-bold">${d.usage.ideas.current}</p>
          </div>
          <div class="p-4 rounded-lg" style="background:hsl(var(--muted) / 0.3)">
            <div class="flex items-center gap-2 text-muted mb-1">${iconCalendar(16)} <span class="text-xs">Next Billing</span></div>
            <p class="text-lg font-bold">${billingDate}</p>
          </div>
        </div>
      </div>

      <!-- Usage & Activity -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="card card-hover p-6">
          <h3 class="font-display font-semibold mb-4 flex items-center gap-2">${iconTrendingUp(20)} Usage Overview</h3>
          <div class="flex flex-col gap-4">
            ${usageBar('User Seats', d.company.usedSeats, d.company.seats)}
            ${usageBar('Projects', d.usage.projects.current, d.usage.projects.limit)}
            ${usageBar('Ideas', d.usage.ideas.current, d.usage.ideas.limit)}
            ${usageBar('AI Credits', d.usage.aiCredits.current, d.usage.aiCredits.limit)}
            ${usageBar('Storage (GB)', d.usage.storage.current, d.usage.storage.limit)}
          </div>
        </div>

        <div class="card card-hover p-6">
          <h3 class="font-display font-semibold mb-4 flex items-center gap-2">${iconActivity(20)} Recent Activity</h3>
          <div class="flex flex-col gap-4">
            ${d.recentActivity.map(a => `
              <div class="flex items-start gap-3">
                ${activityIcon(a.type)}
                <div style="flex:1;min-width:0">
                  <p class="text-sm">${escapeHtml(a.description)}</p>
                  <p class="text-xs text-muted">${a.time}</p>
                </div>
              </div>`).join('')}
          </div>
          <button class="btn btn-ghost btn-sm w-full mt-4" data-nav-to="activity-feed">View All Activity</button>
        </div>
      </div>

      <!-- Admin Links -->
      <div class="card card-hover p-6 mt-6">
        <h3 class="font-display font-semibold mb-4">Security & Administration</h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button class="flex items-center gap-3 p-4 rounded-lg border cursor-pointer text-left w-full" style="border-color:hsl(var(--border));transition:all var(--duration-fast) var(--ease-default)" data-nav-to="manage-users" onmouseover="this.style.borderColor='hsl(var(--primary) / 0.5)'" onmouseout="this.style.borderColor='hsl(var(--border))'">
            <span style="color:hsl(var(--muted-foreground))">${iconUsers(20)}</span>
            <div style="flex:1;min-width:0">
              <p class="font-medium text-sm">Manage Users</p>
              <p class="text-xs text-muted truncate">Add, edit, or remove team members</p>
            </div>
            ${iconExternalLink(16)}
          </button>
          <button class="flex items-center gap-3 p-4 rounded-lg border cursor-pointer text-left w-full" style="border-color:hsl(var(--border));transition:all var(--duration-fast) var(--ease-default)" data-nav-to="notification-settings" onmouseover="this.style.borderColor='hsl(var(--primary) / 0.5)'" onmouseout="this.style.borderColor='hsl(var(--border))'">
            <span style="color:hsl(var(--muted-foreground))">${iconBell(20)}</span>
            <div style="flex:1;min-width:0">
              <p class="font-medium text-sm">Notifications</p>
              <p class="text-xs text-muted truncate">Email & push preferences</p>
            </div>
            ${iconExternalLink(16)}
          </button>
          <button class="flex items-center gap-3 p-4 rounded-lg border cursor-pointer text-left w-full" style="border-color:hsl(var(--border));transition:all var(--duration-fast) var(--ease-default)" onmouseover="this.style.borderColor='hsl(var(--primary) / 0.5)'" onmouseout="this.style.borderColor='hsl(var(--border))'">
            <span style="color:hsl(var(--muted-foreground))">${iconCreditCard(20)}</span>
            <div style="flex:1;min-width:0">
              <p class="font-medium text-sm">Billing History</p>
              <p class="text-xs text-muted truncate">View invoices and payments</p>
            </div>
            ${iconExternalLink(16)}
          </button>
        </div>
      </div>
    </div>`;

  // Bind navigation
  container.querySelectorAll<HTMLElement>('[data-nav-to]').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.getAttribute('data-nav-to')!));
  });
}
