import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    MEASURE_BOOT_DB_OPEN,
    MEASURE_BOOT_AUTH_GATE,
    MEASURE_BOOT_ORGANIZATION_SCOPE,
    MEASURE_BOOT_SIDEBAR_CHROME,
    MEASURE_BOOT_COMMAND_PALETTE,
    MEASURE_BOOT_MODULE_IMPORT,
    MEASURE_BOOT_PAGE_INIT,
    MEASURE_PAGE_READY,
    BOOT_PHASE_MEASURE_NAMES,
    markStart,
    markEnd,
    fetchMeasureName,
    renderMeasureName,
    assemblePagePerformanceFields,
    readMeasureDurationMs,
    recordPageReady,
} from '../web-app/app/page-performance.ts';
import { withLocalStorage } from
    './fixtures/local-storage.ts';

// page-performance -> logger -> preferences reads
// localStorage lazily, only inside recordPageReady's own
// log.info call — the one test below that calls it installs
// the fake for that call. Return 'info' so its info line
// emits.
const INFO_LEVEL_STORAGE: Partial<Storage> = {
    getItem: (key: string) => (
        key === 'fusion-angle:log-level'
            ? 'info'
            : null
    ),
    setItem: () => {},
};

/** Capture a single console method call as args. */
function capture(
    method: 'debug' | 'info' | 'warn' | 'error',
    fn: () => void,
): unknown[][] {
    const calls: unknown[][] = [];
    const original = console[method];
    console[method] = (
        ...args: unknown[]
    ) => {
        calls.push(args);
    };
    try {
        fn();
    } finally {
        console[method] = original;
    }
    return calls;
}

function fieldsOf(
    call: unknown[],
): Record<string, unknown> {
    const fields = call[1];
    assert(
        fields !== null
        && typeof fields === 'object'
        && !Array.isArray(fields),
        `Expected fields object, got: ${
            String(fields)
        }`,
    );
    return fields as Record<string, unknown>;
}

function busyWaitMs(ms: number): void {
    const end = performance.now() + ms;
    while (performance.now() < end) {
        // spin until wall time advances
    }
}

// ── Wire-stable phase names ──────

Deno.test(
    'phase-name constants equal wire-stable strings',
    () => {
        assertStrictEquals(
            MEASURE_BOOT_DB_OPEN, 'boot:db-open',
        );
        assertStrictEquals(
            MEASURE_BOOT_AUTH_GATE,
            'boot:auth-gate',
        );
        assertStrictEquals(
            MEASURE_BOOT_ORGANIZATION_SCOPE,
            'boot:organization-scope',
        );
        assertStrictEquals(
            MEASURE_BOOT_SIDEBAR_CHROME,
            'boot:sidebar-chrome',
        );
        assertStrictEquals(
            MEASURE_BOOT_COMMAND_PALETTE,
            'boot:command-palette',
        );
        assertStrictEquals(
            MEASURE_BOOT_MODULE_IMPORT,
            'boot:module-import',
        );
        assertStrictEquals(
            MEASURE_BOOT_PAGE_INIT,
            'boot:page-init',
        );
        assertStrictEquals(
            MEASURE_PAGE_READY, 'page:ready',
        );
        assertEquals(
            [...BOOT_PHASE_MEASURE_NAMES],
            [
                'boot:db-open',
                'boot:auth-gate',
                'boot:organization-scope',
                'boot:sidebar-chrome',
                'boot:command-palette',
                'boot:module-import',
                'boot:page-init',
            ],
        );
    },
);

Deno.test(
    'fetchMeasureName / renderMeasureName format',
    () => {
        assertStrictEquals(
            fetchMeasureName('ideas-list'),
            'fetch:ideas-list',
        );
        assertStrictEquals(
            renderMeasureName('ideas-list'),
            'render:ideas-list',
        );
        assertStrictEquals(
            fetchMeasureName('main'),
            'fetch:main',
        );
        assertStrictEquals(
            renderMeasureName('main'),
            'render:main',
        );
    },
);

