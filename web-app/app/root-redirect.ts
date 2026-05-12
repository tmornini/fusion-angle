// Root-page redirect script. Detects whether the localStorage
// schema exists and routes to either the landing page (data
// present) or the snapshots page (no data — first run or
// post-wipe). Runs synchronously so the user never sees the
// blank root document. Extracted from the inline body script
// in web-app/index.html so a strict Content-Security-Policy
// (script-src 'self') can forbid inline scripts. esbuild
// bundles the import below into a self-contained IIFE per
// ./build.

import {
    STORAGE_KEY_PREFIX,
} from './storage-keys.ts';

(function redirectRoot(): void {
    const hasSchema = Object.keys(localStorage)
        .some(k => k.startsWith(STORAGE_KEY_PREFIX));
    window.location.href = hasSchema
        ? 'landing/index.html'
        : 'snapshots/index.html';
})();
