// ============================================
// FUSION AI — Core Application Orchestrator
// Dispatches page modules, initializes layout
// ============================================

import { applyTheme } from './state';
import { html, setHtml } from './safe-html';
import { buildErrorState, errorMessage } from './loading-states';
import { navigateTo, getPageName, getParams, initPrefetch } from './navigation';
import { initSidebarLayout } from './layout';

// Re-export for backward compatibility — page modules import from '../app/core'
export { navigateTo } from './navigation';
export { initials, styleForScore, durationInDays, formatCompactCurrency } from './format';
export { openDialog, closeDialog, initTabs } from './dialog';

// ------------------------------------
// Page Module Dispatch
// ------------------------------------

const pageModules: Record<string, () => Promise<{ init: (params?: Record<string, string>) => void | Promise<void> }>> = {
  dashboard: () => import('../dashboard/index'),
  ideas: () => import('../ideas/index'),
  projects: () => import('../projects/index'),
  'project-detail': () => import('../project-detail/index'),
  'engineering-requirements': () => import('../engineering-requirements/index'),
  'idea-create': () => import('../idea-create/index'),
  'idea-convert': () => import('../idea-convert/index'),
  'idea-review-queue': () => import('../idea-review-queue/index'),
  'approval-detail': () => import('../approval-detail/index'),
  edge: () => import('../edge/index'),
  'edge-list': () => import('../edge-list/index'),
  crunch: () => import('../crunch/index'),
  flow: () => import('../flow/index'),
  'flow-detail': () => import('../flow-detail/index'),
  team: () => import('../team/index'),
  account: () => import('../account/index'),
  profile: () => import('../profile/index'),
  'company-settings': () => import('../company-settings/index'),
  'manage-users': () => import('../manage-users/index'),
  'activity-feed': () => import('../activity-feed/index'),
  snapshots: () => import('../snapshots/index'),
  'design-system': () => import('../design-system/index'),
  landing: () => import('../landing/index'),
  auth: () => import('../auth/index'),
  onboarding: () => import('../onboarding/index'),
  'not-found': () => import('../not-found/index'),
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
    const { initApi, GET } = await import('../../api/api');

    const adapter = await createLocalStorageAdapter();
    await adapter.initialize();
    initApi(adapter);

    // If no schema exists, redirect to snapshots so user can choose what to load
    const snapshot = await GET('snapshots/schema') as string | null;
    if (snapshot === null) {
      const page = getPageName();
      const skipRedirect = ['snapshots', 'auth', 'onboarding', 'not-found', 'design-system', 'landing'];
      if (!skipRedirect.includes(page)) {
        navigateTo('snapshots');
        return;
      }
    }
  } catch (err) {
    console.error('Database initialization failed:', err);
    setHtml(document.body, html`<div style="padding:2rem;font-family:sans-serif;max-width:40rem">
      <h1 style="color:hsl(0 72% 51%)">Failed to initialize database</h1>
      <pre style="background:hsl(0 100% 97%);padding:1rem;border-radius:0.5rem;overflow:auto;white-space:pre-wrap">${errorMessage(err, 'Unknown database error')}</pre>
      <p>Try clearing site data and reloading.</p>
    </div>`);
    return;
  }

  const pageName = getPageName();

  // For pages with sidebar layout, init layout behavior
  if (document.querySelector('.sidebar-layout')) {
    initSidebarLayout();
  }

  // Init command palette (works on all pages)
  import('./command-palette').then(m => m.initCommandPalette());

  // Load and init the page module
  const loader = pageModules[pageName];
  if (!loader) {
    navigateTo('not-found');
    return;
  }
  try {
    const mod = await loader();
    await mod.init(getParams());
  } catch (err) {
    console.error(`Page "${pageName}" failed to initialize:`, err);
    const container = document.querySelector<HTMLElement>('.page-content')
      || document.getElementById('page-root');
    if (container) {
      setHtml(container, buildErrorState(
        errorMessage(err, 'This page failed to load.'),
      ));
      container.querySelector('[data-retry-btn]')?.addEventListener('click', () => location.reload());
    }
  }
});
