import {
    assert,
    assertEquals,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import {
    withLocalStorage,
    withLocalStorageAsync,
} from './fixtures/local-storage.ts';
import {
    getPreference,
    putPreference,
} from '../web-app/app/adapters/preferences.ts';
import { captureConsole } from './fixtures/console-capture.ts';

// A fresh Map-backed fake per test.
function freshStorage(): Partial<Storage> {
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
}

Deno.test(
    'getPreference returns null for an unset key',
    () => withLocalStorage(freshStorage(), () => {
        assertStrictEquals(
            getPreference('never-written-key'),
            null,
        );
    }),
);

Deno.test(
    'putPreference then getPreference round-trips'
    + ' the value',
    () => withLocalStorage(freshStorage(), () => {
        putPreference('fusion-angle:demo', 'hello');
        assertStrictEquals(
            getPreference('fusion-angle:demo'),
            'hello',
        );
    }),
);

Deno.test(
    'putPreference overwrites a prior value for'
    + ' the same key',
    () => withLocalStorage(freshStorage(), () => {
        putPreference('fusion-angle:color', 'blue');
        putPreference('fusion-angle:color', 'green');
        assertStrictEquals(
            getPreference('fusion-angle:color'),
            'green',
        );
    }),
);

Deno.test(
    'distinct keys hold independent values',
    () => withLocalStorage(freshStorage(), () => {
        putPreference('fusion-angle:a', 'one');
        putPreference('fusion-angle:b', 'two');
        assertStrictEquals(getPreference('fusion-angle:a'), 'one');
        assertStrictEquals(getPreference('fusion-angle:b'), 'two');
    }),
);

Deno.test(
    'putPreference accepts an empty string value',
    () => withLocalStorage(freshStorage(), () => {
        putPreference('fusion-angle:empty', '');
        assertStrictEquals(
            getPreference('fusion-angle:empty'),
            '',
        );
    }),
);

Deno.test(
    'putPreference rethrows non-quota storage'
    + ' errors',
    () => withLocalStorage({
        getItem: () => null,
        setItem: () => {
            throw new Error('disk on fire');
        },
    }, () => {
        assertThrows(
            () => putPreference('k', 'v'),
            Error,
            'disk on fire',
        );
    }),
);

Deno.test(
    'putPreference returns false on a'
    + ' QuotaExceededError without throwing',
    () => withLocalStorageAsync({
        getItem: () => null,
        setItem: () => {
            const err = new DOMException(
                'over quota',
                'QuotaExceededError',
            );
            throw err;
        },
    }, async () => {
        const { result, calls } =
            await captureConsole(
                'warn',
                () => putPreference('k', 'v'),
            );
        assertStrictEquals(result, false);
        assert(
            calls.some(args => args.includes(
                'preference write skipped'
                + ' due to quota',
            )),
            'quota skip must warn, never'
            + ' pass silently',
        );
    }),
);

Deno.test(
    'putPreference returns true on success',
    () => {
        const writes: Array<[string, string]> = [];
        return withLocalStorage({
            getItem: () => null,
            setItem: (k: string, v: string) => {
                writes.push([k, v]);
            },
        }, () => {
            assertStrictEquals(
                putPreference('k', 'v'),
                true,
            );
            assertEquals(writes, [['k', 'v']]);
        });
    },
);
