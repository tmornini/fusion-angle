// Root-page redirect script. Always opens auth.
// No schema branch. No cookie probe. Runs
// synchronously so the user never sees the blank
// root document. Extracted from the inline body
// script in web-app/index.html so a strict
// Content-Security-Policy (script-src 'self') can
// forbid inline scripts. esbuild bundles this into
// a self-contained IIFE per ./build.

import {
    putLocation,
} from './adapters/location.ts';

(function redirectRoot(): void {
    putLocation('auth/index.html');
})();
