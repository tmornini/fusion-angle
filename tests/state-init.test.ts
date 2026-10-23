import { assertStrictEquals, assertThrows } from '@std/assert';
import {
    STORAGE_KEY_THEME,
    STORAGE_KEY_SIDEBAR,
} from '../web-app/app/storage-keys.ts';
import {
    initState,
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
// persisted sidebar preference at boot.
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
