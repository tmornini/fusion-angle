// Pre-bundle initialization that runs before app.js loads.
// Reads persisted theme + sidebar-collapsed preferences from
// localStorage and applies them to the documentElement so the
// page paints in the correct state. Inline-script equivalent
// of FOUC prevention; extracted to a same-origin file so a
// strict Content-Security-Policy (script-src 'self') can
// forbid inline scripts. esbuild bundles the imports below
// into a self-contained IIFE per ./build.

import {
    STORAGE_KEY_THEME,
    STORAGE_KEY_SIDEBAR,
} from './storage-keys.ts';
import {
    mediaQueryMatches,
} from './adapters/media-query.ts';

(function applyTheme(): void {
    const stored = localStorage.getItem(
        STORAGE_KEY_THEME,
    );
    const dark = stored === 'dark'
        || (stored !== 'light'
            && mediaQueryMatches(
                '(prefers-color-scheme: dark)',
            ));
    if (dark) {
        const root = document.documentElement;
        root.setAttribute('data-theme', 'dark');
        root.classList.add('dark');
    }
})();

(function applySidebarCollapsed(): void {
    const stored = localStorage.getItem(
        STORAGE_KEY_SIDEBAR,
    );
    if (stored === 'true') {
        document.documentElement.classList.add(
            'sidebar-collapsed',
        );
    }
})();
