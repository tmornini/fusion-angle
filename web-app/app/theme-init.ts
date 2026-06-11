// Pre-bundle initialization that runs before app.js loads.
// Reads persisted theme + sidebar-collapsed preferences from
// localStorage and applies them to the documentElement so the
// page paints in the correct state. Inline-script equivalent
// of FOUC prevention; extracted to a same-origin file so a
// strict Content-Security-Policy (script-src 'self') can
// forbid inline scripts. esbuild bundles the imports below
// into a self-contained IIFE per ./build.

import {
    getStoredTheme,
    getStoredSidebarCollapsed,
} from './adapters/preferences.ts';
import {
    mediaQueryMatches,
} from './adapters/media-query.ts';

(function applyTheme(): void {
    const theme = getStoredTheme();
    const dark = theme === 'dark'
        || (theme === 'system'
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
    if (getStoredSidebarCollapsed()) {
        document.documentElement.classList.add(
            'sidebar-collapsed',
        );
    }
})();
