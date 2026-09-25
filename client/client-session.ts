import {
    createSessionCredentialStore,
    type SessionCredentials,
} from './session-credentials.ts';
import { createRefreshMutex } from './session-refresh-mutex.ts';
import { createSessionTokenHolder } from './session-token.ts';

// One client's session: its bearer, its credential store,
// and its refresh single-flight. A verb reaches it through
// the context it was handed.
export interface ClientSession {
    putSessionToken(token: string): void;
    deleteSessionToken(): void;
    sessionTokenIsSeeded(): boolean;
    getSessionToken(): string;
    sessionIsOrganizationScoped(): boolean;
    sessionHasReachableOrganization(): boolean;
    sessionIsAuthenticated(): boolean;
    setCookieSession(enabled: boolean): void;
    isCookieSession(): boolean;
    getSessionCredentials(): SessionCredentials | null;
    putSessionCredentials(creds: SessionCredentials): void;
    deleteSessionCredentials(): void;
    runSingleFlightRefresh(
        refresh: () => Promise<string | null>,
    ): Promise<string | null>;
    runRefreshAfterInFlight(
        refresh: () => Promise<string | null>,
    ): Promise<string | null>;
    deleteRefreshChannel(): void;
}

// A fresh session: an empty bearer, a credential store over
// it, and an idle refresh flight with its own peer channel.
export function createClientSession(): ClientSession {
    const tokens = createSessionTokenHolder();
    return {
        ...tokens,
        ...createSessionCredentialStore(tokens),
        ...createRefreshMutex(),
    };
}
