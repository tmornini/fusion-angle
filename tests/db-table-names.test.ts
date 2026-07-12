import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { TABLE_NAMES } from '../api/db.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';

// Phase Final Stage B Task 4: TABLE_NAMES shrinks as doomed
// tables delete. Pin permanent survivors and tables this
// commit just dropped.
test('TABLE_NAMES keeps the permanent survivors', () => {
    for (const name of [
        'requests', 'responses',
    ] as const) {
        assert.ok(
            TABLE_NAMES.includes(name),
            `TABLE_NAMES missing survivor ${name}`,
        );
    }
});

test(
    'TABLE_NAMES drops clients and ideas..objectives'
    + ' and roster',
    () => {
        for (const name of [
            'clients',
            'ideas',
            'idea_submissions',
            'projects',
            'project_flows',
            'project_objective_baseline_scores',
            'project_objective_actual_scores',
            'flows',
            'flow_versions',
            'flow_nodes',
            'flow_edges',
            'flow_node_members',
            'flow_node_attributes',
            'work_orders',
            'flow_work_orders',
            'state_field_values',
            'records',
            'record_attributes',
            'flow_records',
            'objectives',
            'objective_revisions',
            'members',
            'human_members',
            'ai_members',
            'memberships',
            'invitations',
            'identities',
            'identity_pii',
            'identity_credentials',
            'identity_token_revocations',
            'identity_default_organizations',
            'role_grants',
            'identity_providers',
            'organizations',
            'states',
        ] as const) {
            assert.ok(
                !TABLE_NAMES.includes(name),
                `${name} still in TABLE_NAMES`,
            );
        }
    },
);

test('MemoryDbAdapter exposes message stores', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await db.requests.put('pair-1', {
        uri_prefix: '/organizations/1/ideas/',
        uri_id: '42',
        at: '2026-01-01T00:00:00.000000Z',
        requester_identity_id: 'current',
        message_hash: 'a'.repeat(64),
        message: '{"kind":"request"}',
    });
    const rows = await db.requests.getAll();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, 'pair-1');
});
