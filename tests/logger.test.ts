import { test } from 'node:test';
import { strict as assert } from 'node:assert';

// logger.ts → preferences.ts calls
// localStorage, which does not exist in
// Node. Stub it before the first import so
// getConfiguredLevel() returns 'warn'.
// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: (_key: string) => null,
    setItem: () => {},
};

// Import after the stub is in place.
const { log } = await import(
    '../web-app/app/logger.ts'
);

// RFC-3339 zulu with fractional seconds
// (Date.toISOString form).
const TS_RE =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// ── Helpers ──────────────────

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

// ── Tests ────────────────────

test(
    'log.error emits RFC-3339 ts and level',
    () => {
        const calls = capture(
            'error',
            () => log.error(
                'something failed',
                'test-ctx',
            ),
        );
        assert.equal(calls.length, 1);
        const call = calls[0]!;
        assert.equal(
            call[0], 'something failed',
        );
        const fields = fieldsOf(call);
        assert.equal(fields.level, 'error');
        assert.equal(
            fields.context, 'test-ctx',
        );
        assert.ok(
            typeof fields.ts === 'string'
            && TS_RE.test(fields.ts),
            `Expected RFC-3339 ts, got: ${
                String(fields.ts)
            }`,
        );
        assert.equal(
            fields.requestId,
            undefined,
            'unbound log has no requestId',
        );
    },
);

test(
    'log.error without .with has no requestId',
    () => {
        const calls = capture(
            'error',
            () => log.error(
                'something failed',
                'test-ctx',
            ),
        );
        assert.equal(calls.length, 1);
        const fields = fieldsOf(calls[0]!);
        assert.equal(
            fields.requestId, undefined,
        );
        // No prose prefix either.
        assert.equal(
            typeof calls[0]![0], 'string',
        );
        assert.ok(
            !String(calls[0]![0]).includes(
                '[req:',
            ),
        );
    },
);

test(
    'log.with carries full requestId',
    () => {
        const fullId =
            'abcdefghijklmnopqrstuv';
        const calls = capture(
            'error',
            () => log.with(fullId).error(
                'something failed',
                'test-ctx',
            ),
        );
        assert.equal(calls.length, 1);
        const fields = fieldsOf(calls[0]!);
        assert.equal(
            fields.requestId, fullId,
        );
        // Full id must NOT be truncated into
        // a prose [req:] tag.
        assert.ok(
            !String(calls[0]![0]).includes(
                '[req:',
            ),
        );
    },
);

test(
    'log.with includes context and level fields',
    () => {
        const calls = capture(
            'error',
            () => log
                .with('abcdefghijklmnopqrstuv')
                .error('msg', 'mymod'),
        );
        assert.equal(calls.length, 1);
        assert.equal(calls[0]![0], 'msg');
        const fields = fieldsOf(calls[0]!);
        assert.equal(
            fields.context, 'mymod',
        );
        assert.equal(
            fields.requestId,
            'abcdefghijklmnopqrstuv',
        );
        assert.equal(fields.level, 'error');
        assert.ok(
            typeof fields.ts === 'string'
            && TS_RE.test(fields.ts),
        );
    },
);

test(
    'log.with works without context arg',
    () => {
        const calls = capture(
            'error',
            () => log
                .with('abcdefghijklmnopqrstuv')
                .error('msg'),
        );
        assert.equal(calls.length, 1);
        assert.equal(calls[0]![0], 'msg');
        const fields = fieldsOf(calls[0]!);
        assert.equal(
            fields.context, undefined,
        );
        assert.equal(
            fields.requestId,
            'abcdefghijklmnopqrstuv',
        );
    },
);

test(
    'plain object data merges into fields',
    () => {
        const err = new Error('boom');
        const calls = capture(
            'error',
            () => log.error(
                'page failed to init',
                'core',
                { page: 'dashboard' },
                err,
            ),
        );
        assert.equal(calls.length, 1);
        const call = calls[0]!;
        assert.equal(
            call[0], 'page failed to init',
        );
        const fields = fieldsOf(call);
        assert.equal(
            fields.page, 'dashboard',
        );
        assert.equal(fields.context, 'core');
        assert.equal(call[2], err);
    },
);

test(
    'reserved field keys ignore extras',
    () => {
        const calls = capture(
            'error',
            () => log
                .with('abcdefghijklmnopqrstuv')
                .error(
                    'spoof attempt',
                    'real-ctx',
                    {
                        ts: 'not-a-ts',
                        level: 'debug',
                        context: 'spoofed',
                        requestId: 'fake-id',
                        page: 'dashboard',
                    },
                ),
        );
        assert.equal(calls.length, 1);
        const fields = fieldsOf(calls[0]!);
        assert.equal(
            fields.level, 'error',
            'envelope level wins',
        );
        assert.equal(
            fields.context, 'real-ctx',
            'envelope context wins',
        );
        assert.equal(
            fields.requestId,
            'abcdefghijklmnopqrstuv',
            'envelope requestId wins',
        );
        assert.ok(
            typeof fields.ts === 'string'
            && TS_RE.test(fields.ts as string),
            `envelope ts wins, got: ${
                String(fields.ts)
            }`,
        );
        assert.equal(
            fields.page, 'dashboard',
            'non-reserved extras still merge',
        );
    },
);

test(
    'Error data is not merged into fields',
    () => {
        const err = new Error('boom');
        const calls = capture(
            'error',
            () => log.error(
                'uncaught error',
                'core',
                err,
            ),
        );
        assert.equal(calls.length, 1);
        const call = calls[0]!;
        const fields = fieldsOf(call);
        assert.equal(call[2], err);
        // Error properties stay off the record.
        assert.equal(
            fields.message, undefined,
        );
    },
);

test(
    'log.with respects configured level'
    + ' (debug skipped at warn)',
    () => {
        // Default level is 'warn' because
        // localStorage.getItem returns null.
        const calls = capture(
            'debug',
            () => log
                .with('abcdefghijklmnopqrstuv')
                .debug('low-priority'),
        );
        assert.equal(
            calls.length, 0,
            'debug should be suppressed'
            + ' at warn level',
        );
    },
);

test(
    'log.error respects configured level'
    + ' (debug skipped at warn)',
    () => {
        const calls = capture(
            'debug',
            () => log.debug('low-priority'),
        );
        assert.equal(
            calls.length, 0,
            'debug should be suppressed'
            + ' at warn level',
        );
    },
);
