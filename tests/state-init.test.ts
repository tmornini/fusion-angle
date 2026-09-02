import { assertStrictEquals, assertThrows } from '@std/assert';
import {
    STORAGE_KEY_THEME,
    STORAGE_KEY_SIDEBAR,
} from '../web-app/app/storage-keys.ts';
import {
    initState,
    computeTheme,
} from '../web-app/app/state.ts';
import {
    isStoredTheme,
} from '../web-app/app/adapters/preferences.ts';
import { withLocalStorage } from
    './fixtures/local-storage.ts';

// The static import above is itself the purity assertion:
// state.ts must not throw on import — it touches neither
// localStorage nor window at module load, so the initial
// state is plain domain defaults. initState() hydrates the
// persisted preferences at boot; computeTheme() is the
// observable that proves the theme was hydrated from storage.
Deno.test(
    'initState hydrates the persisted theme preference',
    () => withLocalStorage({
        getItem: (k: string) => {
            if (k === STORAGE_KEY_THEME) {
                return 'dark';
            }
            if (k === STORAGE_KEY_SIDEBAR) {
                return 'true';
            }
            return null;
        },
    }, () => {
        const g =
            globalThis as Record<string, unknown>;
        g.window = {
            matchMedia: () => ({ matches: true }),
        };
        try {
            initState();
            assertStrictEquals(computeTheme(), 'dark');
        } finally {
            delete g.window;
        }
    }),
);

Deno.test('initState throws on a corrupt stored theme', () =>
    withLocalStorage({
        getItem: (k: string) =>
            k === STORAGE_KEY_THEME ? 'purple' : null,
    }, () => {
        const g =
            globalThis as Record<string, unknown>;
        g.window = {
            matchMedia: () => ({ matches: false }),
        };
        try {
            assertThrows(
                () => initState(),
                Error, 'corrupt stored theme',
            );
        } finally {
            delete g.window;
        }
    }));

Deno.test('initState throws on a corrupt stored sidebar', () =>
    withLocalStorage({
        getItem: (k: string) =>
            k === STORAGE_KEY_THEME ? 'dark'
                : k === STORAGE_KEY_SIDEBAR ? 'maybe'
                    : null,
    }, () => {
        const g =
            globalThis as Record<string, unknown>;
        g.window = {
            matchMedia: () => ({ matches: false }),
        };
        try {
            assertThrows(
                () => initState(),
                Error, 'corrupt stored sidebar',
            );
        } finally {
            delete g.window;
        }
    }));

Deno.test('isStoredTheme accepts the three themes only', () => {
    assertStrictEquals(isStoredTheme('light'), true);
    assertStrictEquals(isStoredTheme('dark'), true);
    assertStrictEquals(isStoredTheme('system'), true);
    assertStrictEquals(isStoredTheme('purple'), false);
    assertStrictEquals(isStoredTheme(null), false);
});
