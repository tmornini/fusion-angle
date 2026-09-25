import { PAGE_REGISTRY } from './page-registry.ts';
import { createHttpFacade } from '../../client/http-facade.ts';
import { createAppClient, putClient } from './client.ts';
import { bootApp } from './app-boot.ts';

// Server-ZIP esbuild entry. Imports pages (via
// PAGE_REGISTRY loaders) and the fetch facade.
// The in-page test facade stays off this graph.
// Cookie-session: access token is memory only;
// refresh lives in the HttpOnly cookie. No anonymous JWT.

function serverOrigin(): string {
    const origin = location.origin;
    return origin === 'null' ? '' : origin;
}

void PAGE_REGISTRY;

document.addEventListener(
    'DOMContentLoaded',
    async () => {
        const client = createAppClient(
            createHttpFacade(serverOrigin()),
        );
        client.setCookieSession(true);
        putClient(client);
        await bootApp();
    },
);
