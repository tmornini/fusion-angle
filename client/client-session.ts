import {
    deleteSessionToken,
    getSessionToken,
    putSessionToken,
    sessionHasReachableOrganization,
    sessionIsAuthenticated,
    sessionIsOrganizationScoped,
    sessionTokenIsSeeded,
} from './session-token.ts';
import {
    deleteSessionCredentials,
    getSessionCredentials,
    isCookieSession,
    putSessionCredentials,
    setCookieSession,
    type SessionCredentials,
} from './session-credentials.ts';
import {
    deleteRefreshChannel,
    runRefreshAfterInFlight,
    runSingleFlightRefresh,
} from './session-refresh-mutex.ts';

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

// The session every context shares while it lives in
// module state.
export const MODULE_SESSION: ClientSession = {
    putSessionToken,
    deleteSessionToken,
    sessionTokenIsSeeded,
    getSessionToken,
    sessionIsOrganizationScoped,
    sessionHasReachableOrganization,
    sessionIsAuthenticated,
    setCookieSession,
    isCookieSession,
    getSessionCredentials,
    putSessionCredentials,
    deleteSessionCredentials,
    runSingleFlightRefresh,
    runRefreshAfterInFlight,
    deleteRefreshChannel,
};
