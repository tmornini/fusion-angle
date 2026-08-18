// Root-page redirect script. Probes the refresh
// grant, then hops to dashboard (live) or landing
// (unsigned). No schema branch. Extracted from the
// inline body script in web-app/index.html so a
// strict Content-Security-Policy (script-src 'self')
// can forbid inline scripts. esbuild bundles this
// into a self-contained IIFE per ./build.

import { putLocation } from './adapters/location.ts';
import {
    probeRefreshSession,
    resolveApexLocation,
} from './apex-destination.ts';

void (async function redirectRoot(): Promise<void> {
    const dest = await resolveApexLocation(
        probeRefreshSession,
    );
    putLocation(dest);
})();
