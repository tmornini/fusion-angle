// Client-side localStorage keys. All share the fusion-ai:
// prefix voice with the localStorage table backend
// (fusion-ai:clients|requests|responses). deleteSchema only
// removes TABLE_NAMES keys, so these UI/session keys survive
// a schema wipe.

// OAuth access + refresh token pair. The access token is
// sent as Authorization: Bearer on authenticated requests.
export const STORAGE_KEY_AUTHORIZATION =
    'fusion-ai:authorization';

// Persisted active organization id (client vessel). Boot
// re-exchanges a fresh org-scoped token from this id.
export const STORAGE_KEY_ACTIVE_ORGANIZATION_ID =
    'fusion-ai:active-organization-id';

export const STORAGE_KEY_THEME = 'fusion-ai:theme';

export const STORAGE_KEY_SIDEBAR =
    'fusion-ai:sidebar-collapsed';

export const STORAGE_KEY_LOG_LEVEL =
    'fusion-ai:log-level';
