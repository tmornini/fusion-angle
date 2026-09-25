import {
    createClient,
    putBellSession,
    type Client,
    type HttpTransport,
    type RequestContext,
} from '../../client/index.ts';
import { redirectToLogin } from './auth-redirect.ts';
import { navigateTo } from './navigation.ts';
import { log } from './logger.ts';
import { recordApiRequest } from './page-request-profile.ts';

// The tab's one client, put by the composition root before
// any page reads it.
let client: Client | undefined;

// The app's hands: its login redirect, its auth page, its
// logger, and the page-profile recorder.
export function createAppClient(
    facade: HttpTransport,
): Client {
    return createClient({
        facade,
        navigation: {
            redirectToLogin,
            navigateToAuth: () => navigateTo('auth'),
        },
        log,
        recordRequest: recordApiRequest,
    });
}

export function putClient(next: Client): void {
    client = next;
    putBellSession(next);
}

export function getClient(): Client {
    if (client === undefined) {
        throw new Error('client uninitialized');
    }
    return client;
}

export function sessionContext(): RequestContext {
    return getClient().sessionContext();
}
