// Page-load phase marks via Performance User Timing.
// Start/end mark names are `${measureName}:start` and
// `${measureName}:end`; the measure entry is `measureName`
// (wire-stable for the CDP harness). `page:ready` measures
// from timeOrigin to now with no start mark. No try/catch
// around platform primitives. Aborted boots never call
// recordPageReady.

import { log } from './logger.ts';

// ── Wire-stable measure names ──────

export const MEASURE_BOOT_DB_OPEN =
    'boot:db-open';
export const MEASURE_BOOT_SCHEMA_GATE =
    'boot:schema-gate';
export const MEASURE_BOOT_AUTH_GATE =
    'boot:auth-gate';
export const MEASURE_BOOT_ORGANIZATION_SCOPE =
    'boot:organization-scope';
export const MEASURE_BOOT_SIDEBAR_CHROME =
    'boot:sidebar-chrome';
export const MEASURE_BOOT_COMMAND_PALETTE =
    'boot:command-palette';
export const MEASURE_BOOT_MODULE_IMPORT =
    'boot:module-import';
export const MEASURE_BOOT_PAGE_INIT =
    'boot:page-init';
export const MEASURE_PAGE_READY = 'page:ready';

/** Boot phases harvested by recordPageReady, in order.
 *  Sidebar chrome, command palette, and page-init may
 *  overlap on the wall clock after the boot parallelization;
 *  readyMs (page:ready) is the only summable truth — do not
 *  add phase medians expecting wall time. */
export const BOOT_PHASE_MEASURE_NAMES = [
    MEASURE_BOOT_DB_OPEN,
    MEASURE_BOOT_SCHEMA_GATE,
    MEASURE_BOOT_AUTH_GATE,
    MEASURE_BOOT_ORGANIZATION_SCOPE,
    MEASURE_BOOT_SIDEBAR_CHROME,
    MEASURE_BOOT_COMMAND_PALETTE,
    MEASURE_BOOT_MODULE_IMPORT,
    MEASURE_BOOT_PAGE_INIT,
] as const;

const MARK_START_SUFFIX = ':start';
const MARK_END_SUFFIX = ':end';

function startMarkName(
    measureName: string,
): string {
    return measureName + MARK_START_SUFFIX;
}

function endMarkName(
    measureName: string,
): string {
    return measureName + MARK_END_SUFFIX;
}

// ── Mark / measure ──────

export function markStart(
    measureName: string,
): void {
    performance.mark(startMarkName(measureName));
}

export function markEnd(
    measureName: string,
): void {
    const end = endMarkName(measureName);
    performance.mark(end);
    performance.measure(
        measureName,
        startMarkName(measureName),
        end,
    );
}

export function fetchMeasureName(
    containerId: string,
): string {
    return `fetch:${containerId}`;
}

export function renderMeasureName(
    containerId: string,
): string {
    return `render:${containerId}`;
}

// ── Pure harvest helpers ──────

export type PagePerformanceFieldsInput = {
    page: string;
    readyMs: number;
    // Nested for CDP harvest of the log line.
    phases: Record<string, number>;
    ttfbMs?: number;
    domContentLoadedMs?: number;
};

/** Shape the structured fields bag for the ready log. */
export function assemblePagePerformanceFields(
    input: PagePerformanceFieldsInput,
): Record<string, unknown> {
    const fields: Record<string, unknown> = {
        page: input.page,
        readyMs: input.readyMs,
        phases: input.phases,
    };
    if (input.ttfbMs !== undefined) {
        fields.ttfbMs = input.ttfbMs;
    }
    if (input.domContentLoadedMs !== undefined) {
        fields.domContentLoadedMs =
            input.domContentLoadedMs;
    }
    return fields;
}

/**
 * Duration of the last measure entry for `name`, or
 * undefined when no measure of that name exists.
 */
export function readMeasureDurationMs(
    name: string,
): number | undefined {
    const entries = performance.getEntriesByName(
        name,
        'measure',
    );
    if (entries.length === 0) {
        return undefined;
    }
    return entries[entries.length - 1]!.duration;
}

// ── Ready sentinel ──────

/**
 * Measure page:ready from timeOrigin → now, collect
 * measured boot phases (skip missing; no invented zeros),
 * read nav timing when present, emit one info log.
 */
export function recordPageReady(page: string): void {
    // User Timing Level 2: omitted start uses timeOrigin.
    performance.measure(MEASURE_PAGE_READY);
    const readyMs = readMeasureDurationMs(
        MEASURE_PAGE_READY,
    )!;

    const phases: Record<string, number> = {};
    for (const name of BOOT_PHASE_MEASURE_NAMES) {
        const ms = readMeasureDurationMs(name);
        if (ms !== undefined) {
            phases[name] = ms;
        }
    }

    const navEntries =
        performance.getEntriesByType('navigation');
    const nav = navEntries[0] as
        | PerformanceNavigationTiming
        | undefined;

    let fields: Record<string, unknown>;
    if (nav !== undefined) {
        fields = assemblePagePerformanceFields({
            page,
            readyMs,
            phases,
            ttfbMs: nav.responseStart,
            domContentLoadedMs:
                nav.domContentLoadedEventEnd,
        });
    } else {
        fields = assemblePagePerformanceFields({
            page,
            readyMs,
            phases,
        });
    }

    log.info(
        'page ready',
        'page-performance',
        fields,
    );
}
