// Root-page redirect script. Reads the boot-declared
// schema-presence marker and routes to either the login
// page (data present) or the snapshots page (no data —
// first run or post-wipe). Runs synchronously so the user
// never sees the blank root document. Extracted from the
// inline body script in web-app/index.html so a strict
// Content-Security-Policy (script-src 'self') can forbid
// inline scripts. esbuild bundles the imports below into a
// self-contained IIFE per ./build.

import {
    getSchemaPresent,
} from './adapters/schema-marker.ts';
import {
    putLocation,
} from './adapters/location.ts';

(function redirectRoot(): void {
    putLocation(getSchemaPresent()
        ? 'auth/index.html'
        : 'snapshots/index.html');
})();
