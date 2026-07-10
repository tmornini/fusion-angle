import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateMembershipEntity,
} from '../api/validators.ts';

test('validates a membership body', () => {
    assert.deepEqual(
        validateMembershipEntity({
            organization_id: '1',
            identity_id: 'current',
            at: '2026-06-04T00:00:00.000000Z',
        }),
        {
            organization_id: '1',
            identity_id: 'current',
            at: '2026-06-04T00:00:00.000000Z',
        },
    );
});

test('rejects a membership with an extra key', () => {
    assert.throws(() =>
        validateMembershipEntity({
            organization_id: '1',
            identity_id: 'current',
            at: '2026-06-04T00:00:00.000000Z',
            role: 'admin',
        }));
});

test('rejects a membership with a bad timestamp', () => {
    assert.throws(() =>
        validateMembershipEntity({
            organization_id: '1',
            identity_id: 'current',
            at: 'not-a-date',
        }));
});

// Phase Final Stage B: memberships table retired — store
// round-trip pins live on pair-plane document tests.
