import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateMembershipEntity,
} from '../api/validators.ts';

test('validates a membership body', () => {
    assert.deepEqual(
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

test('rejects a membership with an extra key', () => {
    assert.throws(() =>
        validateMembershipEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'member',
            at: '2026-06-04T00:00:00.000000Z',
            role: 'admin',
        }));
});

test('rejects a membership with a bad timestamp', () => {
    assert.throws(() =>
        validateMembershipEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'member',
            at: 'not-a-date',
        }));
});

test('rejects a membership missing type', () => {
    assert.throws(() =>
        validateMembershipEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            at: '2026-06-04T00:00:00.000000Z',
        }));
});

// Phase Final Stage B: memberships table retired — store
// round-trip pins live on message-plane document tests.
