import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    buildInboxItems,
} from '../web-app/app/presenters/workbox-inbox.ts';

test('buildInboxItems returns empty Array in active mode', () => {
    const items = buildInboxItems(
        [], [], [], new Map(), 'active',
    );
    assert.equal(Array.isArray(items), true);
    assert.equal(items.length, 0);
});

test('buildInboxItems returns empty Array in archived mode', () => {
    const items = buildInboxItems(
        [], [], [], new Map(), 'archived',
    );
    assert.equal(Array.isArray(items), true);
    assert.equal(items.length, 0);
});
