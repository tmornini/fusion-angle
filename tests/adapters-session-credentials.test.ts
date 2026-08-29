globalThis.localStorage = (() => {
    const store = new Map<string, string>();
    return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
            store.set(k, v);
        },
        removeItem: (k: string) => {
            store.delete(k);
        },
        clear: () => {
            store.clear();
        },
        key: () => null,
        get length() {
            return store.size;
        },
    };
})();

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    getSessionCredentials,
    putSessionCredentials,
    deleteSessionCredentials,
    SessionCredentialsCorruptError,
    setCookieSession,
} from '../web-app/app/adapters/session-credentials.ts';
import {
    getSessionToken,
    putSessionToken,
} from '../web-app/app/adapters/session-token.ts';
import { STORAGE_KEY_AUTHORIZATION } from
    '../web-app/app/storage-keys.ts';
import { devToken, organizationToken } from './token-fixtures.ts';

const KEY = STORAGE_KEY_AUTHORIZATION;

test('an unset credential reads as null (honest absence)',
() => {
    localStorage.clear();
    assert.equal(getSessionCredentials(), null);
});

test('a stored credential round-trips by value', async () => {
    localStorage.clear();
    const creds = {
        accessToken: await devToken(),
        refreshToken: await organizationToken(),
    };
    putSessionCredentials(creds);
    assert.deepEqual(getSessionCredentials(), creds);
});

test('a non-JSON blob reads as Corrupt, never null', () => {
    localStorage.clear();
    localStorage.setItem(KEY, 'not json at all');
    assert.throws(
        () => getSessionCredentials(),
        SessionCredentialsCorruptError);
});

test('a blob missing a field reads as Corrupt', async () => {
    localStorage.clear();
    localStorage.setItem(
        KEY, JSON.stringify({ access_token: await devToken() }));
    assert.throws(
        () => getSessionCredentials(),
        SessionCredentialsCorruptError);
});

test('a blob with an empty field reads as Corrupt',
async () => {
    localStorage.clear();
    localStorage.setItem(KEY, JSON.stringify({
        access_token: await devToken(),
        refresh_token: '',
    }));
    assert.throws(
        () => getSessionCredentials(),
        SessionCredentialsCorruptError);
});

test('a blob with an undecodable token reads as Corrupt',
async () => {
    localStorage.clear();
    localStorage.setItem(KEY, JSON.stringify({
        access_token: await devToken(),
        refresh_token: 'garbage',
    }));
    assert.throws(
        () => getSessionCredentials(),
        SessionCredentialsCorruptError);
});

test('a deleted credential reads as null again', async () => {
    localStorage.clear();
    putSessionCredentials({
        accessToken: await devToken(),
        refreshToken: await organizationToken(),
    });
    deleteSessionCredentials();
    assert.equal(getSessionCredentials(), null);
});

test('deleting an absent credential is a no-op', () => {
    localStorage.clear();
    deleteSessionCredentials();
    assert.equal(getSessionCredentials(), null);
});

test('a failed credential write propagates, not swallowed',
() => {
    localStorage.clear();
    const original = localStorage.setItem;
    localStorage.setItem = () => {
        throw new Error('disk full');
    };
    assert.throws(
        () => putSessionCredentials({
            accessToken: 'a', refreshToken: 'b',
        }),
        /disk full/);
    localStorage.setItem = original;
});

test('cookie-session stores access in memory, not localStorage',
async () => {
    localStorage.clear();
    setCookieSession(true);
    try {
        const access = await devToken();
        putSessionCredentials({
            accessToken: access,
            refreshToken: await organizationToken(),
        });
        assert.equal(
            localStorage.getItem(KEY), null);
        assert.equal(getSessionCredentials(), null);
        assert.equal(getSessionToken(), access);
        deleteSessionCredentials();
        assert.throws(() => getSessionToken());
    } finally {
        setCookieSession(false);
    }
});

test('cookie-session put does not write refresh_token',
async () => {
    localStorage.clear();
    putSessionToken(await devToken());
    setCookieSession(true);
    try {
        putSessionCredentials({
            accessToken: await organizationToken(),
            refreshToken: await devToken(),
        });
        assert.equal(
            localStorage.getItem(KEY), null);
    } finally {
        setCookieSession(false);
    }
});
