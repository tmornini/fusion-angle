// ============================================
// FUSION AI — Core Application
// Router, State, Theme, Icons, Shared UI
// ============================================

// ------------------------------------
// State Management
// ------------------------------------

interface AppState {
  theme: 'light' | 'dark' | 'system';
  isMobile: boolean;
  sidebarCollapsed: boolean;
  sidebarOpen: boolean;
  searchOpen: boolean;
  searchQuery: string;
  user: { name: string; email: string; company: string } | null;
}

type StateListener = () => void;

const state: AppState = {
  theme: (localStorage.getItem('fusion-theme') as AppState['theme']) || 'system',
  isMobile: window.matchMedia('(max-width: 768px)').matches,
  sidebarCollapsed: false,
  sidebarOpen: false,
  searchOpen: false,
  searchQuery: '',
  user: { name: 'Demo User', email: 'demo@example.com', company: 'Demo Company' },
};

const listeners = new Set<StateListener>();

function setState(partial: Partial<AppState>): void {
  Object.assign(state, partial);
  listeners.forEach(fn => fn());
}

function subscribe(fn: StateListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ------------------------------------
// Theme
// ------------------------------------

function resolvedTheme(): 'light' | 'dark' {
  if (state.theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return state.theme;
}

function applyTheme(): void {
  const resolved = resolvedTheme();
  document.documentElement.setAttribute('data-theme', resolved);
  // Also set class for any CSS that uses .dark selector
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

function setTheme(theme: AppState['theme']): void {
  localStorage.setItem('fusion-theme', theme);
  setState({ theme });
  applyTheme();
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (state.theme === 'system') applyTheme();
});

// ------------------------------------
// Mobile Detection
// ------------------------------------

window.matchMedia('(max-width: 768px)').addEventListener('change', (e) => {
  setState({ isMobile: e.matches });
  if (!e.matches) setState({ sidebarOpen: false, searchOpen: false });
});

// ------------------------------------
// DOM Helpers
// ------------------------------------

function $(selector: string, parent: ParentNode = document): HTMLElement | null {
  return parent.querySelector(selector);
}

function $$(selector: string, parent: ParentNode = document): HTMLElement[] {
  return Array.from(parent.querySelectorAll(selector));
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ------------------------------------
// Toast
// ------------------------------------

function showToast(message: string, variant: 'success' | 'error' | 'warning' | 'info' = 'info'): void {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${variant}`;
  toast.innerHTML = `<span class="toast-message">${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 300ms ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ------------------------------------
// Skeleton / Loading / Error / Empty State Helpers
// ------------------------------------

type SkeletonType = 'card-grid' | 'card-list' | 'detail' | 'table' | 'stats-row';

function renderSkeleton(type: SkeletonType, opts?: { count?: number }): string {
  const count = opts?.count ?? 4;
  const shimmer = 'skeleton-shimmer';

  const cardSkel = `<div class="skeleton-card">
    <div class="${shimmer} skeleton-badge" style="margin-bottom:0.75rem"></div>
    <div class="${shimmer} skeleton-heading"></div>
    <div class="${shimmer} skeleton-text"></div>
    <div class="${shimmer} skeleton-text" style="width:80%"></div>
  </div>`;

  const listItemSkel = `<div class="skeleton-card" style="display:flex;align-items:center;gap:1rem">
    <div class="${shimmer} skeleton-avatar"></div>
    <div style="flex:1">
      <div class="${shimmer} skeleton-text" style="width:60%;margin-bottom:0.375rem"></div>
      <div class="${shimmer} skeleton-text-sm" style="width:40%"></div>
    </div>
    <div class="${shimmer} skeleton-badge"></div>
  </div>`;

  const statsRowSkel = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.5rem">
    ${Array(4).fill(`<div class="skeleton-card" style="padding:1rem">
      <div class="${shimmer} skeleton-text-sm" style="width:50%;margin-bottom:0.5rem"></div>
      <div class="${shimmer} skeleton-heading" style="width:40%"></div>
    </div>`).join('')}
  </div>`;

  switch (type) {
    case 'card-grid':
      return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));gap:1.5rem">
        ${Array(count).fill(cardSkel).join('')}
      </div>`;
    case 'card-list':
      return `<div style="display:flex;flex-direction:column;gap:0.75rem">
        ${Array(count).fill(listItemSkel).join('')}
      </div>`;
    case 'detail':
      return `<div>
        <div class="${shimmer} skeleton-heading" style="width:40%;margin-bottom:1.5rem"></div>
        <div class="skeleton-card" style="margin-bottom:1.5rem">
          <div class="${shimmer} skeleton-text" style="width:90%"></div>
          <div class="${shimmer} skeleton-text" style="width:75%"></div>
          <div class="${shimmer} skeleton-text" style="width:60%;margin-bottom:1rem"></div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem">
            ${Array(3).fill(`<div><div class="${shimmer} skeleton-text-sm"></div><div class="${shimmer} skeleton-heading" style="width:60%"></div></div>`).join('')}
          </div>
        </div>
      </div>`;
    case 'table':
      return `<div class="skeleton-card" style="padding:0;overflow:hidden">
        <div style="padding:1rem;border-bottom:1px solid hsl(var(--border))">
          <div class="${shimmer} skeleton-text" style="width:30%"></div>
        </div>
        ${Array(count).fill(`<div style="display:flex;align-items:center;gap:1rem;padding:0.75rem 1rem;border-bottom:1px solid hsl(var(--border))">
          <div class="${shimmer} skeleton-avatar" style="width:2rem;height:2rem"></div>
          <div class="${shimmer} skeleton-text" style="width:25%;margin:0"></div>
          <div class="${shimmer} skeleton-text" style="width:20%;margin:0"></div>
          <div class="${shimmer} skeleton-badge" style="margin-left:auto"></div>
        </div>`).join('')}
      </div>`;
    case 'stats-row':
      return statsRowSkel;
    default:
      return '';
  }
}

function renderError(message: string, retryLabel = 'Try Again'): string {
  return `<div class="state-container">
    <div class="state-icon state-icon-error">${iconAlertTriangle(24)}</div>
    <p class="state-title">Something went wrong</p>
    <p class="state-description">${escapeHtml(message)}</p>
    <button class="btn btn-outline" data-retry-btn>${retryLabel}</button>
  </div>`;
}

function renderEmpty(iconHtml: string, title: string, description: string, cta?: { label: string; href: string }): string {
  return `<div class="state-container">
    <div class="state-icon state-icon-empty">${iconHtml}</div>
    <p class="state-title">${escapeHtml(title)}</p>
    <p class="state-description">${escapeHtml(description)}</p>
    ${cta ? `<a href="${cta.href}" class="btn btn-primary">${escapeHtml(cta.label)}</a>` : ''}
  </div>`;
}

async function withLoadingState<T>(
  container: HTMLElement,
  skeletonHtml: string,
  fetchFn: () => Promise<T>,
  retryFn?: () => void,
): Promise<T | null> {
  container.innerHTML = skeletonHtml;
  try {
    return await fetchFn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'An unexpected error occurred. Please try again.';
    container.innerHTML = renderError(msg);
    const retryBtn = container.querySelector('[data-retry-btn]');
    if (retryBtn && retryFn) {
      retryBtn.addEventListener('click', retryFn);
    }
    return null;
  }
}

// ------------------------------------
// Shared Utilities
// ------------------------------------

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('');
}

function scoreColor(score: number): string {
  if (score >= 80) return 'color:hsl(142 71% 45%)';
  if (score >= 60) return 'color:hsl(var(--warning))';
  return 'color:hsl(var(--error))';
}

function openDialog(id: string): void {
  $(`#${id}-backdrop`)?.classList.remove('hidden');
  $(`#${id}-dialog`)?.classList.remove('hidden');
}

function closeDialog(id: string): void {
  $(`#${id}-backdrop`)?.classList.add('hidden');
  $(`#${id}-dialog`)?.classList.add('hidden');
}

function initTabs(tabSel: string, panelSel: string, activeClass = 'active'): void {
  document.querySelectorAll<HTMLElement>(tabSel).forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll(tabSel).forEach(t => t.classList.remove(activeClass));
      tab.classList.add(activeClass);
      document.querySelectorAll(panelSel).forEach(p => (p as HTMLElement).style.display = 'none');
      const attr = tab.dataset.tab ?? tab.dataset.detailTab ?? '';
      const panel = document.getElementById(`tab-${attr}`) ?? document.getElementById(`detail-${attr}`);
      if (panel) panel.style.display = '';
    });
  });
}

