// Client-side localStorage keys — UI preferences and the
// test session mode's credential slot. All share the
// `fusion-angle:` prefix. No data lives in localStorage.

// OAuth access + refresh token pair. The access token is
// sent as Authorization: Bearer on authenticated requests.
export const STORAGE_KEY_AUTHORIZATION =
    'fusion-angle:authorization';

// Persisted active organization id (client vessel). Boot
// re-exchanges a fresh org-scoped token from this id.
export const STORAGE_KEY_ACTIVE_ORGANIZATION_ID =
    'fusion-angle:active-organization-id';

export const STORAGE_KEY_THEME = 'fusion-angle:theme';

export const STORAGE_KEY_SIDEBAR =
    'fusion-angle:sidebar-collapsed';

export const STORAGE_KEY_LOG_LEVEL =
    'fusion-angle:log-level';
