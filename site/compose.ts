// ============================================
// FUSION AI — Build-time HTML Composition
// Combines site/layout.html with per-page index.html
// to produce standalone dashboard index.html files.
// Also copies standalone pages to output directory.
// ============================================

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || ROOT;

// Page name → { source (in repo), folder (output), title }
const dashboardPages: Record<string, { source: string; folder: string; title: string }> = {
  dashboard:      { source: 'core/dashboard',      folder: 'dashboard',      title: 'Dashboard' },
  ideas:          { source: 'core/ideas',           folder: 'ideas',          title: 'Ideas' },
  projects:       { source: 'core/projects',        folder: 'projects',       title: 'Projects' },
  'project-detail':          { source: 'core/project-detail',          folder: 'project-detail',          title: 'Project Detail' },
  'engineering-requirements': { source: 'core/engineering-requirements', folder: 'engineering-requirements', title: 'Engineering Requirements' },
  'idea-review-queue': { source: 'core/idea-review-queue', folder: 'idea-review-queue', title: 'Review Queue' },
  edge:           { source: 'tools/edge',           folder: 'edge',           title: 'Edge Definition' },
  'edge-list':    { source: 'tools/edge-list',      folder: 'edge-list',      title: 'Edge List' },
  crunch:         { source: 'tools/crunch',         folder: 'crunch',         title: 'Crunch' },
  flow:           { source: 'tools/flow',           folder: 'flow',           title: 'Flow' },
  team:           { source: 'admin/team',           folder: 'team',           title: 'Teams' },
  account:        { source: 'admin/account',        folder: 'account',        title: 'Account' },
  profile:        { source: 'admin/profile',        folder: 'profile',        title: 'Profile' },
  'company-settings':        { source: 'admin/company-settings',        folder: 'company-settings',        title: 'Company Settings' },
  'manage-users':            { source: 'admin/manage-users',            folder: 'manage-users',            title: 'Manage Users' },
  'activity-feed':           { source: 'admin/activity-feed',           folder: 'activity-feed',           title: 'Activity Feed' },
  'notification-settings':   { source: 'admin/notification-settings',   folder: 'notification-settings',   title: 'Notification Settings' },
  'design-system': { source: 'reference/design-system', folder: 'design-system', title: 'Design System' },
};

// Standalone pages: source index.html copied directly to output
const standalonePages = [
  { source: 'core/idea-create',     folder: 'idea-create' },
  { source: 'core/idea-scoring',    folder: 'idea-scoring' },
  { source: 'core/idea-convert',    folder: 'idea-convert' },
  { source: 'core/approval-detail', folder: 'approval-detail' },
  { source: 'entry/landing',        folder: 'landing' },
  { source: 'entry/auth',           folder: 'auth' },
  { source: 'entry/onboarding',     folder: 'onboarding' },
  { source: 'system/not-found',     folder: 'not-found' },
];

function compose(): void {
  const layoutPath = join(ROOT, 'site', 'layout.html');
  const layout = readFileSync(layoutPath, 'utf-8');

  let composed = 0;

  for (const [pageName, { source, folder, title }] of Object.entries(dashboardPages)) {
    const pageHtmlPath = join(ROOT, source, 'index.html');

    if (!existsSync(pageHtmlPath)) {
      console.warn(`  skip: ${source}/index.html not found`);
      continue;
    }

    const pageContent = readFileSync(pageHtmlPath, 'utf-8');

    let html = layout
      .replace('{{PAGE_NAME}}', pageName)
      .replace('{{PAGE_TITLE}}', title)
      .replace('<!-- PAGE_CONTENT -->', pageContent);

    const outDir = join(OUT, folder);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    const outPath = join(outDir, 'index.html');
    writeFileSync(outPath, html, 'utf-8');
    composed++;
  }

  console.log(`Composed ${composed} dashboard pages.`);

  // Copy standalone pages
  let copied = 0;
  for (const { source, folder } of standalonePages) {
    const srcPath = join(ROOT, source, 'index.html');
    if (!existsSync(srcPath)) {
      console.warn(`  skip: ${source}/index.html not found`);
      continue;
    }

    const outDir = join(OUT, folder);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    copyFileSync(srcPath, join(outDir, 'index.html'));
    copied++;
  }

  console.log(`Copied ${copied} standalone pages.`);
}

compose();
