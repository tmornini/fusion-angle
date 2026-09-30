// Root-page redirect script. Probes the refresh
// grant, then hops to dashboard (live) or landing
// (unsigned). No schema branch. Extracted from the
// inline body script in web-app/index.html so a
// strict Content-Security-Policy (script-src 'self')
// can forbid inline scripts. esbuild bundles this
// into a self-contained IIFE per ./build.

import { putLocation } from './adapters/location.ts';
import { createHttpFacade } from
    '../../client/http-facade.ts';
import { createAppClient, putClient } from './client.ts';
import {
    probeRefreshSession,
    resolveApexLocation,
} from './apex-destination.ts';

function probeOrigin(): string {
    const origin = location.origin;
    return origin === 'null' ? '' : origin;
}

void (async function redirectRoot(): Promise<void> {
    putClient(createAppClient(
        createHttpFacade(probeOrigin(), fetch),
    ));
    const dest = await resolveApexLocation(
        probeRefreshSession,
    );
    putLocation(dest);
})();
