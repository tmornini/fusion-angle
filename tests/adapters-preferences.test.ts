globalThis.localStorage = (() => {
    const store = new Map<string, string>();
    return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
            store.set(k, v);
        },
        removeItem: (k: string) => {
            store.delete(k);
        },
        clear: () => {
            store.clear();
        },
        key: () => null,
        get length() {
            return store.size;
        },
    };
})();

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    getPreference,
    putPreference,
} from '../web-app/app/adapters/preferences.ts';
import { captureConsole } from './console-capture.ts';

test(
    'getPreference returns null for an unset key',
    () => {
        assert.equal(
            getPreference('never-written-key'),
            null,
        );
    },
);

test(
    'putPreference then getPreference round-trips'
    + ' the value',
    () => {
        putPreference('fusion-angle:demo', 'hello');
        assert.equal(
            getPreference('fusion-angle:demo'),
            'hello',
        );
    },
);

test(
    'putPreference overwrites a prior value for'
    + ' the same key',
    () => {
        putPreference('fusion-angle:color', 'blue');
        putPreference('fusion-angle:color', 'green');
        assert.equal(
            getPreference('fusion-angle:color'),
            'green',
        );
    },
);

test(
    'distinct keys hold independent values',
    () => {
        putPreference('fusion-angle:a', 'one');
        putPreference('fusion-angle:b', 'two');
        assert.equal(getPreference('fusion-angle:a'), 'one');
        assert.equal(getPreference('fusion-angle:b'), 'two');
    },
);

test(
    'putPreference accepts an empty string value',
    () => {
        putPreference('fusion-angle:empty', '');
        assert.equal(
            getPreference('fusion-angle:empty'),
            '',
        );
    },
);

test(
    'putPreference rethrows non-quota storage'
    + ' errors',
    () => {
        const original = globalThis.localStorage;
        try {
            // @ts-expect-error — Node global stub
            globalThis.localStorage = {
                getItem: () => null,
                setItem: () => {
                    throw new Error('disk on fire');
                },
            };
            assert.throws(
                () => putPreference('k', 'v'),
                /disk on fire/,
            );
        } finally {
            globalThis.localStorage = original;
        }
    },
);

test(
    'putPreference returns false on a'
    + ' QuotaExceededError without throwing',
    async () => {
        const original = globalThis.localStorage;
        try {
            // @ts-expect-error — Node global stub
            globalThis.localStorage = {
                getItem: () => null,
                setItem: () => {
                    const err = new DOMException(
                        'over quota',
                        'QuotaExceededError',
                    );
                    throw err;
                },
            };
            const { result, calls } =
                await captureConsole(
                    'warn',
                    () => putPreference('k', 'v'),
                );
            assert.equal(result, false);
            assert.ok(
                calls.some(args => args.includes(
                    'preference write skipped'
                    + ' due to quota',
                )),
                'quota skip must warn, never'
                + ' pass silently',
            );
        } finally {
            globalThis.localStorage = original;
        }
    },
);

test(
    'putPreference returns true on success',
    () => {
        const original = globalThis.localStorage;
        try {
            const writes: Array<[string, string]>
                = [];
            // @ts-expect-error — Node global stub
            globalThis.localStorage = {
                getItem: () => null,
                setItem: (k: string, v: string) => {
                    writes.push([k, v]);
                },
            };
            assert.equal(
                putPreference('k', 'v'),
                true,
            );
            assert.deepEqual(writes, [['k', 'v']]);
        } finally {
            globalThis.localStorage = original;
        }
    },
);
