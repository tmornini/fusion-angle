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
import { generateIdentifier } from
    '../shared/identifier.ts';

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
const ID = generateIdentifier();
const ID2 = generateIdentifier();
const ID3 = generateIdentifier();
const ACTOR = generateIdentifier();
const ORGANIZATION = generateIdentifier();
const GRAPH = { nodes: [], edges: [] };
const GRAPH_DELTA = {
    nodes: [], edges: [], deletions: [],
    memberEvents: [], attributeEvents: [],
};

const DUMMY_BODIES: Readonly<
    Record<string, Record<string, unknown>>
> = {
    'organizations/:id/ideas/:id': {
        title: 'T', position: 1,
        problem_statement: 'p', target_users: 't',
        proposed_solution: 's', expected_outcome: 'o',
        success_metrics: 'm', state: 'active',
    },
    'organizations/:id/ideas/:id/submissions/:sid': {
        idea_id: ID, member_id: ID, at: AT,
    },
    'organizations/:id/projects/:id': {
        title: 'T', description: 'd', progress: 5,
        start_date: '2026-01-01',
        target_end_date: '2026-02-01',
        estimated_cost: 100, actual_cost: 50,
        position: 1, state: 'submitted',
    },
    'organizations/:id/projects/:id/flows/:pfid': {
        project_id: ID, flow_id: ID, at: AT,
    },
    'organizations/:id/flows/:id': {
        name: 'F', is_locked: false,
        is_auto_layout: true, is_auto_fit: true,
        lock_timeout: 1, state: 'active',
        state_at: AT, state_event_id: ID,
        graph: GRAPH, graphDelta: GRAPH_DELTA,
        revivals: [],
    },
    'organizations/:id/work-orders/:id': {
        display_id: 'wo',
        flow_graph: {
            name: 'F', lockTimeout: 1,
            nodes: [], edges: [],
        },
        position: 1,
    },
    'organizations/:id/flows/:id/work-orders/:woid': {
        flow_id: ID, work_order_id: ID, at: AT,
    },
    [RECORD_TYPE_DETAIL_PATTERN]: {
        name: 'R', description: 'd', position: 1,
        state: 'active',
    },
    [ATTRIBUTE_DETAIL_PATTERN]: {
        name: 'A', attribute_type: 'text',
        sort_order: 1, options: [], constraints: [],
    },
    [INSTANCE_DETAIL_PATTERN]: {
        set: [{ attribute_id: ID, value: 'v' }],
    },
    'organizations/:id/flows/:id/records/:frid': {
        flow_id: ID, record_id: ID, at: AT,
    },
    'organizations/:id/flows/:id/tags/:name': {
        flow_response_id: ID,
    },
    'organizations/:id/objectives/:id': {
        position: 1, state: 'active',
    },
    'organizations/:id/objectives/:id/revisions/:rid': {
        objective_id: ID, name: 'N',
        description: 'd', member_id: ID, at: AT,
    },
    'organizations/:id/projects/:id/objective-baseline-scores/:sid': {
        project_id: ID, objective_id: ID,
        score: 0, member_id: ID, at: AT,
    },
    'organizations/:id/projects/:id/objective-actual-scores/:sid': {
        project_id: ID, objective_id: ID,
        score: 0, member_id: ID, at: AT,
    },
    'identities/:id': { kind: 'person' },
    'ai-agents/:id': {
        name: 'A', description: 'd',
        model: 'nqNVXnBkUBLoKlenbyPIZQ',
        skill_focus: 's',
    },
    'identities/:id/pii': {
        name: 'N', email: 'e@x', phone: 'AjdvjuECVZEgZoFajaIEkg',
        bio: 'b',
    },
    'identities/:id/credentials/:cid': {
        identity_id: ID, kind: 'password',
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
    'identities/:id/tokens/:tid': {
        jti: ID, identity_id: ID,
        action: 'issued', chain_id: ID, at: AT,
    },
    'identities/:id/token-revocations/:rid': {
        identity_id: ID, at: AT,
    },
    'organizations/:id': {
        name: 'O', domain: 'd.example',
        next_billing: AT, seats: 1,
        projects_limit: 1, ideas_limit: 1,
    },
    'identities/:id/providers/:eid': {
        identity_id: ID, provider: 'p',
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
                ?? { id: ID };
            const body = spec.successBody(
                [ID, ID2, ID3],
                dummy,
                ACTOR,
                ORGANIZATION,
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
