import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    STORAGE_KEY_THEME,
    STORAGE_KEY_SIDEBAR,
} from '../web-app/app/storage-keys.ts';
import {
    getState,
    initState,
} from '../web-app/app/state.ts';

// The static import above is itself the purity
// assertion: state.ts must not throw on import. It
// touches neither localStorage nor window at module
// load, so the initial state is plain domain defaults.
// initState() hydrates the persisted preferences at
// boot — this test walks both halves of that lifecycle.
test(
    'state starts at defaults, then initState'
    + ' hydrates the persisted preferences',
    () => {
        const before = getState();
        assert.equal(before.theme, 'system');
        assert.equal(before.isMobile, false);
        assert.equal(before.isSidebarCollapsed, false);

        const g =
            globalThis as Record<string, unknown>;
        g.localStorage = {
            getItem: (k: string) => {
                if (k === STORAGE_KEY_THEME) {
                    return 'dark';
                }
                if (k === STORAGE_KEY_SIDEBAR) {
                    return 'true';
                }
                return null;
            },
        };
        g.window = {
            matchMedia: () => ({ matches: true }),
        };
        try {
            initState();
            const after = getState();
            assert.equal(after.theme, 'dark');
            assert.equal(
                after.isSidebarCollapsed, true);
            assert.equal(after.isMobile, true);
        } finally {
            delete g.localStorage;
            delete g.window;
        }
    },
);
