import {
    readFileSync,
    writeFileSync,
    existsSync,
    mkdirSync,
} from 'fs';
import { join, dirname } from 'path';
import { PAGE_REGISTRY } from './page-registry';
import { buildSidebarNavItemsHtml } from './nav-items';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const outArg = process.argv[2];
const OUT = outArg !== undefined ? outArg : ROOT;

const sidebarPages = Object.entries(PAGE_REGISTRY)
    .filter(([, entry]) => entry.layout === 'sidebar')
    .map(([name, entry]) => ({
            name,
            title: entry.title,
            sourceDir: entry.sourceDir,
            sourceFile: entry.sourceFile,
            cssBundles: entry.cssBundles,
    }));

const standalonePages = Object.entries(PAGE_REGISTRY)
    .filter(([, entry]) => entry.layout === 'standalone')
    .map(([name, entry]) => ({
            name,
            sourceDir: entry.sourceDir,
            sourceFile: entry.sourceFile,
            cssBundles: entry.cssBundles,
    }));

const PAGE_CSS_PLACEHOLDER = '        <!-- PAGE_CSS_LINKS -->\n';

function buildPageCssLinks(
    bundles: string[] | undefined,
): string {
    if (bundles === undefined) return '';
    return bundles
        .map((b) =>
            '        <link rel="stylesheet" '
            + `href="../assets/${b}.css" />\n`)
        .join('');
}

const COMPONENTS = [
    {
            placeholder: '<!-- COMPONENT_SIDEBAR -->',
            file: 'component-sidebar.html',
    },
    {
            placeholder: '<!-- COMPONENT_TOP_BAR -->',
            file: 'component-top-bar.html',
    },
    {
            placeholder: '<!-- COMPONENT_MOBILE_HEADER -->',
            file: 'component-mobile-header.html',
    },
    {
            placeholder: '<!-- COMPONENT_MOBILE_SIDEBAR -->',
            file: 'component-mobile-sidebar.html',
    },
] as const;

function compose(): void {
    const appDir = join(ROOT, 'app');

    const allPages = [
            ...sidebarPages,
            ...standalonePages,
    ];
    const missing = allPages
        .filter(({ sourceDir, sourceFile }) =>
            !existsSync(join(ROOT, sourceDir, `${sourceFile}.html`)))
        .map(({ name }) => name);
    if (missing.length > 0) {
        const count = missing.length;
        const list = missing.join('\n  ');
        console.error(
                `ERROR: ${count} page(s) not found:\n  ${list}`
        );
        process.exit(1);
    }

    let layout = readFileSync(
        join(appDir, 'components-layout.html'),
        'utf-8',
    );
    for (const { placeholder, file } of COMPONENTS) {
        const content = readFileSync(join(appDir, file), 'utf-8');
        layout = layout.replace(placeholder, content);
    }

    const navHtml = buildSidebarNavItemsHtml();
    layout = layout.replaceAll(
        '<!-- SIDEBAR_NAV_ITEMS -->',
        navHtml,
    );

    for (const page of sidebarPages) {
        const { name, title, sourceDir, sourceFile } = page;
        const pageHtmlPath = join(ROOT, sourceDir, `${sourceFile}.html`);
        const pageContent = readFileSync(pageHtmlPath, 'utf-8');

        const html = layout
            .replace('{{PAGE_NAME}}', name)
            .replace('{{PAGE_TITLE}}', title)
            .replace('<!-- PAGE_CONTENT -->', pageContent)
            .replace(
                PAGE_CSS_PLACEHOLDER,
                buildPageCssLinks(page.cssBundles),
            );

        const outDir = join(OUT, sourceDir);
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

        const outPath = join(outDir, `${sourceFile}.html`);
        writeFileSync(outPath, html, 'utf-8');
    }

    console.log(`Composed ${sidebarPages.length} sidebar pages.`);

    for (const page of standalonePages) {
        const { sourceDir, sourceFile } = page;
        const srcPath = join(ROOT, sourceDir, `${sourceFile}.html`);
        const content = readFileSync(srcPath, 'utf-8');
        const html = content.replace(
            PAGE_CSS_PLACEHOLDER,
            buildPageCssLinks(page.cssBundles),
        );

        const outDir = join(OUT, sourceDir);
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

        writeFileSync(join(outDir, `${sourceFile}.html`), html, 'utf-8');
    }

    console.log(`Composed ${standalonePages.length} standalone pages.`);
}

compose();