// ── Pure field assembly ──────

Deno.test(
    'assemblePagePerformanceFields nests phases',
    () => {
        const fields =
            assemblePagePerformanceFields({
                page: 'dashboard',
                readyMs: 120.5,
                phases: {
                    'boot:db-open': 10,
                    'boot:page-init': 40,
                },
            });
        assertStrictEquals(fields.page, 'dashboard');
        assertStrictEquals(fields.readyMs, 120.5);
        assertEquals(fields.phases, {
            'boot:db-open': 10,
            'boot:page-init': 40,
        });
        assertStrictEquals(
            fields.ttfbMs, undefined,
            'optional nav fields omitted when absent',
        );
        assertStrictEquals(
            fields.domContentLoadedMs,
            undefined,
        );
    },
);

Deno.test(
    'assemblePagePerformanceFields includes nav'
    + ' timing when provided',
    () => {
        const fields =
            assemblePagePerformanceFields({
                page: 'flows',
                readyMs: 200,
                phases: {
                    'boot:auth-gate': 5,
                },
                ttfbMs: 12.3,
                domContentLoadedMs: 80,
            });
        assertStrictEquals(fields.page, 'flows');
        assertStrictEquals(fields.readyMs, 200);
        assertStrictEquals(fields.ttfbMs, 12.3);
        assertStrictEquals(
            fields.domContentLoadedMs, 80,
        );
        assertEquals(fields.phases, {
            'boot:auth-gate': 5,
        });
    },
);

// ── Mark / measure / harvest ──────

Deno.test(
    'markStart + markEnd creates positive duration',
    () => {
        const name =
            'boot:db-open-test-positive';
        markStart(name);
        busyWaitMs(2);
        markEnd(name);
        const ms = readMeasureDurationMs(name);
        assert(
            ms !== undefined,
            'measure entry must exist',
        );
        assert(
            ms > 0,
            `expected positive duration, got ${ms}`,
        );
    },
);

Deno.test(
    'readMeasureDurationMs returns undefined'
    + ' when absent',
    () => {
        assertStrictEquals(
            readMeasureDurationMs(
                'no-such-measure-xyz',
            ),
            undefined,
        );
    },
);

Deno.test(
    'recordPageReady emits one info log with'
    + ' page-performance context',
    () => withLocalStorage(INFO_LEVEL_STORAGE, () => {
        // Seed one boot phase so phases is non-empty.
        markStart(MEASURE_BOOT_DB_OPEN);
        busyWaitMs(1);
        markEnd(MEASURE_BOOT_DB_OPEN);

        const calls = capture(
            'info',
            () => recordPageReady('dashboard'),
        );
        assertStrictEquals(calls.length, 1);
        const call = calls[0]!;
        assertStrictEquals(call[0], 'page ready');
        const fields = fieldsOf(call);
        assertStrictEquals(
            fields.context, 'page-performance',
        );
        assertStrictEquals(fields.page, 'dashboard');
        assertStrictEquals(fields.level, 'info');
        assert(
            typeof fields.readyMs === 'number',
            'readyMs must be a number',
        );
        assert(
            (fields.readyMs as number) > 0,
            'readyMs from timeOrigin must be > 0',
        );
        const phases = fields.phases as
            Record<string, number>;
        assert(
            phases !== null
            && typeof phases === 'object',
        );
        assert(
            typeof phases['boot:db-open']
                === 'number',
            'measured boot phase must appear',
        );
        // Unmeasured boot phases must not be zeros.
        assertStrictEquals(
            phases['boot:page-init'],
            undefined,
        );
        // Node has no navigation entry — omit.
        assertStrictEquals(
            fields.ttfbMs, undefined,
        );
        assertStrictEquals(
            fields.domContentLoadedMs,
            undefined,
        );
    }),
);
