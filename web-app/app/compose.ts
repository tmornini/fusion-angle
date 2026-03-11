// ============================================
// FUSION AI — Build-time HTML Composition
// Combines app/layout.html with per-page index.html
// to produce standalone sidebar-layout index.html files.
// Also copies standalone pages to output directory.
// ============================================

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { PAGE_REGISTRY } from './page-registry';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || ROOT;

// Derive sidebar and standalone page lists from the single registry
const sidebarPages = Object.entries(PAGE_REGISTRY)
  .filter(([, entry]) => entry.layout === 'sidebar')
  .map(([name, entry]) => ({ name, title: entry.title }));

const standalonePages = Object.entries(PAGE_REGISTRY)
  .filter(([, entry]) => entry.layout === 'standalone')
  .map(([name]) => name);

function compose(): void {
  const layoutPath = join(ROOT, 'app', 'layout.html');
  const layout = readFileSync(layoutPath, 'utf-8');

  const missing: string[] = [];
  let composed = 0;

  for (const { name, title } of sidebarPages) {
    const pageHtmlPath = join(ROOT, name, 'index.html');

    if (!existsSync(pageHtmlPath)) {
      missing.push(name);
      continue;
    }

    const pageContent = readFileSync(pageHtmlPath, 'utf-8');

    let html = layout
      .replace('{{PAGE_NAME}}', name)
      .replace('{{PAGE_TITLE}}', title)
      .replace('<!-- PAGE_CONTENT -->', pageContent);

    const outDir = join(OUT, name);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    const outPath = join(outDir, 'index.html');
    writeFileSync(outPath, html, 'utf-8');
    composed++;
  }

  console.log(`Composed ${composed} sidebar pages.`);

  // Copy standalone pages
  let copied = 0;
  for (const name of standalonePages) {
    const srcPath = join(ROOT, name, 'index.html');
    if (!existsSync(srcPath)) {
      missing.push(name);
      continue;
    }

    const outDir = join(OUT, name);
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
