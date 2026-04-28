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

// ── Helpers ──────────────────

/** Capture a single console method call. */
function capture(
    method: 'debug' | 'info' | 'warn' | 'error',
    fn: () => void,
): string[] {
    const calls: string[] = [];
    const original = console[method];
    console[method] = (
        ...args: unknown[]
    ) => {
        calls.push(args.join(' '));
    };
    try {
        fn();
    } finally {
        console[method] = original;
    }
    return calls;
}

// ── Tests ────────────────────

test('log.error without .with has no [req:] tag', () => {
    const calls = capture(
        'error',
        () => log.error(
            'something failed',
            'test-ctx',
        ),
    );
    assert.equal(calls.length, 1);
    assert.ok(
        !calls[0]!.includes('[req:'),
        `Expected no [req: tag, got: ${
            calls[0]
        }`,
    );
});

test(
    'log.with truncates requestId to 8 chars',
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
        assert.ok(
            calls[0]!.includes(
                '[req:abcdefgh]',
            ),
            `Expected [req:abcdefgh], got: ${
                calls[0]
            }`,
        );
        // Full id must NOT appear in prefix
        assert.ok(
            !calls[0]!.includes(fullId),
            `Full id leaked: ${calls[0]}`,
        );
    },
);

test(
    'log.with includes req tag in prefix',
    () => {
        const calls = capture(
            'error',
            () => log
                .with('abcdefghijklmnopqrstuv')
                .error('msg', 'mymod'),
        );
        assert.equal(calls.length, 1);
        assert.ok(
            calls[0]!.includes(
                '[fusion-ai:mymod]',
            ),
        );
        assert.ok(
            calls[0]!.includes(
                '[req:abcdefgh]',
            ),
        );
        assert.ok(
            calls[0]!.includes('ERROR'),
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
        assert.ok(
            calls[0]!.includes('[fusion-ai]'),
            `Expected [fusion-ai], got: ${
                calls[0]
            }`,
        );
        assert.ok(
            calls[0]!.includes(
                '[req:abcdefgh]',
            ),
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
