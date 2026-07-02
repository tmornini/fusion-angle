import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    identityTargetsFor,
    notificationEventFromWire,
} from '../api/notifications.ts';

test('an identities route targets the path identity', () => {
    assert.deepEqual(
        identityTargetsFor(
            'identities/:id/pii', ['ada'], undefined,
        ),
        ['ada'],
    );
});

test('a body identity_id is a target', () => {
    assert.deepEqual(
        identityTargetsFor(
            'memberships/:id', ['m1'],
            { identity_id: 'ada' },
        ),
        ['ada'],
    );
});

test('no identity facet yields no targets', () => {
    assert.deepEqual(
        identityTargetsFor('ideas/:id', ['42'], {}),
        [],
    );
});

test('malformed wire events throw', () => {
    assert.throws(
        () => notificationEventFromWire({ tables: [] }),
        /malformed notification event/,
    );
});

test('scoped wire events round-trip', () => {
    const event = {
        kind: 'scoped',
        organizationIds: ['1'],
        identityIds: [],
    };
    assert.deepEqual(
        notificationEventFromWire(event), event,
    );
});