// ------------------------------------
// Icons (inline SVG — Lucide-compatible)
// Each returns an SVG string; inherits currentColor.
// Full set populated in Phase 1; stubs below for nav.
// ------------------------------------

function icon(paths: string, size = 16, cls = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}">${paths}</svg>`;
}

function iconSparkles(s = 16, c = '') { return icon('<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>', s, c); }
function iconHome(s = 16, c = '') { return icon('<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', s, c); }
function iconLightbulb(s = 16, c = '') { return icon('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>', s, c); }
function iconFolderKanban(s = 16, c = '') { return icon('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M8 10v4"/><path d="M12 10v2"/><path d="M16 10v6"/>', s, c); }
function iconUsers(s = 16, c = '') { return icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', s, c); }
function iconUser(s = 16, c = '') { return icon('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', s, c); }
function iconTarget(s = 16, c = '') { return icon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>', s, c); }
function iconDatabase(s = 16, c = '') { return icon('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>', s, c); }
function iconGitBranch(s = 16, c = '') { return icon('<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>', s, c); }
function iconPalette(s = 16, c = '') { return icon('<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>', s, c); }
function iconLogOut(s = 16, c = '') { return icon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>', s, c); }
function iconMenu(s = 16, c = '') { return icon('<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>', s, c); }
function iconSearch(s = 16, c = '') { return icon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', s, c); }
function iconBell(s = 16, c = '') { return icon('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>', s, c); }
function iconSun(s = 16, c = '') { return icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>', s, c); }
function iconMoon(s = 16, c = '') { return icon('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', s, c); }
function iconMonitor(s = 16, c = '') { return icon('<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>', s, c); }
function iconX(s = 16, c = '') { return icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', s, c); }
function iconChevronDown(s = 16, c = '') { return icon('<path d="m6 9 6 6 6-6"/>', s, c); }
function iconChevronRight(s = 16, c = '') { return icon('<path d="m9 18 6-6-6-6"/>', s, c); }
function iconChevronLeft(s = 16, c = '') { return icon('<path d="m15 18-6-6 6-6"/>', s, c); }
function iconPanelLeftClose(s = 16, c = '') { return icon('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>', s, c); }
function iconPanelLeft(s = 16, c = '') { return icon('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>', s, c); }
function iconPlus(s = 16, c = '') { return icon('<path d="M5 12h14"/><path d="M12 5v14"/>', s, c); }
function iconArrowLeft(s = 16, c = '') { return icon('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>', s, c); }
function iconArrowRight(s = 16, c = '') { return icon('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>', s, c); }
function iconCheck(s = 16, c = '') { return icon('<path d="M20 6 9 17l-5-5"/>', s, c); }
function iconLoader(s = 16, c = '') { return icon('<path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/>', s, c); }
function iconSettings(s = 16, c = '') { return icon('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>', s, c); }
function iconExternalLink(s = 16, c = '') { return icon('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', s, c); }
function iconFilter(s = 16, c = '') { return icon('<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>', s, c); }
function iconMoreHorizontal(s = 16, c = '') { return icon('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>', s, c); }
function iconMoreVertical(s = 16, c = '') { return icon('<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>', s, c); }
function iconStar(s = 16, c = '') { return icon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', s, c); }
function iconHeart(s = 16, c = '') { return icon('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>', s, c); }
function iconTrendingUp(s = 16, c = '') { return icon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>', s, c); }
function iconTrendingDown(s = 16, c = '') { return icon('<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>', s, c); }
function iconAlertCircle(s = 16, c = '') { return icon('<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>', s, c); }
function iconAlertTriangle(s = 16, c = '') { return icon('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>', s, c); }
function iconCheckCircle(s = 16, c = '') { return icon('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>', s, c); }
function iconInfo(s = 16, c = '') { return icon('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>', s, c); }
function iconMail(s = 16, c = '') { return icon('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>', s, c); }
function iconPhone(s = 16, c = '') { return icon('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>', s, c); }
function iconCalendar(s = 16, c = '') { return icon('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>', s, c); }
function iconClock(s = 16, c = '') { return icon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', s, c); }
function iconUpload(s = 16, c = '') { return icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>', s, c); }
function iconDownload(s = 16, c = '') { return icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>', s, c); }
function iconTrash(s = 16, c = '') { return icon('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>', s, c); }
function iconEdit(s = 16, c = '') { return icon('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>', s, c); }
function iconEye(s = 16, c = '') { return icon('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>', s, c); }
function iconCopy(s = 16, c = '') { return icon('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>', s, c); }
function iconSave(s = 16, c = '') { return icon('<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>', s, c); }
function iconSend(s = 16, c = '') { return icon('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>', s, c); }
function iconShare(s = 16, c = '') { return icon('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>', s, c); }
function iconGlobe(s = 16, c = '') { return icon('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>', s, c); }
function iconRocket(s = 16, c = '') { return icon('<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>', s, c); }
function iconZap(s = 16, c = '') { return icon('<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>', s, c); }
function iconAward(s = 16, c = '') { return icon('<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>', s, c); }
function iconBrain(s = 16, c = '') { return icon('<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>', s, c); }
function iconWand(s = 16, c = '') { return icon('<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>', s, c); }
function iconActivity(s = 16, c = '') { return icon('<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>', s, c); }
function iconBarChart(s = 16, c = '') { return icon('<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>', s, c); }
function iconFileText(s = 16, c = '') { return icon('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>', s, c); }
function iconShield(s = 16, c = '') { return icon('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>', s, c); }
function iconBuilding(s = 16, c = '') { return icon('<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>', s, c); }
function iconCrown(s = 16, c = '') { return icon('<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>', s, c); }
function iconBriefcase(s = 16, c = '') { return icon('<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>', s, c); }
function iconClipboardCheck(s = 16, c = '') { return icon('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>', s, c); }
function iconDollarSign(s = 16, c = '') { return icon('<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', s, c); }
function iconSmartphone(s = 16, c = '') { return icon('<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>', s, c); }
function iconCode(s = 16, c = '') { return icon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>', s, c); }
function iconHash(s = 16, c = '') { return icon('<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>', s, c); }
function iconGripVertical(s = 16, c = '') { return icon('<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>', s, c); }
function iconGauge(s = 16, c = '') { return icon('<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>', s, c); }
function iconLineChart(s = 16, c = '') { return icon('<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>', s, c); }
function iconArrowUpRight(s = 16, c = '') { return icon('<path d="M7 7h10v10"/><path d="M7 17 17 7"/>', s, c); }
function iconArrowDownRight(s = 16, c = '') { return icon('<path d="m7 7 10 10"/><path d="M17 7v10H7"/>', s, c); }
function iconCamera(s = 16, c = '') { return icon('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>', s, c); }
function iconCreditCard(s = 16, c = '') { return icon('<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>', s, c); }
function iconCircle(s = 16, c = '') { return icon('<circle cx="12" cy="12" r="10"/>', s, c); }
function iconMessageSquare(s = 16, c = '') { return icon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', s, c); }
function iconUserPlus(s = 16, c = '') { return icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>', s, c); }
function iconUserCheck(s = 16, c = '') { return icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>', s, c); }
function iconUserX(s = 16, c = '') { return icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/>', s, c); }
function iconXCircle(s = 16, c = '') { return icon('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>', s, c); }
function iconCheckCircle2(s = 16, c = '') { return icon('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>', s, c); }
function iconHelpCircle(s = 16, c = '') { return icon('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>', s, c); }
function iconMinus(s = 16, c = '') { return icon('<path d="M5 12h14"/>', s, c); }
function iconFolderOpen(s = 16, c = '') { return icon('<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>', s, c); }
function iconFileSpreadsheet(s = 16, c = '') { return icon('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>', s, c); }
function iconListTodo(s = 16, c = '') { return icon('<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><line x1="13" x2="21" y1="6" y2="6"/><line x1="13" x2="21" y1="12" y2="12"/><line x1="13" x2="21" y1="18" y2="18"/>', s, c); }
function iconToggleLeft(s = 16, c = '') { return icon('<rect width="20" height="12" x="2" y="6" rx="6" ry="6"/><circle cx="8" cy="12" r="2"/>', s, c); }
function iconType(s = 16, c = '') { return icon('<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>', s, c); }
function iconTable(s = 16, c = '') { return icon('<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>', s, c); }
function iconSlider(s = 16, c = '') { return icon('<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>', s, c); }
function iconDot(s = 16, c = '') { return icon('<circle cx="12.1" cy="12.1" r="1"/>', s, c); }
function iconLayoutGrid(s = 16, c = '') { return icon('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>', s, c); }
function iconChevronUp(s = 16, c = '') { return icon('<path d="m18 15-6-6-6 6"/>', s, c); }
function iconHistory(s = 16, c = '') { return icon('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>', s, c); }

// Auto-generated icons map for lookup by kebab-case name.
// Converts "iconFolderKanban" → "folder-kanban" etc.
const _allIcons = [
  iconSparkles, iconHome, iconLightbulb, iconFolderKanban, iconUsers, iconUser,
  iconTarget, iconDatabase, iconGitBranch, iconPalette, iconLogOut, iconMenu,
  iconSearch, iconBell, iconSun, iconMoon, iconMonitor, iconX,
  iconChevronDown, iconChevronRight, iconChevronLeft,
  iconPanelLeftClose, iconPanelLeft, iconPlus, iconArrowLeft, iconArrowRight,
  iconCheck, iconLoader, iconSettings, iconExternalLink, iconFilter,
  iconMoreHorizontal, iconMoreVertical, iconStar, iconHeart,
  iconTrendingUp, iconTrendingDown, iconAlertCircle, iconAlertTriangle,
  iconCheckCircle, iconInfo, iconMail, iconPhone, iconCalendar, iconClock,
  iconUpload, iconDownload, iconTrash, iconEdit, iconEye, iconCopy, iconSave,
  iconSend, iconShare, iconGlobe, iconRocket, iconZap, iconAward, iconBrain,
  iconWand, iconActivity, iconBarChart, iconFileText, iconShield, iconBuilding,
  iconCrown, iconBriefcase, iconClipboardCheck, iconDollarSign, iconSmartphone,
  iconCode, iconHash, iconGripVertical, iconGauge, iconLineChart,
  iconArrowUpRight, iconArrowDownRight, iconCamera, iconCreditCard, iconCircle,
  iconMessageSquare, iconUserPlus, iconUserCheck, iconUserX, iconXCircle,
  iconCheckCircle2, iconHelpCircle, iconMinus, iconFolderOpen,
  iconFileSpreadsheet, iconListTodo, iconToggleLeft, iconType, iconTable,
  iconSlider, iconDot, iconLayoutGrid, iconChevronUp, iconHistory,
];
const icons: Record<string, (s?: number, c?: string) => string> = {};
for (const fn of _allIcons) {
  const pascal = fn.name.replace(/^icon/, '');
  const kebab = pascal.replace(/[A-Z]/g, (c, i) => (i ? '-' : '') + c.toLowerCase()).replace(/(\d+)/g, '-$1');
  const camel = pascal[0]!.toLowerCase() + pascal.slice(1);
  icons[kebab] = fn;
  if (camel !== kebab) icons[camel] = fn;
}

// ------------------------------------
// Navigation
// ------------------------------------

function getPageName(): string {
  return document.documentElement.getAttribute('data-page') || '';
}

function getParams(): Record<string, string> {
  const params: Record<string, string> = {};
  new URLSearchParams(window.location.search).forEach((v, k) => { params[k] = v; });
  return params;
}

function navigateTo(page: string, params?: Record<string, string>): void {
  let url = '../' + page + '/index.html';
  if (params && Object.keys(params).length > 0) {
    url += '?' + new URLSearchParams(params).toString();
  }
  window.location.href = url;
}

// ------------------------------------
// Theme Toggle Icon Update
// ------------------------------------

function updateThemeToggleIcon(): void {
  const iconHtml = state.theme === 'dark'
    ? iconMoon(20)
    : state.theme === 'light'
    ? iconSun(20)
    : iconMonitor(20);
  ['theme-toggle', 'mobile-theme-toggle'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.innerHTML = iconHtml;
  });
}

// ------------------------------------
// Notification Population
// ------------------------------------

async function populateNotifications(): Promise<void> {
  const { getNotifications } = await import('./data');
  const notifications = await getNotifications();
  const unreadCount = notifications.filter(n => n.unread).length;

  function renderItems(containerId: string, countId: string, badgeId: string) {
    const list = document.getElementById(containerId);
    const countEl = document.getElementById(countId);
    const badge = document.getElementById(badgeId);

    if (list) {
      list.innerHTML = notifications.map(n => `
        <button class="dropdown-item" style="flex-direction:column;align-items:flex-start;padding:0.75rem 0.5rem">
          <div class="flex items-start gap-2 w-full">
            ${n.unread ? '<span style="width:0.5rem;height:0.5rem;background:hsl(var(--primary));border-radius:9999px;margin-top:0.375rem;flex-shrink:0"></span>' : ''}
            <div style="flex:1;${!n.unread ? 'margin-left:1rem' : ''}">
              <p class="text-sm ${n.unread ? 'font-medium' : 'text-muted'}">${escapeHtml(n.title)}</p>
              <p class="text-xs text-muted line-clamp-2">${escapeHtml(n.message)}</p>
              <p class="text-xs text-muted mt-1">${n.time}</p>
            </div>
          </div>
        </button>`).join('');
    }
    if (countEl && unreadCount > 0) {
      countEl.textContent = String(unreadCount);
      countEl.style.display = '';
    }
    if (badge && unreadCount > 0) {
      badge.textContent = `${unreadCount} new`;
      badge.style.display = '';
    }
  }

  for (const prefix of ['notif', 'mobile-notif']) {
    renderItems(`${prefix}-list`, `${prefix}-count`, `${prefix}-badge`);
  }
}

// ------------------------------------
// Page Module Dispatch
// ------------------------------------

const pageModules: Record<string, () => Promise<{ init: (params?: Record<string, string>) => void | Promise<void> }>> = {
  dashboard: () => import('../core/dashboard/index'),
  ideas: () => import('../core/ideas/index'),
  projects: () => import('../core/projects/index'),
  'project-detail': () => import('../core/project-detail/index'),
  'engineering-requirements': () => import('../core/engineering-requirements/index'),
  'idea-create': () => import('../core/idea-create/index'),
  'idea-scoring': () => import('../core/idea-scoring/index'),
  'idea-convert': () => import('../core/idea-convert/index'),
  'idea-review-queue': () => import('../core/idea-review-queue/index'),
  'approval-detail': () => import('../core/approval-detail/index'),
  edge: () => import('../tools/edge/index'),
  'edge-list': () => import('../tools/edge-list/index'),
  crunch: () => import('../tools/crunch/index'),
  flow: () => import('../tools/flow/index'),
  team: () => import('../admin/team/index'),
  account: () => import('../admin/account/index'),
  profile: () => import('../admin/profile/index'),
  'company-settings': () => import('../admin/company-settings/index'),
  'manage-users': () => import('../admin/manage-users/index'),
  'activity-feed': () => import('../admin/activity-feed/index'),
  'notification-settings': () => import('../admin/notification-settings/index'),
  'design-system': () => import('../reference/design-system/index'),
  landing: () => import('../entry/landing/index'),
  auth: () => import('../entry/auth/index'),
  onboarding: () => import('../entry/onboarding/index'),
  'not-found': () => import('../system/not-found/index'),
};

// ------------------------------------
// Initialize
// ------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  applyTheme();
  initPrefetch();

  const pageName = getPageName();

  // For pages with dashboard layout, init layout behavior
  if (document.querySelector('.dashboard-layout')) {
    initDashboardLayout();
  }

  // Init command palette (works on all pages)
  import('./command-palette').then(m => m.initCommandPalette());

  // Load and init the page module
  const loader = pageModules[pageName];
  if (loader) {
    const mod = await loader();
    await mod.init(getParams());
  }
});

// ------------------------------------
// Dashboard Layout Behavior
// ------------------------------------

function initDashboardLayout(): void {
  // Mark active nav item
  const pageName = getPageName();
  document.querySelectorAll<HTMLElement>('[data-page-link]').forEach(el => {
    const linkPage = el.getAttribute('data-page-link') || '';
    let active = linkPage === pageName;
    if (!active) {
      if (linkPage === 'account' && ['profile', 'company-settings', 'manage-users', 'activity-feed', 'notification-settings'].includes(pageName)) active = true;
      else if (linkPage === 'ideas' && ['idea-create', 'idea-scoring', 'idea-convert', 'idea-review-queue', 'approval-detail'].includes(pageName)) active = true;
      else if (linkPage === 'projects' && ['project-detail', 'engineering-requirements'].includes(pageName)) active = true;
      else if (linkPage === 'edge-list' && pageName === 'edge') active = true;
    }
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });

  // Sidebar collapse/expand (desktop)
  const sidebar = document.getElementById('desktop-sidebar');
  const mainContent = document.querySelector('.main-content') as HTMLElement;

  if (localStorage.getItem('fusion-sidebar-collapsed') === 'true') {
    sidebar?.classList.add('sidebar-collapsed');
    mainContent?.classList.add('sidebar-collapsed');
    state.sidebarCollapsed = true;
  }

  document.getElementById('sidebar-collapse')?.addEventListener('click', () => {
    sidebar?.classList.add('sidebar-collapsed');
    mainContent?.classList.add('sidebar-collapsed');
    state.sidebarCollapsed = true;
    localStorage.setItem('fusion-sidebar-collapsed', 'true');
  });
  document.getElementById('sidebar-expand')?.addEventListener('click', () => {
    sidebar?.classList.remove('sidebar-collapsed');
    mainContent?.classList.remove('sidebar-collapsed');
    state.sidebarCollapsed = false;
    localStorage.setItem('fusion-sidebar-collapsed', 'false');
  });

  // Section toggle
  document.querySelectorAll<HTMLElement>('[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const label = btn.getAttribute('data-section');
      const items = document.querySelector(`[data-section-items="${label}"]`) as HTMLElement;
      if (items) {
        const hidden = items.style.display === 'none';
        items.style.display = hidden ? '' : 'none';
        const chevron = btn.querySelector('svg');
        if (chevron) chevron.style.transform = hidden ? '' : 'rotate(-90deg)';
      }
    });
  });

  // Dropdown toggles (theme, notifications — desktop + mobile)
  for (const prefix of ['', 'mobile-']) {
    setupDropdown(`${prefix}theme-toggle`, `${prefix}theme-dropdown`);
    setupDropdown(`${prefix}notif-toggle`, `${prefix}notif-dropdown`);
  }

  // Theme selection
  document.querySelectorAll<HTMLElement>('[data-theme-set]').forEach(el => {
    el.addEventListener('click', () => {
      const theme = el.getAttribute('data-theme-set') as AppState['theme'];
      if (theme) {
        setTheme(theme);
        updateThemeToggleIcon();
        document.querySelectorAll('.dropdown-content').forEach(d => d.classList.add('hidden'));
      }
    });
  });

  // Mobile sidebar
  document.getElementById('mobile-sidebar-open')?.addEventListener('click', () => {
    document.getElementById('mobile-sheet')?.classList.remove('hidden');
    document.getElementById('mobile-sheet-backdrop')?.classList.remove('hidden');
  });
  document.getElementById('mobile-sheet-backdrop')?.addEventListener('click', () => {
    document.getElementById('mobile-sheet')?.classList.add('hidden');
    document.getElementById('mobile-sheet-backdrop')?.classList.add('hidden');
  });

  // Mobile search
  document.getElementById('mobile-search-toggle')?.addEventListener('click', () => {
    document.getElementById('mobile-search-bar')?.classList.remove('hidden');
  });
  document.getElementById('mobile-search-close')?.addEventListener('click', () => {
    document.getElementById('mobile-search-bar')?.classList.add('hidden');
  });

  // Update theme icon and populate notifications
  updateThemeToggleIcon();
  populateNotifications();
}

function setupDropdown(toggleId: string, contentId: string): void {
  const toggle = document.getElementById(toggleId);
  const content = document.getElementById(contentId);
  if (!toggle || !content) return;

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    // Close other dropdowns
    document.querySelectorAll('.dropdown-content').forEach(d => {
      if (d.id !== contentId) d.classList.add('hidden');
    });
    content.classList.toggle('hidden');
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!content.contains(e.target as Node) && !toggle.contains(e.target as Node)) {
      content.classList.add('hidden');
    }
  });
}

// ------------------------------------
// Navigation Prefetch
// ------------------------------------

function initPrefetch(): void {
  if (location.protocol === 'file:') return;
  const prefetched = new Set<string>();
  document.addEventListener('pointerenter', (e) => {
    if (!(e.target instanceof Element)) return;
    const anchor = e.target.closest('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (href && href.endsWith('/index.html') && !href.startsWith('http') && !prefetched.has(href)) {
      prefetched.add(href);
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      document.head.appendChild(link);
    }
  }, { capture: true });
}

// ------------------------------------
// Exports for page modules
// ------------------------------------

export {
  // State
  state, setState, subscribe, resolvedTheme,
  // Theme
  applyTheme, setTheme,
  // DOM
  $, $$, escapeHtml,
  // Navigation
  getPageName, getParams, navigateTo,
  // Layout
  initDashboardLayout,
  // Toast
  showToast,
  // Loading / Error / Empty
  renderSkeleton, renderError, renderEmpty, withLoadingState,
  // Shared Utilities
  initials, scoreColor, openDialog, closeDialog, initTabs,
  // Icons
  icon, icons,
  iconSparkles, iconHome, iconLightbulb, iconFolderKanban, iconUsers, iconUser,
  iconTarget, iconDatabase, iconGitBranch, iconPalette, iconLogOut, iconMenu,
  iconSearch, iconBell, iconSun, iconMoon, iconMonitor, iconX,
  iconChevronDown, iconChevronRight, iconChevronLeft,
  iconPanelLeftClose, iconPanelLeft, iconPlus, iconArrowLeft, iconArrowRight,
  iconCheck, iconLoader, iconSettings, iconExternalLink, iconFilter,
  iconMoreHorizontal, iconMoreVertical, iconStar, iconHeart,
  iconTrendingUp, iconTrendingDown, iconAlertCircle, iconAlertTriangle,
  iconCheckCircle, iconInfo, iconMail, iconPhone, iconCalendar, iconClock,
  iconUpload, iconDownload, iconTrash, iconEdit, iconEye, iconCopy, iconSave,
  iconSend, iconShare, iconGlobe, iconRocket, iconZap, iconAward, iconBrain,
  iconWand, iconActivity, iconBarChart, iconFileText, iconShield, iconBuilding,
  iconCrown, iconBriefcase, iconClipboardCheck, iconDollarSign, iconSmartphone,
  iconCode, iconHash, iconGripVertical, iconGauge, iconLineChart,
  iconArrowUpRight, iconArrowDownRight, iconCamera, iconCreditCard, iconCircle,
  iconMessageSquare, iconUserPlus, iconUserCheck, iconUserX, iconXCircle,
  iconCheckCircle2, iconHelpCircle, iconMinus, iconFolderOpen,
  iconFileSpreadsheet, iconListTodo, iconToggleLeft, iconType, iconTable,
  iconSlider, iconDot, iconLayoutGrid, iconChevronUp, iconHistory,
};
