// Node-only product-aware driving on top of cdp-client:
// page URLs, page:ready, and the auth-page sign-in.
// Shared by ./measure and ./test-browser. Excluded from
// the browser tsc like measure.ts.

import { PAGE_REGISTRY } from './page-registry.ts';
import type { PageRun } from './measure-core.ts';
import type { ApiRequestHit } from
    './measure-profile-core.ts';
import {
    type CdpClient,
    clickSelector,
    evaluateJson,
    pageNavigate,
    pollUntil,
    waitForSelector,
} from './cdp-client.ts';

export const LOGIN_TIMEOUT_MS = 60_000;
export const ELEMENT_TIMEOUT_MS = 30_000;

export function registryUrl(
    baseUrl: string,
    key: string,
    query?: string,
): string {
    const entry = PAGE_REGISTRY[key];
    if (entry === undefined) {
        throw new Error(
            `Unknown page registry key: ${key}`,
        );
    }
    let url = `${baseUrl}/${entry.sourceDir}`
        + `/${entry.sourceFile}.html`;
    if (query !== undefined && query.length > 0) {
        url += `?${query}`;
    }
    return url;
}

export type ReadyHarvest = PageRun & {
    apiHits: ApiRequestHit[];
};

export async function harvestReady(
    cdp: CdpClient,
    sessionId?: string,
): Promise<ReadyHarvest | null> {
    return evaluateJson<ReadyHarvest | null>(
        cdp,
        `(() => {
            const measures =
                performance.getEntriesByType(
                    'measure'
                );
            const m = measures.find(
                (e) => e.name === 'page:ready'
            );
            if (!m) return null;
            const phases = {};
            for (const e of measures) {
                if (
                    e.name.startsWith('boot:')
                    || e.name.startsWith('fetch:')
                    || e.name.startsWith('render:')
                ) {
                    phases[e.name] = e.duration;
                }
            }
            const g = globalThis;
            const apiHits =
                typeof g.__fusionApiRequestHits
                    === 'function'
                    ? g.__fusionApiRequestHits()
                    : [];
            return {
                readyMs: m.duration,
                phases,
                apiHits,
            };
        })()`,
        sessionId,
    );
}

export async function waitPageReady(
    cdp: CdpClient,
    pageLabel: string,
    timeoutMs: number,
    sessionId?: string,
): Promise<ReadyHarvest> {
    return pollUntil(
        `page:ready on ${pageLabel}`,
        timeoutMs,
        () => harvestReady(cdp, sessionId),
    );
}

export async function login(
    cdp: CdpClient,
    baseUrl: string,
    email: string,
    password: string,
    sessionId?: string,
): Promise<void> {
    const authUrl = registryUrl(baseUrl, 'auth');
    await pageNavigate(cdp, authUrl, sessionId);
    await waitForSelector(
        cdp,
        '#email',
        'auth #email',
        ELEMENT_TIMEOUT_MS,
        sessionId,
    );
    // page:ready on auth may fire; fill regardless.
    const filled = await evaluateJson<boolean>(
        cdp,
        `(() => {
            const email =
                document.querySelector('#email');
            const password =
                document.querySelector('#password');
            if (!email || !password) return false;
            email.focus();
            email.value = ${JSON.stringify(email)};
            email.dispatchEvent(
                new Event('input', { bubbles: true })
            );
            password.focus();
            password.value =
                ${JSON.stringify(password)};
            password.dispatchEvent(
                new Event('input', { bubbles: true })
            );
            return true;
        })()`,
        sessionId,
    );
    if (!filled) {
        throw new Error(
            'Login failure: #email/#password missing'
            + ' on auth page',
        );
    }
    await clickSelector(cdp, '#submit-btn', sessionId);
    await pollUntil(
        'login navigation away from auth',
        LOGIN_TIMEOUT_MS,
        async () => {
            const href = await evaluateJson<string>(
                cdp,
                'location.href',
                sessionId,
            );
            if (href.includes('/auth/')) {
                // Surface invalid-password text if any.
                const err = await evaluateJson<
                    string | null
                >(
                    cdp,
                    `document.querySelector(
                        '#password-error:not(.hidden)'
                    )?.textContent?.trim() ?? null`,
                    sessionId,
                );
                if (err) {
                    throw new Error(
                        `Login failure: ${err}`,
                    );
                }
                return null;
            }
            return href;
        },
    );
    // Land wherever return target sent us; wait ready
    // so the session is fully established.
    await waitPageReady(
        cdp,
        'post-login page',
        LOGIN_TIMEOUT_MS,
        sessionId,
    );
}
