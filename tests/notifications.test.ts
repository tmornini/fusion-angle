import { assertEquals, assertThrows } from '@std/assert';
import {
    identityTargetsFor,
    notificationEventFromWire,
    type NotificationEvent,
} from '../api/notifications.ts';

Deno.test('an identities route targets the path identity', () => {
    assertEquals(
        identityTargetsFor(
            'identities/:id/pii', ['ada'], undefined,
        ),
        ['ada'],
    );
});

Deno.test('a body identity_id is a target', () => {
    assertEquals(
        identityTargetsFor(
            'organizations/:id/ideas/:id', ['42'],
            { identity_id: 'ada' },
        ),
        ['ada'],
    );
});

Deno.test('a nested token-revocation targets the path identity',
() => {
    assertEquals(
        identityTargetsFor(
            'identities/:id/token-revocations/:rid',
            ['ada', 't1'],
            { at: '2026-01-01T00:00:00.000000Z' },
        ),
        ['ada'],
    );
});

Deno.test('no identity facet yields no targets', () => {
    assertEquals(
        identityTargetsFor('organizations/:id/ideas/:id', ['42'], {}),
        [],
    );
});

Deno.test('malformed wire events throw', () => {
    assertThrows(
        () => notificationEventFromWire({ tables: [] }),
        Error, 'malformed notification event',
    );
});

Deno.test('scoped wire events round-trip', () => {
    const event: NotificationEvent = {
        kind: 'scoped',
        organizationIds: ['AjdvjuECVZEgZoFajaIEkg'],
        identityIds: [],
    };
    assertEquals(
        notificationEventFromWire(event), event,
    );
});
