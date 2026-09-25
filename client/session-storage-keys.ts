// OAuth access + refresh token pair. The access token is
// sent as Authorization: Bearer on authenticated requests.
export const STORAGE_KEY_AUTHORIZATION =
    'fusion-angle:authorization';

// Persisted active organization id (client vessel). Boot
// re-exchanges a fresh org-scoped token from this id.
export const STORAGE_KEY_ACTIVE_ORGANIZATION_ID =
    'fusion-angle:active-organization-id';
