import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOKEN_AUDIENCE } from
    '../api/access-token.ts';
import {
    STORAGE_KEY_AUTHORIZATION,
    STORAGE_KEY_ACTIVE_ORGANIZATION_ID,
    STORAGE_KEY_THEME,
    STORAGE_KEY_SIDEBAR,
    STORAGE_KEY_LOG_LEVEL,
} from '../web-app/app/storage-keys.ts';

test('JWT audience is fusion-angle', () => {
    assert.equal(TOKEN_AUDIENCE, 'fusion-angle');
    assert.notEqual(
        TOKEN_AUDIENCE,
        'fusion-angle-web',
    );
});

test('storage keys use the fusion-angle prefix',
() => {
    assert.equal(
        STORAGE_KEY_AUTHORIZATION,
        'fusion-angle:authorization',
    );
    assert.equal(
        STORAGE_KEY_ACTIVE_ORGANIZATION_ID,
        'fusion-angle:active-organization-id',
    );
    assert.equal(
        STORAGE_KEY_THEME,
        'fusion-angle:theme',
    );
    assert.equal(
        STORAGE_KEY_SIDEBAR,
        'fusion-angle:sidebar-collapsed',
    );
    assert.equal(
        STORAGE_KEY_LOG_LEVEL,
        'fusion-angle:log-level',
    );
});
