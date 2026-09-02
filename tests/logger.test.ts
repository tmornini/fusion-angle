import { assert, assertStrictEquals } from '@std/assert';
import { log } from '../web-app/app/logger.ts';
import { withLocalStorage } from
    './fixtures/local-storage.ts';

// logger.ts -> preferences.ts calls localStorage.getItem
// lazily, once per log.* call (getConfiguredLevel is not
// memoized) — so each test below installs the fake for
// its own call rather than at import time. A null getItem
// makes getConfiguredLevel() return 'warn'.
const NULL_STORAGE: Partial<Storage> = {
    getItem: (_key: string) => null,
    setItem: () => {},
};

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

// ── Tests ────────────────────

Deno.test(
    'log.error emits RFC-3339 ts and level',
    () => withLocalStorage(NULL_STORAGE, () => {
        const calls = capture(
            'error',
            () => log.error(
                'something failed',
                'test-ctx',
            ),
        );
        assertStrictEquals(calls.length, 1);
        const call = calls[0]!;
        assertStrictEquals(
            call[0], 'something failed',
        );
        const fields = fieldsOf(call);
        assertStrictEquals(fields.level, 'error');
        assertStrictEquals(
            fields.context, 'test-ctx',
        );
        assert(
            typeof fields.ts === 'string'
            && TS_RE.test(fields.ts),
            `Expected RFC-3339 ts, got: ${
                String(fields.ts)
            }`,
        );
        assertStrictEquals(
            fields.requestId,
            undefined,
            'unbound log has no requestId',
        );
    }),
);

Deno.test(
    'log.error without .with has no requestId',
    () => withLocalStorage(NULL_STORAGE, () => {
        const calls = capture(
            'error',
            () => log.error(
                'something failed',
                'test-ctx',
            ),
        );
        assertStrictEquals(calls.length, 1);
        const fields = fieldsOf(calls[0]!);
        assertStrictEquals(
            fields.requestId, undefined,
        );
        // No prose prefix either.
        assertStrictEquals(
            typeof calls[0]![0], 'string',
        );
        assert(
            !String(calls[0]![0]).includes(
                '[req:',
            ),
        );
    }),
);

Deno.test(
    'log.with carries full requestId',
    () => withLocalStorage(NULL_STORAGE, () => {
        const fullId =
            'abcdefghijklmnopqrstug';
        const calls = capture(
            'error',
            () => log.with(fullId).error(
                'something failed',
                'test-ctx',
            ),
        );
        assertStrictEquals(calls.length, 1);
        const fields = fieldsOf(calls[0]!);
        assertStrictEquals(
            fields.requestId, fullId,
        );
        // Full id must NOT be truncated into
        // a prose [req:] tag.
        assert(
            !String(calls[0]![0]).includes(
                '[req:',
            ),
        );
    }),
);

Deno.test(
    'log.with includes context and level fields',
    () => withLocalStorage(NULL_STORAGE, () => {
        const calls = capture(
            'error',
            () => log
                .with('abcdefghijklmnopqrstug')
                .error('msg', 'mymod'),
        );
        assertStrictEquals(calls.length, 1);
        assertStrictEquals(calls[0]![0], 'msg');
        const fields = fieldsOf(calls[0]!);
        assertStrictEquals(
            fields.context, 'mymod',
        );
        assertStrictEquals(
            fields.requestId,
            'abcdefghijklmnopqrstug',
        );
        assertStrictEquals(fields.level, 'error');
        assert(
            typeof fields.ts === 'string'
            && TS_RE.test(fields.ts),
        );
    }),
);

Deno.test(
    'log.with works without context arg',
    () => withLocalStorage(NULL_STORAGE, () => {
        const calls = capture(
            'error',
            () => log
                .with('abcdefghijklmnopqrstug')
                .error('msg'),
        );
        assertStrictEquals(calls.length, 1);
        assertStrictEquals(calls[0]![0], 'msg');
        const fields = fieldsOf(calls[0]!);
        assertStrictEquals(
            fields.context, undefined,
        );
        assertStrictEquals(
            fields.requestId,
            'abcdefghijklmnopqrstug',
        );
    }),
);

Deno.test(
    'plain object data merges into fields',
    () => withLocalStorage(NULL_STORAGE, () => {
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
        assertStrictEquals(calls.length, 1);
        const call = calls[0]!;
        assertStrictEquals(
            call[0], 'page failed to init',
        );
        const fields = fieldsOf(call);
        assertStrictEquals(
            fields.page, 'dashboard',
        );
        assertStrictEquals(fields.context, 'core');
        assertStrictEquals(call[2], err);
    }),
);

Deno.test(
    'reserved field keys ignore extras',
    () => withLocalStorage(NULL_STORAGE, () => {
        const calls = capture(
            'error',
            () => log
                .with('abcdefghijklmnopqrstug')
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
        assertStrictEquals(calls.length, 1);
        const fields = fieldsOf(calls[0]!);
        assertStrictEquals(
            fields.level, 'error',
            'envelope level wins',
        );
        assertStrictEquals(
            fields.context, 'real-ctx',
            'envelope context wins',
        );
        assertStrictEquals(
            fields.requestId,
            'abcdefghijklmnopqrstug',
            'envelope requestId wins',
        );
        assert(
            typeof fields.ts === 'string'
            && TS_RE.test(fields.ts as string),
            `envelope ts wins, got: ${
                String(fields.ts)
            }`,
        );
        assertStrictEquals(
            fields.page, 'dashboard',
            'non-reserved extras still merge',
        );
    }),
);

Deno.test(
    'Error data is not merged into fields',
    () => withLocalStorage(NULL_STORAGE, () => {
        const err = new Error('boom');
        const calls = capture(
            'error',
            () => log.error(
                'uncaught error',
                'core',
                err,
            ),
        );
        assertStrictEquals(calls.length, 1);
        const call = calls[0]!;
        const fields = fieldsOf(call);
        assertStrictEquals(call[2], err);
        // Error properties stay off the record.
        assertStrictEquals(
            fields.message, undefined,
        );
    }),
);

Deno.test(
    'log.with respects configured level'
    + ' (debug skipped at warn)',
    () => withLocalStorage(NULL_STORAGE, () => {
        // Default level is 'warn' because
        // localStorage.getItem returns null.
        const calls = capture(
            'debug',
            () => log
                .with('abcdefghijklmnopqrstug')
                .debug('low-priority'),
        );
        assertStrictEquals(
            calls.length, 0,
            'debug should be suppressed'
            + ' at warn level',
        );
    }),
);

Deno.test(
    'log.error respects configured level'
    + ' (debug skipped at warn)',
    () => withLocalStorage(NULL_STORAGE, () => {
        const calls = capture(
            'debug',
            () => log.debug('low-priority'),
        );
        assertStrictEquals(
            calls.length, 0,
            'debug should be suppressed'
            + ' at warn level',
        );
    }),
);
