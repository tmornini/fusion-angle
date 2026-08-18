import { test } from 'node:test';
import { strict as assert } from 'node:assert';

// page-performance → logger → preferences reads
// localStorage, which is absent in Node. Stub it
// before any import that touches logger. Return
// 'info' so recordPageReady's info line emits.
// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: (key: string) => (
        key === 'fusion-ai:log-level'
            ? 'info'
            : null
    ),
    setItem: () => {},
};

const {
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
} = await import(
    '../web-app/app/page-performance.ts'
);

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
    assert.ok(
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

test(
    'phase-name constants equal wire-stable strings',
    () => {
        assert.equal(
            MEASURE_BOOT_DB_OPEN, 'boot:db-open',
        );
        assert.equal(
            MEASURE_BOOT_AUTH_GATE,
            'boot:auth-gate',
        );
        assert.equal(
            MEASURE_BOOT_ORGANIZATION_SCOPE,
            'boot:organization-scope',
        );
        assert.equal(
            MEASURE_BOOT_SIDEBAR_CHROME,
            'boot:sidebar-chrome',
        );
        assert.equal(
            MEASURE_BOOT_COMMAND_PALETTE,
            'boot:command-palette',
        );
        assert.equal(
            MEASURE_BOOT_MODULE_IMPORT,
            'boot:module-import',
        );
        assert.equal(
            MEASURE_BOOT_PAGE_INIT,
            'boot:page-init',
        );
        assert.equal(
            MEASURE_PAGE_READY, 'page:ready',
        );
        assert.deepEqual(
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

test(
    'fetchMeasureName / renderMeasureName format',
    () => {
        assert.equal(
            fetchMeasureName('ideas-list'),
            'fetch:ideas-list',
        );
        assert.equal(
            renderMeasureName('ideas-list'),
            'render:ideas-list',
        );
        assert.equal(
            fetchMeasureName('main'),
            'fetch:main',
        );
        assert.equal(
            renderMeasureName('main'),
            'render:main',
        );
    },
);

// ── Pure field assembly ──────

test(
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
        assert.equal(fields.page, 'dashboard');
        assert.equal(fields.readyMs, 120.5);
        assert.deepEqual(fields.phases, {
            'boot:db-open': 10,
            'boot:page-init': 40,
        });
        assert.equal(
            fields.ttfbMs, undefined,
            'optional nav fields omitted when absent',
        );
        assert.equal(
            fields.domContentLoadedMs,
            undefined,
        );
    },
);

test(
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
        assert.equal(fields.page, 'flows');
        assert.equal(fields.readyMs, 200);
        assert.equal(fields.ttfbMs, 12.3);
        assert.equal(
            fields.domContentLoadedMs, 80,
        );
        assert.deepEqual(fields.phases, {
            'boot:auth-gate': 5,
        });
    },
);

// ── Mark / measure / harvest ──────

test(
    'markStart + markEnd creates positive duration',
    () => {
        const name =
            'boot:db-open-test-positive';
        markStart(name);
        busyWaitMs(2);
        markEnd(name);
        const ms = readMeasureDurationMs(name);
        assert.ok(
            ms !== undefined,
            'measure entry must exist',
        );
        assert.ok(
            ms > 0,
            `expected positive duration, got ${ms}`,
        );
    },
);

test(
    'readMeasureDurationMs returns undefined'
    + ' when absent',
    () => {
        assert.equal(
            readMeasureDurationMs(
                'no-such-measure-xyz',
            ),
            undefined,
        );
    },
);

test(
    'recordPageReady emits one info log with'
    + ' page-performance context',
    () => {
        // Seed one boot phase so phases is non-empty.
        markStart(MEASURE_BOOT_DB_OPEN);
        busyWaitMs(1);
        markEnd(MEASURE_BOOT_DB_OPEN);

        const calls = capture(
            'info',
            () => recordPageReady('dashboard'),
        );
        assert.equal(calls.length, 1);
        const call = calls[0]!;
        assert.equal(call[0], 'page ready');
        const fields = fieldsOf(call);
        assert.equal(
            fields.context, 'page-performance',
        );
        assert.equal(fields.page, 'dashboard');
        assert.equal(fields.level, 'info');
        assert.ok(
            typeof fields.readyMs === 'number',
            'readyMs must be a number',
        );
        assert.ok(
            (fields.readyMs as number) > 0,
            'readyMs from timeOrigin must be > 0',
        );
        const phases = fields.phases as
            Record<string, number>;
        assert.ok(
            phases !== null
            && typeof phases === 'object',
        );
        assert.ok(
            typeof phases['boot:db-open']
                === 'number',
            'measured boot phase must appear',
        );
        // Unmeasured boot phases must not be zeros.
        assert.equal(
            phases['boot:page-init'],
            undefined,
        );
        // Node has no navigation entry — omit.
        assert.equal(
            fields.ttfbMs, undefined,
        );
        assert.equal(
            fields.domContentLoadedMs,
            undefined,
        );
    },
);
