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

// Page name → { source path (doubles as output path), title }
const dashboardPages: Record<string, { source: string; title: string }> = {
  dashboard:                  { source: 'core/dashboard',                title: 'Dashboard' },
  ideas:                      { source: 'core/ideas',                    title: 'Ideas' },
  projects:                   { source: 'core/projects',                 title: 'Projects' },
  'project-detail':           { source: 'core/project-detail',           title: 'Project Detail' },
  'engineering-requirements':  { source: 'core/engineering-requirements',  title: 'Engineering Requirements' },
  'idea-review-queue':        { source: 'core/idea-review-queue',        title: 'Review Queue' },
  edge:                       { source: 'tools/edge',                    title: 'Edge Definition' },
  'edge-list':                { source: 'tools/edge-list',               title: 'Edge List' },
  crunch:                     { source: 'tools/crunch',                  title: 'Crunch' },
  flow:                       { source: 'tools/flow',                    title: 'Flow' },
  team:                       { source: 'admin/team',                    title: 'Teams' },
  account:                    { source: 'admin/account',                 title: 'Account' },
  profile:                    { source: 'admin/profile',                 title: 'Profile' },
  'company-settings':         { source: 'admin/company-settings',        title: 'Company Settings' },
  'manage-users':             { source: 'admin/manage-users',            title: 'Manage Users' },
  'activity-feed':            { source: 'admin/activity-feed',           title: 'Activity Feed' },
  'notification-settings':    { source: 'admin/notification-settings',   title: 'Notification Settings' },
  snapshots:                  { source: 'admin/snapshots',               title: 'Snapshots' },
  'design-system':            { source: 'reference/design-system',       title: 'Design System' },
};

// Standalone pages: source index.html copied directly to output (source == output path)
const standalonePages = [
  'core/idea-create',
  'core/idea-convert',
  'core/approval-detail',
  'entry/auth',
  'entry/landing',
  'entry/onboarding',
  'system/not-found',
];

function compose(): void {
  const layoutPath = join(ROOT, 'site', 'layout.html');
  const layout = readFileSync(layoutPath, 'utf-8');

  const missing: string[] = [];
  let composed = 0;

  for (const [pageName, { source, title }] of Object.entries(dashboardPages)) {
    const pageHtmlPath = join(ROOT, source, 'index.html');

    if (!existsSync(pageHtmlPath)) {
      missing.push(source);
      continue;
    }

    const pageContent = readFileSync(pageHtmlPath, 'utf-8');

    let html = layout
      .replace('{{PAGE_NAME}}', pageName)
      .replace('{{PAGE_TITLE}}', title)
      .replace('<!-- PAGE_CONTENT -->', pageContent);

    const outDir = join(OUT, source);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    const outPath = join(outDir, 'index.html');
    writeFileSync(outPath, html, 'utf-8');
    composed++;
  }

  console.log(`Composed ${composed} dashboard pages.`);

  // Copy standalone pages
  let copied = 0;
  for (const source of standalonePages) {
    const srcPath = join(ROOT, source, 'index.html');
    if (!existsSync(srcPath)) {
      missing.push(source);
      continue;
    }

    const outDir = join(OUT, source);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    copyFileSync(srcPath, join(outDir, 'index.html'));
    copied++;
  }

  console.log(`Copied ${copied} standalone pages.`);

  if (missing.length > 0) {
    console.error(`ERROR: ${missing.length} page(s) not found:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }
}

compose();
