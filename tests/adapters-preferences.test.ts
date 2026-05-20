// @ts-expect-error - Node global stub
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
    writePreference,
} from '../web-app/app/adapters/preferences.ts';

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
    'writePreference then getPreference round-trips'
    + ' the value',
    () => {
        writePreference('fusion-ai:demo', 'hello');
        assert.equal(
            getPreference('fusion-ai:demo'),
            'hello',
        );
    },
);

test(
    'writePreference overwrites a prior value for'
    + ' the same key',
    () => {
        writePreference('fusion-ai:color', 'blue');
        writePreference('fusion-ai:color', 'green');
        assert.equal(
            getPreference('fusion-ai:color'),
            'green',
        );
    },
);

test(
    'distinct keys hold independent values',
    () => {
        writePreference('fusion-ai:a', 'one');
        writePreference('fusion-ai:b', 'two');
        assert.equal(getPreference('fusion-ai:a'), 'one');
        assert.equal(getPreference('fusion-ai:b'), 'two');
    },
);

test(
    'writePreference accepts an empty string value',
    () => {
        writePreference('fusion-ai:empty', '');
        assert.equal(
            getPreference('fusion-ai:empty'),
            '',
        );
    },
);

test(
    'writePreference rethrows non-quota storage'
    + ' errors',
    () => {
        const original = globalThis.localStorage;
        try {
            // @ts-expect-error - Node global stub
            globalThis.localStorage = {
                getItem: () => null,
                setItem: () => {
                    throw new Error('disk on fire');
                },
            };
            assert.throws(
                () => writePreference('k', 'v'),
                /disk on fire/,
            );
        } finally {
            globalThis.localStorage = original;
        }
    },
);

test(
    'writePreference returns false on a'
    + ' QuotaExceededError without throwing',
    () => {
        const original = globalThis.localStorage;
        try {
            // @ts-expect-error - Node global stub
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
            assert.equal(
                writePreference('k', 'v'),
                false,
            );
        } finally {
            globalThis.localStorage = original;
        }
    },
);

test(
    'writePreference returns true on success',
    () => {
        const original = globalThis.localStorage;
        try {
            const writes: Array<[string, string]>
                = [];
            // @ts-expect-error - Node global stub
            globalThis.localStorage = {
                getItem: () => null,
                setItem: (k: string, v: string) => {
                    writes.push([k, v]);
                },
            };
            assert.equal(
                writePreference('k', 'v'),
                true,
            );
            assert.deepEqual(writes, [['k', 'v']]);
        } finally {
            globalThis.localStorage = original;
        }
    },
);
