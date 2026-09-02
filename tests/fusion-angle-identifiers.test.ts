import { assertNotStrictEquals, assertStrictEquals } from '@std/assert';
import { TOKEN_AUDIENCE } from
    '../api/access-token.ts';
import {
    STORAGE_KEY_AUTHORIZATION,
    STORAGE_KEY_ACTIVE_ORGANIZATION_ID,
    STORAGE_KEY_THEME,
    STORAGE_KEY_SIDEBAR,
    STORAGE_KEY_LOG_LEVEL,
    STORAGE_KEY_PENDING_TOAST,
} from '../web-app/app/storage-keys.ts';

Deno.test('JWT audience is fusion-angle', () => {
    assertStrictEquals(TOKEN_AUDIENCE, 'fusion-angle');
    assertNotStrictEquals(
        TOKEN_AUDIENCE,
        'fusion-angle-web',
    );
});

Deno.test('storage keys use the fusion-angle prefix',
() => {
    assertStrictEquals(
        STORAGE_KEY_AUTHORIZATION,
        'fusion-angle:authorization',
    );
    assertStrictEquals(
        STORAGE_KEY_ACTIVE_ORGANIZATION_ID,
        'fusion-angle:active-organization-id',
    );
    assertStrictEquals(
        STORAGE_KEY_THEME,
        'fusion-angle:theme',
    );
    assertStrictEquals(
        STORAGE_KEY_SIDEBAR,
        'fusion-angle:sidebar-collapsed',
    );
    assertStrictEquals(
        STORAGE_KEY_LOG_LEVEL,
        'fusion-angle:log-level',
    );
    assertStrictEquals(
        STORAGE_KEY_PENDING_TOAST,
        'fusion-angle:pending-toast',
    );
});
