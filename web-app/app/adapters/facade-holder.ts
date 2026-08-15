import type { HttpFacade } from './http-facade.ts';

// The live client transport. Browser boot wraps the
// in-page adapter; server boot installs the fetch facade.
// sessionContext() reads this — never IndexedDB, never
// api/api.ts — so the server-ZIP graph stays clean.

let facade: HttpFacade | undefined;

export function putClientFacade(next: HttpFacade): void {
    facade = next;
}

export function getClientFacade(): HttpFacade {
    if (facade === undefined) {
        throw new Error(
            'client facade uninitialized',
        );
    }
    return facade;
}

type InPageWrap = (adapter: object) => HttpFacade;

let inPageWrap: InPageWrap | undefined;

export function registerInPageWrap(
    wrap: InPageWrap,
): void {
    inPageWrap = wrap;
}

function isHttpFacade(
    adapter: object,
): adapter is HttpFacade {
    return typeof (adapter as HttpFacade).GET
        === 'function'
        && typeof (adapter as {
            simulateLatency?: unknown;
        }).simulateLatency !== 'function';
}

// HttpFacade passes through. An in-page adapter
// (simulateLatency) needs the wrap registered by
// in-page-facade.ts — browser init and the test
// fixtures import that module; the server entry
// never does.
export function wrapClientAdapter(
    adapter: object,
): HttpFacade {
    if (isHttpFacade(adapter)) {
        return adapter;
    }
    if (inPageWrap === undefined) {
        throw new Error(
            'in-page facade wrap not registered',
        );
    }
    return inPageWrap(adapter);
}
