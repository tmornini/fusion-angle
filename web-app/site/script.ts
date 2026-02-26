// ============================================
// FUSION AI — Core Application
// Router, Shared UI, Navigation, Layout
// ============================================

import type { AppState } from './state';
import { STORAGE_KEY_SIDEBAR, state, setState, subscribe, computeTheme, applyTheme, setTheme } from './state';
import { $, $$, escapeHtml } from './dom';
import { showToast } from './toast';
import type { SkeletonType } from './skeleton';
import { buildSkeleton, buildErrorState, buildEmptyState, withLoadingState } from './skeleton';
import { SafeHtml, html, trusted, setHtml } from './safe-html';
import {
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
} from './icons';

// ------------------------------------
// Shared Utilities
// ------------------------------------

function initials(name: string): string {
  return name.split(' ').map(word => word[0]).join('');
}

function styleForScore(score: number): string {
  if (score >= 80) return 'color:hsl(var(--success))';
  if (score >= 60) return 'color:hsl(var(--warning))';
  return 'color:hsl(var(--error))';
}

let previousFocusElement: HTMLElement | null = null;

function openDialog(dialogId: string): void {
  previousFocusElement = document.activeElement as HTMLElement | null;
  $(`#${dialogId}-backdrop`)?.classList.remove('hidden');
  const dialog = $(`#${dialogId}-dialog`);
  dialog?.classList.remove('hidden');
  dialog?.setAttribute('aria-hidden', 'false');
  const focusable = dialog?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  focusable?.focus();
}

function closeDialog(dialogId: string): void {
  $(`#${dialogId}-backdrop`)?.classList.add('hidden');
  const dialog = $(`#${dialogId}-dialog`);
  dialog?.classList.add('hidden');
  dialog?.setAttribute('aria-hidden', 'true');
  previousFocusElement?.focus();
  previousFocusElement = null;
}

function initTabs(tabSelector: string, panelSelector: string, activeClass = 'active'): void {
  document.querySelectorAll<HTMLElement>(tabSelector).forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll(tabSelector).forEach(otherTab => otherTab.classList.remove(activeClass));
      tab.classList.add(activeClass);
      document.querySelectorAll(panelSelector).forEach(panel => (panel as HTMLElement).style.display = 'none');
      const tabId = tab.dataset.tab ?? tab.dataset.detailTab ?? '';
      const panel = document.getElementById(`tab-${tabId}`) ?? document.getElementById(`detail-${tabId}`);
      if (panel) panel.style.display = '';
    });
  });
}

// ------------------------------------
// Navigation
// ------------------------------------

function getPageName(): string {
  return document.documentElement.getAttribute('data-page') || '';
}

function getParams(): Record<string, string> {
  const params: Record<string, string> = {};
  new URLSearchParams(window.location.search).forEach((value, key) => { params[key] = value; });
  return params;
}

const PAGE_PATHS: Record<string, string> = {
  dashboard: 'core/dashboard', ideas: 'core/ideas', projects: 'core/projects',
  'project-detail': 'core/project-detail', 'engineering-requirements': 'core/engineering-requirements',
  'idea-create': 'core/idea-create',
  'idea-convert': 'core/idea-convert', 'idea-review-queue': 'core/idea-review-queue',
  'approval-detail': 'core/approval-detail',
  edge: 'tools/edge', 'edge-list': 'tools/edge-list', crunch: 'tools/crunch', flow: 'tools/flow',
  team: 'admin/team', account: 'admin/account', profile: 'admin/profile',
  'company-settings': 'admin/company-settings', 'manage-users': 'admin/manage-users',
  'activity-feed': 'admin/activity-feed', 'notification-settings': 'admin/notification-settings',
  snapshots: 'admin/snapshots',
  'design-system': 'reference/design-system',
  landing: 'entry/landing', auth: 'entry/auth', onboarding: 'entry/onboarding',
  'not-found': 'system/not-found',
};

function navigateTo(page: string, params?: Record<string, string>): void {
  const path = PAGE_PATHS[page] || page;
  let url = '../../' + path + '/index.html';
  if (params && Object.keys(params).length > 0) {
    url += '?' + new URLSearchParams(params).toString();
  }
  window.location.href = url;
}

// ------------------------------------
// Theme Toggle Icon Update
// ------------------------------------

