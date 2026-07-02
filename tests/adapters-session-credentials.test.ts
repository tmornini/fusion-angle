// @ts-expect-error — Node global stub
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
} from '../web-app/app/adapters/session-credentials.ts';
import { devToken, organizationToken } from './token-fixtures.ts';

const KEY = 'fusion.session-credentials';

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
