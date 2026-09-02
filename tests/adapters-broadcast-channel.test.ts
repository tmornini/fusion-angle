import { assertEquals, assertThrows } from '@std/assert';
import {
    notificationEventFromWire,
    type NotificationEvent,
} from '../api/notifications.ts';

// The cross-tab wire shape is validated at the adapter —
// a malformed message throws instead of handing subscribers
// a corrupt notification event.

Deno.test('a well-formed full event round-trips', () => {
    assertEquals(
        notificationEventFromWire({ kind: 'full' }),
        { kind: 'full' },
    );
});

Deno.test('a well-formed scoped event round-trips', () => {
    const event: NotificationEvent = {
        kind: 'scoped',
        organizationIds: ['AjdvjuECVZEgZoFajaIEkg'],
        identityIds: ['ada'],
    };
    assertEquals(
        notificationEventFromWire(event), event,
    );
});

Deno.test('an empty scoped event round-trips', () => {
    const event: NotificationEvent = {
        kind: 'scoped',
        organizationIds: [],
        identityIds: [],
    };
    assertEquals(
        notificationEventFromWire(event), event,
    );
});

Deno.test('an unknown kind throws', () => {
    assertThrows(
        () => notificationEventFromWire({ kind: 'other' }),
        Error,
        'malformed notification event',
    );
});

Deno.test('a scoped event missing organizationIds throws', () => {
    assertThrows(
        () => notificationEventFromWire({
            kind: 'scoped', identityIds: [],
        }),
        Error,
        'malformed notification event',
    );
});

Deno.test('non-string array elements throw', () => {
    assertThrows(
        () => notificationEventFromWire({
            kind: 'scoped',
            organizationIds: ['AjdvjuECVZEgZoFajaIEkg', 7],
            identityIds: [],
        }),
        Error,
        'malformed notification event',
    );
});

Deno.test('a null message throws', () => {
    assertThrows(
        () => notificationEventFromWire(null),
        Error,
        'malformed notification event',
    );
});
