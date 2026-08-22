// Pure request-profile aggregation for ./measure --profile.
// No I/O — unit-tested only.

import {
    residualPageInitMs,
    MEASURE_BOOT_PAGE_INIT,
} from './measure-viz-core.ts';
import { isIdentifier } from
    '../../shared/identifier.ts';

export type ApiRequestHit = {
    method: string;
    resource: string;
};

export type RouteCount = {
    method: string;
    resource: string;
    count: number;
};

export type RequestProfileSummary = {
    total: number;
    /** Count desc, then method, then resource. */
    byRoute: RouteCount[];
};

/** Default pages for bare --profile (heaviest page-init). */
export const DEFAULT_PROFILE_PAGES = [
    'organization',
    'workbox',
    'workbox-detail',
    'projects',
] as const;

/**
 * Collapse id path segments (22-char base62) to `:id`
 * so detail URLs aggregate across runs.
 */
export function canonicalizeResource(
    resource: string,
): string {
    return resource
        .split('/')
        .map((seg) => (
            isOpaqueIdSegment(seg) ? ':id' : seg
        ))
        .join('/');
}

function isOpaqueIdSegment(seg: string): boolean {
    return isIdentifier(seg);
}

export function summarizeRequestHits(
    hits: readonly ApiRequestHit[],
): RequestProfileSummary {
    const map = new Map<string, number>();
    for (const h of hits) {
        const resource = canonicalizeResource(
            h.resource,
        );
        const key = h.method + '\0' + resource;
        map.set(key, (map.get(key) ?? 0) + 1);
    }
    const byRoute: RouteCount[] = [];
    for (const [key, count] of map) {
        const sep = key.indexOf('\0');
        byRoute.push({
            method: key.slice(0, sep),
            resource: key.slice(sep + 1),
            count,
        });
    }
    byRoute.sort((a, b) => {
        if (a.count !== b.count) {
            return b.count - a.count;
        }
        if (a.method !== b.method) {
            return a.method < b.method ? -1 : 1;
        }
        if (a.resource < b.resource) return -1;
        if (a.resource > b.resource) return 1;
        return 0;
    });
    return { total: hits.length, byRoute };
}

export type PageInitAttribution = {
    pageInitMs: number | undefined;
    residualMs: number | undefined;
    nestedFetchMs: number;
    nestedRenderMs: number;
};

export function pageInitAttribution(
    phases: Record<string, number>,
): PageInitAttribution {
    let nestedFetchMs = 0;
    let nestedRenderMs = 0;
    for (const name of Object.keys(phases)) {
        const ms = phases[name]!;
        if (name.startsWith('fetch:')) {
            nestedFetchMs += ms;
        } else if (name.startsWith('render:')) {
            nestedRenderMs += ms;
        }
    }
    const pageInitMs =
        phases[MEASURE_BOOT_PAGE_INIT];
    return {
        pageInitMs,
        residualMs: residualPageInitMs(phases),
        nestedFetchMs,
        nestedRenderMs,
    };
}

/**
 * Text report for one page's ready run + API hits.
 */
export function formatRequestProfileReport(
    page: string,
    readyMs: number,
    phases: Record<string, number>,
    hits: readonly ApiRequestHit[],
): string {
    const summary = summarizeRequestHits(hits);
    const attr = pageInitAttribution(phases);
    const lines: string[] = [
        `=== Request profile: ${page} ===`,
        `readyMs  ${fmtMs(readyMs)}`,
    ];
    if (attr.pageInitMs !== undefined) {
        const resid = attr.residualMs ?? 0;
        lines.push(
            `page-init  ${fmtMs(attr.pageInitMs)}`
            + `  residual ${fmtMs(resid)}`
            + `  nested-fetch ${fmtMs(attr.nestedFetchMs)}`
            + `  nested-render`
            + ` ${fmtMs(attr.nestedRenderMs)}`,
        );
    }
    lines.push(
        `API requests  ${summary.total} total`,
        '',
        '  count  method  resource',
    );
    if (summary.byRoute.length === 0) {
        lines.push('  (none recorded)');
    } else {
        for (const r of summary.byRoute) {
            lines.push(
                `  ${String(r.count).padStart(5)}`
                + `  ${r.method.padEnd(6)}`
                + `  ${r.resource}`,
            );
        }
    }
    lines.push('');
    return lines.join('\n');
}

function fmtMs(ms: number): string {
    if (!Number.isFinite(ms)) {
        return String(ms);
    }
    // Match measure report density: whole ms when near-int.
    if (Math.abs(ms - Math.round(ms)) < 0.05) {
        return String(Math.round(ms));
    }
    return ms.toFixed(1);
}
