import { test } from 'node:test';
import assert from 'node:assert/strict';
import { USAGE, dispatch } from '../server/main.ts';

const SITE = new URL('file:///nowhere/site/');

test('usage names the three verbs', () => {
    assert.match(USAGE, /serve/);
    assert.match(USAGE, /seed/);
    assert.match(USAGE, /wipe/);
});

test('no verb is exit 2', async () => {
    assert.equal(await dispatch(SITE, []), 2);
});

test('an unknown verb is exit 2', async () => {
    assert.equal(await dispatch(SITE, ['migrate']), 2);
});

test('serve rejects any option', async () => {
    await assert.rejects(
        () => dispatch(SITE, ['serve', '--port', '80']),
        /no arguments/i,
    );
});
