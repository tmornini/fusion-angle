import type { HttpTransport } from './http-facade.ts';
import {
    createClientSession,
    type ClientSession,
} from './client-session.ts';
import {
    createRecoveringRequestContext,
    createRequestContext,
    createSharedRecovery,
    type ClientCore,
    type ClientLog,
    type ClientNavigation,
    type RequestContext,
    type RequestRecorder,
} from './request-context.ts';

export interface ClientDeps {
    readonly facade: HttpTransport;
    readonly navigation: ClientNavigation;
    readonly log: ClientLog;
    readonly recordRequest: RequestRecorder;
}

// One client: a session of its own, the transport bound to
// it, and the contexts that close over both.
export interface Client extends ClientSession {
    sessionContext(): RequestContext;
    requestContext(token: string): RequestContext;
    recoveringRequestContext(token: string): RequestContext;
}

// A failed refresh must go somewhere: a client without its
// navigation is a bug at construction, never a silent no-op.
function assertNavigation(
    navigation: ClientNavigation | undefined,
): ClientNavigation {
    if (
        typeof navigation?.redirectToLogin !== 'function'
        || typeof navigation.navigateToAuth !== 'function'
    ) {
        throw new Error('a client needs its navigation');
    }
    return navigation;
}

export function createClient(deps: ClientDeps): Client {
    const navigation = assertNavigation(deps.navigation);
    const session = createClientSession();
    const core: ClientCore = {
        facade: deps.facade({
            runSingleFlightRefresh: session.runSingleFlightRefresh,
            putSessionToken: session.putSessionToken,
            navigateToAuth: () => navigation.navigateToAuth(),
        }),
        session,
        navigation,
        log: deps.log,
        recordRequest: deps.recordRequest,
        recovery: createSharedRecovery(),
    };
    return {
        ...session,
        sessionContext: () => createRecoveringRequestContext(
            core, session.getSessionToken(),
        ),
        requestContext: (token) =>
            createRequestContext(core, token),
        recoveringRequestContext: (token) =>
            createRecoveringRequestContext(core, token),
    };
}
