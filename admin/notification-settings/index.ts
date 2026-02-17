import {
  $, showToast, icons,
  iconBell, iconMail, iconSmartphone, iconChevronRight, iconSave,
} from '../../site/script';
import { getNotificationCategories, type NotificationCategory } from '../../site/data';

function switchHtml(id: string, checked: boolean): string {
  return `<button class="switch" role="switch" aria-checked="${checked}" data-pref="${id}"><span class="switch-thumb"></span></button>`;
}

function renderCategory(cat: NotificationCategory): string {
  const catIcon = icons[cat.icon] || icons['bell'];
  const rows = cat.prefs.map(p => `
    <div class="flex items-center justify-between p-4" style="border-bottom:1px solid hsl(var(--border))">
      <div style="flex:1;min-width:0;margin-right:2rem">
        <p class="font-medium">${p.label}</p>
        <p class="text-sm text-muted">${p.description}</p>
      </div>
      <div class="flex items-center gap-6">
        <div class="flex items-center gap-2">${iconMail(16)} ${switchHtml(p.id + '-email', p.email)}</div>
        <div class="flex items-center gap-2">${iconSmartphone(16)} ${switchHtml(p.id + '-push', p.push)}</div>
      </div>
    </div>`).join('');

  return `
    <div class="card" style="overflow:hidden;margin-bottom:1.5rem">
      <div class="flex items-center justify-between p-4" style="background:hsl(var(--muted)/0.2);border-bottom:1px solid hsl(var(--border))">
        <div class="flex items-center gap-3">
          <div style="width:2.5rem;height:2.5rem;border-radius:var(--radius-lg);background:hsl(var(--primary)/0.1);color:hsl(var(--primary));display:flex;align-items:center;justify-content:center">${catIcon ? catIcon(20) : ''}</div>
          <h3 class="font-display font-semibold">${cat.label}</h3>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn btn-ghost btn-xs" data-enable-all="${cat.id}">Enable all</button>
          <button class="btn btn-ghost btn-xs text-muted" data-disable-all="${cat.id}">Disable all</button>
        </div>
      </div>
      <div data-cat-prefs="${cat.id}">${rows}</div>
    </div>`;
}

export async function init(): Promise<void> {
  const categories = await getNotificationCategories();
  const container = $('#notification-settings-content');
  if (!container) return;

  container.innerHTML = `
    <div style="max-width:48rem;margin:0 auto">
      <nav class="flex items-center gap-2 text-sm text-muted mb-6">
        <a href="../account/index.html" class="text-primary">Account</a>
        ${iconChevronRight(14)} <span>Notification Settings</span>
      </nav>

      <div class="mb-8">
        <div class="flex items-center gap-3 mb-2">
          <div class="gradient-hero rounded-lg flex items-center justify-center" style="width:2.5rem;height:2.5rem;color:hsl(var(--primary-foreground))">${iconBell(20)}</div>
          <h1 class="text-3xl font-display font-bold">Notification Settings</h1>
        </div>
        <p class="text-muted">Choose which events trigger notifications and how you'd like to receive them</p>
      </div>

      <div class="flex items-center gap-6 mb-6 p-4 rounded-lg" style="background:hsl(var(--muted)/0.3)">
        <div class="flex items-center gap-2 text-muted">${iconMail(16)} <span class="text-sm">Email</span></div>
        <div class="flex items-center gap-2 text-muted">${iconSmartphone(16)} <span class="text-sm">Push</span></div>
      </div>

      ${categories.map(renderCategory).join('')}

      <div class="flex justify-end mt-6">
        <button class="btn btn-primary gap-2" id="save-notif">${iconSave(16)} Save Changes</button>
      </div>
    </div>`;

  // Switch toggles
  document.querySelectorAll<HTMLElement>('.switch[role="switch"]').forEach(sw => {
    sw.addEventListener('click', () => {
      const checked = sw.getAttribute('aria-checked') === 'true';
      sw.setAttribute('aria-checked', String(!checked));
    });
  });

  // Enable/disable all
  document.querySelectorAll<HTMLElement>('[data-enable-all]').forEach(btn => {
    btn.addEventListener('click', () => {
      const catId = btn.getAttribute('data-enable-all');
      const catContainer = document.querySelector(`[data-cat-prefs="${catId}"]`);
      catContainer?.querySelectorAll<HTMLElement>('.switch').forEach(sw => sw.setAttribute('aria-checked', 'true'));
    });
  });
  document.querySelectorAll<HTMLElement>('[data-disable-all]').forEach(btn => {
    btn.addEventListener('click', () => {
      const catId = btn.getAttribute('data-disable-all');
      const catContainer = document.querySelector(`[data-cat-prefs="${catId}"]`);
      catContainer?.querySelectorAll<HTMLElement>('.switch').forEach(sw => sw.setAttribute('aria-checked', 'false'));
    });
  });

  // Save
  $('#save-notif')?.addEventListener('click', () => {
    showToast('Notification preferences saved', 'success');
  });
}
