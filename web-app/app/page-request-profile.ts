// Browser-only API request hit log for ./measure --profile.
// Records every RequestContext verb (method + resource).
// Node tests never record (no document). Global harvest
// for CDP: globalThis.__fusionApiRequestHits().

export type ApiRequestHit = {
    method: string;
    resource: string;
};

const hits: ApiRequestHit[] = [];

function isBrowserDocument(): boolean {
    return typeof globalThis.document
        !== 'undefined';
}

/**
 * Append one verb when running under a document.
 * No-op in Node (adapter unit tests).
 */
export function recordApiRequest(
    method: string,
    resource: string,
): void {
    if (!isBrowserDocument()) {
        return;
    }
    hits.push({ method, resource });
}

/** Snapshot of hits since navigation (module re-init). */
export function snapshotApiRequests(
): readonly ApiRequestHit[] {
    return hits.slice();
}

// CDP harvest surface — installed only in the browser.
if (isBrowserDocument()) {
    (
        globalThis as unknown as {
            __fusionApiRequestHits:
                () => ApiRequestHit[];
        }
    ).__fusionApiRequestHits = () => hits.slice();
}
