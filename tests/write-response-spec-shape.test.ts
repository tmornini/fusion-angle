import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    WRITE_RESPONSE_SPECS,
    type WriteResponseSpec,
} from '../api/routes.ts';
import {
    ATTRIBUTE_DETAIL_PATTERN,
    INSTANCE_DETAIL_PATTERN,
    RECORD_TYPE_DETAIL_PATTERN,
    ORGANIZATION_MEMBER_DETAIL_PATTERN,
} from '../api/family-registry.ts';

function specsOf(
    entry: (typeof WRITE_RESPONSE_SPECS)[string],
): WriteResponseSpec[] {
    if ('status' in entry) return [entry];
    return [
        entry.put, entry.patch, entry.post,
    ].filter(
        (part): part is NonNullable<typeof part> =>
            part !== undefined,
    );
}

// Per-pattern bodies that satisfy each family's validator
// so the pin can observe the successBody return shape.
const AT = '2026-01-01T00:00:00.000000Z';
const GRAPH = { nodes: [], edges: [] };
const GRAPH_DELTA = {
    nodes: [], edges: [], deletions: [],
    memberEvents: [], attributeEvents: [],
};

const DUMMY_BODIES: Readonly<
    Record<string, Record<string, unknown>>
> = {
    'ideas/:id': {
        title: 'T', position: 1,
        problem_statement: 'p', target_users: 't',
        proposed_solution: 's', expected_outcome: 'o',
        success_metrics: 'm', state: 'active',
        state_at: AT, state_event_id: 'ev-1',
    },
    'ideas/:id/submissions/:sid': {
        idea_id: 'id', member_id: 'id', at: AT,
    },
    'projects/:id': {
        title: 'T', description: 'd', progress: 5,
        start_date: '2026-01-01',
        target_end_date: '2026-02-01',
        estimated_cost: 100, actual_cost: 50,
        position: 1, state: 'submitted',
        state_at: AT, state_event_id: 'ev-1',
    },
    'projects/:id/flows/:pfid': {
        project_id: 'id', flow_id: 'id', at: AT,
    },
    'flows/:id': {
        name: 'F', is_locked: false,
        is_auto_layout: true, is_auto_fit: true,
        lock_timeout: 1, state: 'active',
        state_at: AT, state_event_id: 'ev-1',
        graph: GRAPH, graphDelta: GRAPH_DELTA,
        revivals: [],
    },
    'work-orders/:id': {
        display_id: 'wo',
        flow_graph: {
            name: 'F', lockTimeout: 1,
            nodes: [], edges: [],
        },
        position: 1,
    },
    'flows/:id/work-orders/:woid': {
        flow_id: 'id', work_order_id: 'id', at: AT,
    },
    [RECORD_TYPE_DETAIL_PATTERN]: {
        name: 'R', description: 'd', position: 1,
        state: 'active', state_at: AT,
        state_event_id: 'ev-1',
    },
    [ATTRIBUTE_DETAIL_PATTERN]: {
        name: 'A', attribute_type: 'text',
        sort_order: 1, options: [], constraints: [],
    },
    [INSTANCE_DETAIL_PATTERN]: {
        set: [{ attribute_id: 'a', value: 'v' }],
    },
    'flows/:id/records/:frid': {
        flow_id: 'id', record_id: 'id', at: AT,
    },
    'flows/:id/tags/:name': {
        flow_response_id: 'rid',
    },
    'objectives/:id': {
        position: 1, state: 'active',
        state_at: AT, state_event_id: 'ev-1',
    },
    'objectives/:id/revisions/:rid': {
        objective_id: 'id', name: 'N',
        description: 'd', member_id: 'id', at: AT,
    },
    'projects/:id/objective-baseline-scores/:sid': {
        project_id: 'id', objective_id: 'id',
        score: 0, member_id: 'id', at: AT,
    },
    'projects/:id/objective-actual-scores/:sid': {
        project_id: 'id', objective_id: 'id',
        score: 0, member_id: 'id', at: AT,
    },
    'identities/:id': { kind: 'person' },
    'ai-agents/:id': {
        name: 'A', description: 'd',
        model: 'mnte677fU2G1V2B9vJp9z7',
        skill_focus: 's',
    },
    'identities/:id/pii': {
        name: 'N', email: 'e@x', phone: '1',
        bio: 'b',
    },
    'identities/:id/credentials/:cid': {
        identity_id: 'id', kind: 'password',
        status: 'set', secret: 's', at: AT,
    },
    'identities/:id/registration': {
        grant_types: 'client_credentials',
        redirect_uris: '', jwks: '', aud: 'a',
        status: 'active',
    },
    [ORGANIZATION_MEMBER_DETAIL_PATTERN]: {
        type: 'member', at: AT,
    },
    'identity-tokens/:id': {
        jti: 'j', identity_id: 'id',
        action: 'issued', chain_id: 'c', at: AT,
    },
    'identity-token-revocations/:id': {
        identity_id: 'id', at: AT,
    },
    'organizations/:id': {
        name: 'O', domain: 'd.example',
        next_billing: AT, seats: 1,
        projects_limit: 1, ideas_limit: 1,
    },
    'identity-providers/:id': {
        identity_id: 'id', provider: 'p',
        provider_subject: 's', action: 'linked',
        at: AT,
    },
};

test('leftover roster :id specs are gone', () => {
    for (const pattern of [
        'members/:id',
        'memberships/:id',
        'ai-members/:id',
        'human-members/:id',
    ]) {
        assert.equal(
            WRITE_RESPONSE_SPECS[pattern],
            undefined,
            pattern,
        );
    }
});

test('every write successBody returns an object or is omitted',
() => {
    for (const [pattern, entry] of Object.entries(
        WRITE_RESPONSE_SPECS,
    )) {
        for (const spec of specsOf(entry)) {
            if (spec.successBody === undefined) continue;
            const dummy = DUMMY_BODIES[pattern]
                ?? { id: 'id' };
            const body = spec.successBody(
                ['id', 'id2', 'id3'],
                dummy,
                'actor',
                'organization-1',
            );
            assert.equal(
                typeof body, 'object', pattern,
            );
            assert.equal(
                Array.isArray(body), false, pattern,
            );
            assert.notEqual(body, null, pattern);
        }
    }
});
