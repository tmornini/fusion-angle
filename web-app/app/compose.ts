import { join, resolve } from '@std/path';
import { copySync } from '@std/fs';
import { PAGE_REGISTRY } from './page-registry.ts';
import { buildSidebarNavItemsHtml } from './nav-items.ts';

function exists(path: string): boolean {
    try {
        Deno.statSync(path);
        return true;
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return false;
        }
        throw error;
    }
}

const composeDir = import.meta.dirname;
if (composeDir === undefined) {
    throw new Error('import.meta.dirname is undefined');
}
const ROOT = join(composeDir, '..');
const outArg = Deno.args[0];
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

const PAGE_CSS_PLACEHOLDER = '        {{PAGE_CSS_LINKS}}\n';

function manifestOf(
    value: unknown,
): Record<string, string> {
    if (value === null
        || typeof value !== 'object'
        || Array.isArray(value)) {
        throw new Error(
            'asset-manifest.json is not an object',
        );
    }
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(value)) {
        if (typeof val !== 'string') {
            throw new Error(
                'asset-manifest.json values must be'
                    + ' strings',
            );
        }
        out[key] = val;
    }
    return out;
}

function readManifest(
    outDir: string,
): Record<string, string> {
    const path = join(outDir, 'asset-manifest.json');
    if (!exists(path)) return {};
    return manifestOf(
        JSON.parse(Deno.readTextFileSync(path)) as unknown,
    );
}

function rewriteAssetRefs(
    html: string,
    manifest: Record<string, string>,
): string {
    let out = html;
    const names = Object.keys(manifest)
        .sort((a, b) => b.length - a.length);
    for (const logical of names) {
        const hashed = manifest[logical];
        if (hashed === undefined) continue;
        out = out.replaceAll(
            '../assets/' + logical,
            '../assets/' + hashed,
        );
        out = out.replaceAll(
            'assets/' + logical,
            'assets/' + hashed,
        );
    }
    return out;
}

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
            placeholder: '{{COMPONENT_SIDEBAR}}',
            file: 'component-sidebar.html',
    },
    {
            placeholder: '{{COMPONENT_TOP_BAR}}',
            file: 'component-top-bar.html',
    },
    {
            placeholder: '{{COMPONENT_MOBILE_HEADER}}',
            file: 'component-mobile-header.html',
    },
    {
            placeholder: '{{COMPONENT_MOBILE_SIDEBAR}}',
            file: 'component-mobile-sidebar.html',
    },
] as const;

function compose(): void {
    const appDir = join(ROOT, 'app');
    const manifest = readManifest(OUT);

    const allPages = [
            ...sidebarPages,
            ...standalonePages,
    ];
    const missing = allPages
        .filter(({ sourceDir, sourceFile }) =>
            !exists(join(ROOT, sourceDir, `${sourceFile}.html`)))
        .map(({ name }) => name);
    if (missing.length > 0) {
        const count = missing.length;
        const list = missing.join('\n  ');
        console.error(
                `ERROR: ${count} page(s) not found:\n  ${list}`
        );
        Deno.exit(1);
    }

    let layout = Deno.readTextFileSync(
        join(appDir, 'components-layout.html'),
    );
    for (const { placeholder, file } of COMPONENTS) {
        const content = Deno.readTextFileSync(join(appDir, file));
        layout = layout.replace(placeholder, content);
    }

    const navHtml = buildSidebarNavItemsHtml();
    layout = layout.replaceAll(
        '{{SIDEBAR_NAV_ITEMS}}',
        navHtml,
    );

    for (const page of sidebarPages) {
        const { name, title, sourceDir, sourceFile } = page;
        const pageHtmlPath = join(ROOT, sourceDir, `${sourceFile}.html`);
        const pageContent = Deno.readTextFileSync(pageHtmlPath);

        const html = layout
            .replace('{{PAGE_NAME}}', name)
            .replace('{{PAGE_TITLE}}', title)
            .replace('{{PAGE_CONTENT}}', pageContent)
            .replace(
                PAGE_CSS_PLACEHOLDER,
                buildPageCssLinks(page.cssBundles),
            );

        const outDir = join(OUT, sourceDir);
        if (!exists(outDir)) Deno.mkdirSync(outDir, { recursive: true });

        const outPath = join(outDir, `${sourceFile}.html`);
        Deno.writeTextFileSync(
            outPath,
            rewriteAssetRefs(html, manifest),
        );
    }

    console.log(`Composed ${sidebarPages.length} sidebar pages.`);

    for (const page of standalonePages) {
        const { sourceDir, sourceFile } = page;
        const srcPath = join(ROOT, sourceDir, `${sourceFile}.html`);
        const content = Deno.readTextFileSync(srcPath);
        const html = content.replace(
            PAGE_CSS_PLACEHOLDER,
            buildPageCssLinks(page.cssBundles),
        );

        const outDir = join(OUT, sourceDir);
        if (!exists(outDir)) Deno.mkdirSync(outDir, { recursive: true });

        Deno.writeTextFileSync(
            join(outDir, `${sourceFile}.html`),
            rewriteAssetRefs(html, manifest),
        );
    }

    console.log(`Composed ${standalonePages.length} standalone pages.`);

    const rootIndex = join(OUT, 'index.html');
    if (exists(rootIndex)) {
        const html = Deno.readTextFileSync(rootIndex);
        Deno.writeTextFileSync(
            rootIndex,
            rewriteAssetRefs(html, manifest),
        );
    }

    copyApiDocumentationRooms();
}

function copyApiDocumentationRooms(): void {
    const src = join(ROOT, 'api-documentation');
    const dest = join(OUT, 'api-documentation');
    if (resolve(src) === resolve(dest)) return;
    if (!exists(dest)) {
        Deno.mkdirSync(dest, { recursive: true });
    }
    for (const name of [...Deno.readDirSync(src)].map((e) => e.name)) {
        if (
            name === 'index.html'
            || name.endsWith('.ts')
        ) {
            continue;
        }
        copySync(
            join(src, name),
            join(dest, name),
            { overwrite: true },
        );
    }
}

compose();
