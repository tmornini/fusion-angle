import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    notificationEventFromWire,
} from '../api/notifications.ts';

// The cross-tab wire shape is validated at the adapter —
// a malformed message throws instead of handing subscribers
// a corrupt notification event.

test('a well-formed full event round-trips', () => {
    assert.deepEqual(
        notificationEventFromWire({ kind: 'full' }),
        { kind: 'full' },
    );
});

test('a well-formed scoped event round-trips', () => {
    const event = {
        kind: 'scoped',
        organizationIds: ['AjdvjuECVZEgZoFajaIEkg'],
        identityIds: ['ada'],
    };
    assert.deepEqual(
        notificationEventFromWire(event), event,
    );
});

test('an empty scoped event round-trips', () => {
    const event = {
        kind: 'scoped',
        organizationIds: [],
        identityIds: [],
    };
    assert.deepEqual(
        notificationEventFromWire(event), event,
    );
});

test('an unknown kind throws', () => {
    assert.throws(
        () => notificationEventFromWire({ kind: 'other' }),
        /malformed notification event/,
    );
});

test('a scoped event missing organizationIds throws', () => {
    assert.throws(
        () => notificationEventFromWire({
            kind: 'scoped', identityIds: [],
        }),
        /malformed notification event/,
    );
});

test('non-string array elements throw', () => {
    assert.throws(
        () => notificationEventFromWire({
            kind: 'scoped',
            organizationIds: ['AjdvjuECVZEgZoFajaIEkg', 7],
            identityIds: [],
        }),
        /malformed notification event/,
    );
});

test('a null message throws', () => {
    assert.throws(
        () => notificationEventFromWire(null),
        /malformed notification event/,
    );
});
