// HTML unless the client asks for JSON. A browser
// sends Accept: text/html. Content-Type
// application/json, or an Accept that prefers it,
// selects the JSON document.

import { join } from '@std/path';

const JSON_TYPE = 'application/json';
const HTML_TYPE = 'text/html';

const STYLES_NAME = /^styles\.[0-9a-f]{8,}\.css$/;
const ICON_NAME = /^favicon\.[0-9a-f]{8,}\.svg$/;

// `up` is every key. A new component is another key.
export interface StatusComponents {
    readonly postgres: boolean;
}

const COMPONENT_LABEL: {
    readonly [K in keyof StatusComponents]: string;
} = {
    postgres: 'Postgres',
};

export interface StatusAssets {
    readonly styles?: string;
    readonly icon?: string;
}

export function everyComponentUp(
    components: StatusComponents,
): boolean {
    return Object.values(components).every(
        (up) => up === true,
    );
}

export function jsonRequested(headers: Headers): boolean {
    if (mediaType(headers.get('content-type'))
        === JSON_TYPE) {
        return true;
    }
    const accept = headers.get('accept');
    if (accept === null || accept.trim() === '') {
        return false;
    }
    let jsonQ = 0;
    let htmlQ = 0;
    let sawJson = false;
    let sawHtml = false;
    for (const raw of accept.split(',')) {
        const part = raw.trim();
        if (part === '') continue;
        const type = mediaType(part);
        const q = qualityOf(part);
        if (type === JSON_TYPE) {
            sawJson = true;
            jsonQ = Math.max(jsonQ, q);
        }
        if (type === HTML_TYPE
            || type === 'application/xhtml+xml') {
            sawHtml = true;
            htmlQ = Math.max(htmlQ, q);
        }
    }
    if (!sawJson || jsonQ === 0) return false;
    if (!sawHtml) return true;
    return jsonQ > htmlQ;
}

export async function statusAssets(
    staticRoot: string,
): Promise<StatusAssets> {
    let text: string;
    try {
        text = await Deno.readTextFile(
            join(staticRoot, 'asset-manifest.json'),
        );
    } catch {
        // A missing manifest still serves the page.
        return {};
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        // A broken manifest still serves the page.
        return {};
    }
    if (parsed === null
        || typeof parsed !== 'object'
        || Array.isArray(parsed)) {
        return {};
    }
    const record = parsed as Record<string, unknown>;
    const styles = publishedHref(
        record['styles.css'], STYLES_NAME,
    );
    const icon = publishedHref(
        record['favicon.svg'], ICON_NAME,
    );
    return {
        ...(styles !== undefined ? { styles } : {}),
        ...(icon !== undefined ? { icon } : {}),
    };
}

export function statusPageHtml(
    sha: string,
    components: StatusComponents,
    assets: StatusAssets,
): string {
    const up = everyComponentUp(components);
    const title = up ? 'Up' : 'Down';
    const links: string[] = [];
    if (assets.styles !== undefined) {
        links.push(
            '<link rel="stylesheet" href="'
            + escapeText(assets.styles)
            + '">',
        );
    }
    if (assets.icon !== undefined) {
        links.push(
            '<link rel="icon" type="image/svg+xml"'
            + ' href="'
            + escapeText(assets.icon)
            + '">',
        );
    }
    return [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="UTF-8">',
        '<meta name="viewport"',
        ' content="width=device-width, initial-scale=1.0">',
        '<title>Status | Fusion Angle</title>',
        ...links,
        '</head>',
        '<body>',
        '<main class="flex min-h-screen items-center',
        ' justify-center bg-background">',
        '<section class="card max-w-md p-8 text-center">',
        '<h1 class="font-display text-3xl font-bold mb-6">',
        'Fusion Angle',
        '</h1>',
        '<p class="mb-6 flex flex-wrap justify-center',
        ' gap-2">',
        statusPill(title, up),
        ...componentPills(components),
        '</p>',
        '<p class="text-muted text-sm">git sha</p>',
        '<p class="git-sha font-mono text-sm">',
        escapeText(sha),
        '</p>',
        '</section>',
        '</main>',
        '</body>',
        '</html>',
    ].join('\n');
}

export function statusUnavailableHtml(): string {
    return [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="UTF-8">',
        '<meta name="viewport"',
        ' content="width=device-width, initial-scale=1.0">',
        '<title>Status | Fusion Angle</title>',
        '</head>',
        '<body>',
        '<main class="flex min-h-screen items-center',
        ' justify-center bg-background">',
        '<section class="card max-w-md p-8 text-center">',
        '<h1 class="font-display text-3xl font-bold mb-6">',
        'Fusion Angle',
        '</h1>',
        '<p class="text-muted">Unavailable</p>',
        '<p class="text-muted">git sha unavailable</p>',
        '</section>',
        '</main>',
        '</body>',
        '</html>',
    ].join('\n');
}

function statusPill(label: string, up: boolean): string {
    const tone = up ? 'success' : 'error';
    return '<span class="pill" data-tone="'
        + tone + '">' + escapeText(label) + '</span>';
}

function componentPills(
    components: StatusComponents,
): readonly string[] {
    const keys = Object.keys(COMPONENT_LABEL) as
        (keyof StatusComponents)[];
    return keys.map((key) => {
        const up = components[key];
        const word = up ? 'up' : 'down';
        return statusPill(
            COMPONENT_LABEL[key] + ' ' + word, up,
        );
    });
}

function mediaType(
    header: string | null,
): string | undefined {
    if (header === null) return undefined;
    const type = header.split(';', 1)[0]?.trim()
        .toLowerCase();
    if (type === undefined || type === '') {
        return undefined;
    }
    return type;
}

function qualityOf(part: string): number {
    const match = /(?:^|;)\s*q=([^;\s]*)/i.exec(part);
    const raw = match?.[1];
    if (raw === undefined) return 1;
    const q = Number(raw);
    if (!Number.isFinite(q) || q < 0) return 0;
    if (q > 1) return 1;
    return q;
}

function publishedHref(
    name: unknown,
    pattern: RegExp,
): string | undefined {
    if (typeof name !== 'string') return undefined;
    if (!pattern.test(name)) return undefined;
    return '/assets/' + name;
}

function escapeText(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}