function mutateThemeToggleIcon(): void {
  const themeIcon = state.theme === 'dark'
    ? iconMoon(20)
    : state.theme === 'light'
    ? iconSun(20)
    : iconMonitor(20);
  ['theme-toggle', 'mobile-theme-toggle'].forEach(id => {
    const button = document.getElementById(id);
    if (button) setHtml(button, themeIcon);
  });
}

// ------------------------------------
// Notification Population
// ------------------------------------

async function mutateNotifications(): Promise<void> {
  const { getNotifications } = await import('./data');
  const notifications = await getNotifications();
  const unreadCount = notifications.filter(notification => notification.isUnread).length;

  function mutateNotificationPanel(containerId: string, countId: string, badgeId: string) {
    const list = document.getElementById(containerId);
    const countEl = document.getElementById(countId);
    const badge = document.getElementById(badgeId);

    if (list) {
      setHtml(list, html`${notifications.map(notification => html`
        <button class="dropdown-item" style="flex-direction:column;align-items:flex-start;padding:0.75rem 0.5rem">
          <div class="flex items-start gap-2 w-full">
            ${notification.isUnread ? html`<span style="width:0.5rem;height:0.5rem;background:hsl(var(--primary));border-radius:9999px;margin-top:0.375rem;flex-shrink:0"></span>` : html``}
            <div style="flex:1;${!notification.isUnread ? 'margin-left:1rem' : ''}">
              <p class="text-sm ${notification.isUnread ? 'font-medium' : 'text-muted'}">${notification.title}</p>
              <p class="text-xs text-muted line-clamp-2">${notification.message}</p>
              <p class="text-xs text-muted mt-1">${notification.time}</p>
            </div>
          </div>
        </button>`)}`);
    }
    if (countEl && unreadCount > 0) {
      countEl.textContent = String(unreadCount);
      countEl.classList.remove('hidden');
    }
    if (badge && unreadCount > 0) {
      badge.textContent = `${unreadCount} new`;
      badge.classList.remove('hidden');
    }
  }

  for (const prefix of ['notification', 'mobile-notification']) {
    mutateNotificationPanel(`${prefix}-list`, `${prefix}-count`, `${prefix}-badge`);
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
  snapshots: () => import('../admin/snapshots/index'),
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

  // Initialize database before any page modules
  try {
    const { createLocalStorageAdapter } = await import('../../api/db-localstorage');
    const { initApi } = await import('../../api/api');

    const adapter = await createLocalStorageAdapter();
    await adapter.initialize();
    initApi(adapter);

    // If no schema exists, redirect to snapshots so user can choose what to load
    const schemaExists = await adapter.hasSchema();
    if (!schemaExists) {
      const page = getPageName();
      const skipRedirect = ['snapshots', 'auth', 'onboarding', 'not-found', 'design-system', 'landing'];
      if (!skipRedirect.includes(page)) {
        navigateTo('snapshots');
        return;
      }
    }
  } catch (err) {
    console.error('Database initialization failed:', err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    setHtml(document.body, html`<div style="padding:2rem;font-family:sans-serif;max-width:40rem">
      <h1 style="color:hsl(0 72% 51%)">Failed to initialize database</h1>
      <pre style="background:hsl(0 100% 97%);padding:1rem;border-radius:0.5rem;overflow:auto;white-space:pre-wrap">${errorMessage}</pre>
      <p>Try clearing site data and reloading.</p>
    </div>`);
    return;
  }

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

function initActiveNavItem(): void {
  const pageName = getPageName();
  document.querySelectorAll<HTMLElement>('[data-page-link]').forEach(navLink => {
    const linkPage = navLink.getAttribute('data-page-link') || '';
    let isActive = linkPage === pageName;
    if (!isActive) {
      if (linkPage === 'account' && ['profile', 'company-settings', 'manage-users', 'activity-feed', 'notification-settings', 'snapshots'].includes(pageName)) isActive = true;
      else if (linkPage === 'ideas' && ['idea-create', 'idea-convert', 'idea-review-queue', 'approval-detail'].includes(pageName)) isActive = true;
      else if (linkPage === 'projects' && ['project-detail', 'engineering-requirements'].includes(pageName)) isActive = true;
      else if (linkPage === 'edge-list' && pageName === 'edge') isActive = true;
    }
    if (isActive) navLink.setAttribute('aria-current', 'page');
    else navLink.removeAttribute('aria-current');
  });
}

function initSidebar(): void {
  const sidebar = document.getElementById('desktop-sidebar');
  const mainContent = document.querySelector('.main-content') as HTMLElement;

  if (localStorage.getItem(STORAGE_KEY_SIDEBAR) === 'true') {
    sidebar?.classList.add('sidebar-collapsed');
    mainContent?.classList.add('sidebar-collapsed');
    state.isSidebarCollapsed = true;
  }

  document.getElementById('sidebar-collapse')?.addEventListener('click', () => {
    sidebar?.classList.add('sidebar-collapsed');
    mainContent?.classList.add('sidebar-collapsed');
    state.isSidebarCollapsed = true;
    localStorage.setItem(STORAGE_KEY_SIDEBAR, 'true');
  });
  document.getElementById('sidebar-expand')?.addEventListener('click', () => {
    sidebar?.classList.remove('sidebar-collapsed');
    mainContent?.classList.remove('sidebar-collapsed');
    state.isSidebarCollapsed = false;
    localStorage.setItem(STORAGE_KEY_SIDEBAR, 'false');
  });

  document.querySelectorAll<HTMLElement>('[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const label = btn.getAttribute('data-section');
      const items = document.querySelector(`[data-section-items="${label}"]`) as HTMLElement;
      if (items) {
        const isCollapsed = items.style.display === 'none';
        items.style.display = isCollapsed ? '' : 'none';
        btn.setAttribute('aria-expanded', String(isCollapsed));
        const chevron = btn.querySelector('svg');
        if (chevron) chevron.style.transform = isCollapsed ? '' : 'rotate(-90deg)';
      }
    });
  });
}

