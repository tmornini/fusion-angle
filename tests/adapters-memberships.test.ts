import { assertEquals, assertThrows } from '@std/assert';
import {
    validateMembershipEntity,
} from '../api/validators.ts';

Deno.test('validates a membership body', () => {
    assertEquals(
        validateMembershipEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'admin',
            at: '2026-06-04T00:00:00.000000Z',
        }),
        {
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'admin',
            at: '2026-06-04T00:00:00.000000Z',
        },
    );
});

Deno.test('rejects a membership with an extra key', () => {
    assertThrows(() =>
        validateMembershipEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'member',
            at: '2026-06-04T00:00:00.000000Z',
            role: 'admin',
        }));
});

Deno.test('rejects a membership with a bad timestamp', () => {
    assertThrows(() =>
        validateMembershipEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'member',
            at: 'not-a-date',
        }));
});

Deno.test('rejects a membership missing type', () => {
    assertThrows(() =>
        validateMembershipEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            at: '2026-06-04T00:00:00.000000Z',
        }));
});

// Phase Final Stage B: memberships table retired — store
// round-trip pins live on message-plane document tests.
