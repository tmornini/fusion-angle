// Pre-bundle initialization that runs before app.js loads.
// Reads the persisted sidebar-collapsed preference from
// localStorage and applies it to the documentElement so the
// page paints in the correct state. Inline-script equivalent
// of FOUC prevention; extracted to a same-origin file so a
// strict Content-Security-Policy (script-src 'self') can
// forbid inline scripts. `deno bundle` folds the imports
// below into a self-contained IIFE at build time.

import { getStoredSidebarCollapsed } from './adapters/preferences.ts';

(function applySidebarCollapsed(): void {
    if (getStoredSidebarCollapsed()) {
        document.documentElement.classList.add(
            'sidebar-collapsed',
        );
    }
})();
