import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    STORAGE_KEY_THEME,
} from '../web-app/app/storage-keys.ts';
import {
    persistThemePreference,
    initListeners,
} from '../web-app/app/state.ts';

type ThemeButton = {
    innerHTML: string;
    setAttribute: (name: string, value: string) => void;
};

function makeButton(): ThemeButton {
    return {
        innerHTML: '',
        setAttribute: () => {},
    };
}

function installThemeDom(
    desktop: ThemeButton,
    mobile: ThemeButton,
): void {
    const g = globalThis as Record<string, unknown>;
    g.localStorage = {
        getItem: () => null,
        setItem: () => {},
    };
    const root = {
        setAttribute: () => {},
        classList: { toggle: () => {} },
    };
    g.document = {
        documentElement: root,
        querySelector: (sel: string) => {
            if (sel === '#theme-toggle') return desktop;
            if (sel === '#mobile-theme-toggle') {
                return mobile;
            }
            return null;
        },
    };
}

test(
    'a cross-tab theme storage event repaints the'
    + ' toggle icon',
    () => {
        const desktop = makeButton();
        const mobile = makeButton();
        installThemeDom(desktop, mobile);
        const storageListeners: Array<
            (e: { key: string; newValue: string }) => void
        > = [];
        const g = globalThis as Record<string, unknown>;
        g.window = {
            addEventListener: (
                type: string,
                handler: (e: {
                    key: string;
                    newValue: string;
                }) => void,
            ) => {
                if (type === 'storage') {
                    storageListeners.push(handler);
                }
            },
            removeEventListener: () => {},
            matchMedia: () => ({
                matches: false,
                addEventListener: () => {},
                removeEventListener: () => {},
            }),
        };
        try {
            initListeners();
            persistThemePreference('light');
            assert.match(desktop.innerHTML, /circle cx="12"/);
            assert.match(mobile.innerHTML, /circle cx="12"/);
            assert.equal(storageListeners.length, 1);
            storageListeners[0]!({
                key: STORAGE_KEY_THEME,
                newValue: 'dark',
            });
            assert.match(
                desktop.innerHTML, /M12 3a6 6 0 0 0 9 9/,
            );
            assert.match(
                mobile.innerHTML, /M12 3a6 6 0 0 0 9 9/,
            );
        } finally {
            delete g.localStorage;
            delete g.document;
            delete g.window;
        }
    },
);
