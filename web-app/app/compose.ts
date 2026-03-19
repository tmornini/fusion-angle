import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { PAGE_REGISTRY } from './page-registry';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.argv[2] || ROOT;

// Derive sidebar and standalone page lists from the single registry
const sidebarPages = Object.entries(PAGE_REGISTRY)
  .filter(([, entry]) => entry.layout === 'sidebar')
  .map(([name, entry]) => ({ name, title: entry.title, sourceDir: entry.sourceDir, sourceFile: entry.sourceFile }));

const standalonePages = Object.entries(PAGE_REGISTRY)
  .filter(([, entry]) => entry.layout === 'standalone')
  .map(([name, entry]) => ({ name, sourceDir: entry.sourceDir, sourceFile: entry.sourceFile }));

// Component files injected into layout
const COMPONENTS = [
  { placeholder: '<!-- COMPONENT_SIDEBAR -->', file: 'component-sidebar.html' },
  { placeholder: '<!-- COMPONENT_TOP_BAR -->', file: 'component-top-bar.html' },
  { placeholder: '<!-- COMPONENT_MOBILE_HEADER -->', file: 'component-mobile-header.html' },
  { placeholder: '<!-- COMPONENT_MOBILE_SIDEBAR -->', file: 'component-mobile-sidebar.html' },
] as const;

function compose(): void {
  const appDir = join(ROOT, 'app');

  // Phase 1: Validate all inputs exist
  const missing: string[] = [];
  for (const { name, sourceDir, sourceFile } of [...sidebarPages, ...standalonePages]) {
    const file = sourceFile || 'index';
    const path = join(ROOT, sourceDir || name, `${file}.html`);
    if (!existsSync(path)) missing.push(name);
  }
  if (missing.length > 0) {
    console.error(`ERROR: ${missing.length} page(s) not found:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }

  // Phase 2: Read layout and inject components
  let layout = readFileSync(join(appDir, 'components-layout.html'), 'utf-8');
  for (const { placeholder, file } of COMPONENTS) {
    const content = readFileSync(join(appDir, file), 'utf-8');
    layout = layout.replace(placeholder, content);
  }

  // Phase 3: Write all outputs
  let composed = 0;
  for (const { name, title, sourceDir, sourceFile } of sidebarPages) {
    const file = sourceFile || 'index';
    const pageHtmlPath = join(ROOT, sourceDir || name, `${file}.html`);
    const pageContent = readFileSync(pageHtmlPath, 'utf-8');

    let html = layout
      .replace('{{PAGE_NAME}}', name)
      .replace('{{PAGE_TITLE}}', title)
      .replace('<!-- PAGE_CONTENT -->', pageContent);

    const outDir = join(OUT, sourceFile ? (sourceDir || name) : name);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    const outPath = join(outDir, `${file}.html`);
    writeFileSync(outPath, html, 'utf-8');
    composed++;
  }

  console.log(`Composed ${composed} sidebar pages.`);

  let copied = 0;
  for (const { name, sourceDir, sourceFile } of standalonePages) {
    const file = sourceFile || 'index';
    const srcPath = join(ROOT, sourceDir || name, `${file}.html`);

    const outDir = join(OUT, sourceFile ? (sourceDir || name) : name);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    copyFileSync(srcPath, join(outDir, `${file}.html`));
    copied++;
  }

  console.log(`Copied ${copied} standalone pages.`);
}

compose();