function initThemeAndDropdowns(): void {
  for (const prefix of ['', 'mobile-']) {
    initDropdown(`${prefix}theme-toggle`, `${prefix}theme-dropdown`);
    initDropdown(`${prefix}notification-toggle`, `${prefix}notification-dropdown`);
  }

  document.querySelectorAll<HTMLElement>('[data-theme-set]').forEach(themeButton => {
    themeButton.addEventListener('click', () => {
      const theme = themeButton.getAttribute('data-theme-set') as AppState['theme'];
      if (theme) {
        setTheme(theme);
        mutateThemeToggleIcon();
        document.querySelectorAll('.dropdown-content').forEach(dropdown => dropdown.classList.add('hidden'));
      }
    });
  });
}

function initMobileDrawer(): void {
  document.getElementById('mobile-sidebar-open')?.addEventListener('click', () => {
    document.getElementById('mobile-sheet')?.classList.remove('hidden');
    document.getElementById('mobile-sheet-backdrop')?.classList.remove('hidden');
  });
  document.getElementById('mobile-sheet-backdrop')?.addEventListener('click', () => {
    document.getElementById('mobile-sheet')?.classList.add('hidden');
    document.getElementById('mobile-sheet-backdrop')?.classList.add('hidden');
  });

  document.getElementById('mobile-search-toggle')?.addEventListener('click', () => {
    document.getElementById('mobile-search-bar')?.classList.remove('hidden');
  });
  document.getElementById('mobile-search-close')?.addEventListener('click', () => {
    document.getElementById('mobile-search-bar')?.classList.add('hidden');
  });
}

function initDashboardLayout(): void {
  initActiveNavItem();
  initSidebar();
  initThemeAndDropdowns();
  initMobileDrawer();
  mutateThemeToggleIcon();
  mutateNotifications();
}

function initDropdown(toggleId: string, contentId: string): void {
  const toggle = document.getElementById(toggleId);
  const content = document.getElementById(contentId);
  if (!toggle || !content) return;

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    // Close other dropdowns
    document.querySelectorAll('.dropdown-content').forEach(dropdown => {
      if (dropdown.id !== contentId) dropdown.classList.add('hidden');
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
  // State (re-exported from ./state)
  state, setState, subscribe, computeTheme,
  // Theme (re-exported from ./state)
  applyTheme, setTheme,
  // DOM (re-exported from ./dom)
  $, $$, escapeHtml,
  // Safe HTML (re-exported from ./html)
  SafeHtml, html, trusted, setHtml,
  // Navigation
  getPageName, getParams, navigateTo,
  // Layout
  initDashboardLayout,
  // Toast (re-exported from ./toast)
  showToast,
  // Loading / Error / Empty (re-exported from ./skeleton)
  type SkeletonType, buildSkeleton, buildErrorState, buildEmptyState, withLoadingState,
  // Shared Utilities
  initials, styleForScore, openDialog, closeDialog, initTabs,
  // Icons (re-exported from ./icons)
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
