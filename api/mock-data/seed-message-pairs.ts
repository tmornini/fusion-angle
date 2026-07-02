// Pre-tx pair formation for both seed paths (postMockDataLoad,
// postBootstrap in ../mock-data.ts). formWritePair's hashing is
// async crypto and cannot run inside the seed's one big
// TABLE_NAMES transaction — an awaited non-IDB promise
// auto-commits an IndexedDB transaction early (CLAUDE.md § the
// IndexedDB auto-commit constraint). So the seed becomes two
// passes: every op-invocation's pair is formed HERE, before any
// transaction opens (pass 1); the seed's existing single
// transaction then executes row ops only, passing each op its
// pre-formed pair (pass 2).
//
// Every body-builder below is the ONE construction its family
// uses for BOTH forming the pair (this file) and performing the
// actual write (mock-data.ts) — never two independently written
// literals that merely happen to agree, so a stored pair can
// never drift from what was actually written.
//
// Only the six seed op-invocations that already accept a `pair?`
// parameter are covered here (traced against every
// postXxxCreationOp / postRecordWriteOp call site in
// mock-data.ts): human-members, ideas, flows, ai-members,
// records, objectives. Memberships, project_objective_baseline_
// scores, and work-order historical traces are direct writes the
// seed never routes through a pair-capable op — the three named
// deferrals stay untouched.

import type {
    Id,
    StateEntity,
    AIMemberEntity,
    IdeaEntity,
    RecordEntity,
    RecordAttributeEntity,
    ProjectFlowEntity,
} from '../types.ts';
import {
    jsonArrayField,
    jsonObjectField,
    nowUtc,
    SYSTEM_MEMBER_ID,
} from '../types.ts';
import {
    formWritePair,
} from '../message-pair.ts';
import type { MessagePair } from '../message-pair.ts';
import {
    MOCK_SEED_TIMESTAMP,
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
    assignOrganization,
} from './seed-constants.ts';
import { daysFromNow } from './seed-kit.ts';
import { buildMembers } from './members.ts';
import type { SeedHumanMember } from './members.ts';
import { buildIdeas } from './ideas.ts';
import { buildFlows, buildFlowGraphRelations } from './flows.ts';
import type { FlowSeed, FlowGraphRelations } from './flows.ts';
import { buildAiMembers } from './ai-members.ts';
import {
    buildRecords,
    buildRecordAttributes,
    customerProfileRecordId,
    projectBriefRecordId,
} from './records.ts';
import { OBJECTIVE_SEEDS } from './objectives.ts';
import {
    l2cFlowId,
    l2cProjectFlowId,
} from './lead-to-close-flow.ts';
import { l2cProjectId } from './projects.ts';

// ---- hoisted static seed-event data ----
//
// Moved verbatim out of postMockDataLoadIn (mock-data.ts) so
// this file's pass-1 invocation list and that file's pass-2
// writes share ONE declaration apiece — pure literals, so the
// move changes nothing about when or how they're computed.

// Shared with mock-data.ts's own direct writes that fall on
// this same moment (mockFlowRecords) — exported so there is
// exactly one `daysFromNow(-60, 9, 0)` call, not two.
export const wfTimestamp = daysFromNow(-60, 9, 0);

// One state event per seeded idea — the creation moment of
// each idea on the states log, doubling as postIdeaCreationOp's
// initial-state input.
export const ideaStateEvents: StateEntity[] = [
    {
        id: 'qJoFXyzUUaq0vEpHL5e34l',
        entity_id: 'eT5xdKjzLDmuRn3r7XMX4R',
        state: 'in_review',
        member_id: 'LhfaUUf4IumVsCSGB4xjdK',
        at: daysFromNow(-75, 9, 30),
    },
    {
        id: 'tIcL6f8KJoyG2YN9NofOMo',
        entity_id: 'cbTuSs0Ex84PeFGSvoAEFZ',
        state: 'approved',
        member_id: 'bLP3X1hb1mSz8gY9neogU3',
        at: daysFromNow(-70, 9, 0),
    },
    {
        id: 'mGfBLqA7lScpEKxc5w0Yt2',
        entity_id: 'wuCMQqo4IkEksx7MYmu8g2',
        state: 'active',
        member_id: '53J8h9dr76XFqCjYcNVwIR',
        at: daysFromNow(-65, 9, 0),
    },
    {
        id: 'BvBRvDQ8b5l5Tg7iZSGyHF',
        entity_id: 'ojOEXtdzdtTZtpM81TxVca',
        state: 'in_review',
        member_id: 'jBoWiyWxj7pp4sG3JgX5l2',
        at: daysFromNow(-55, 9, 0),
    },
    {
        id: 'BMS9TmTKR0DZ41vTUSpvxX',
        entity_id: 'T2vAafLDcshDONlYxpzPLc',
        state: 'active',
        member_id: 'Trf1Up2jMsPhEnjbW4Ji1n',
        at: daysFromNow(-50, 9, 0),
    },
    {
        id: 'XX2EXrIUcQVTnzGo0YO2Iw',
        entity_id: 'HRYrImq1rBJ5ZRe1T9TAVk',
        state: 'sent_back',
        member_id: 'zyTbfbjcGEfbpCsNTP0XjX',
        at: daysFromNow(-45, 9, 0),
    },
    {
        id: 'fxlbcnsAmCWp4j8B2NkDKM',
        entity_id: 'MCxK0hzT9CPjJx1ZV5unfr',
        state: 'in_review',
        member_id: 'LhfaUUf4IumVsCSGB4xjdK',
        at: daysFromNow(-75, 10, 0),
    },
    {
        id: 'JjkkkkrZw4FvOWBpJYE2J7',
        entity_id: 'SUb4gKXsZ1OsEauzqszg0t',
        state: 'in_review',
        member_id: 'WxQn4LVWb76YkmqK5B0EPp',
        at: daysFromNow(-35, 9, 0),
    },
    {
        id: '4nzdNB97hgD1GZ7CjA2EwS',
        entity_id: 'gxa84W9KvEgD0wT1F4TOM9',
        state: 'in_review',
        member_id: '53J8h9dr76XFqCjYcNVwIR',
        at: daysFromNow(-30, 9, 0),
    },
    {
        id: 'wmCY9xZdrk0XlydyABZqXY',
        entity_id: '1Z68gROMrlTAfPEGiyJJAY',
        state: 'in_review',
        member_id: 'jBoWiyWxj7pp4sG3JgX5l2',
        at: daysFromNow(-25, 9, 0),
    },
    {
        id: 'OWGsZqEi1bnWUetzS2sURr',
        entity_id: 'Q2On2xwMpFdzOklBQJXrni',
        state: 'in_review',
        member_id: 'Trf1Up2jMsPhEnjbW4Ji1n',
        at: daysFromNow(-20, 9, 0),
    },
];

// One state event per seeded flow — the creation moment of
// each flow on the states log, doubling as postFlowCreationOp's
// initial-state input. Authored by SYSTEM_MEMBER_ID at the
// shared wfTimestamp moment.
export const flowStateEvents: StateEntity[] = [
    {
        id: 'fSe01CustomerOnboard0aA',
        entity_id: 'h5mErVBQhwdMKwi1co30jB',
        state: 'active',
        member_id: SYSTEM_MEMBER_ID,
        at: wfTimestamp,
    },
    {
        id: 'fSe02FusionFl0w0aActiv',
        entity_id: 'E2BnBlZyrriqsQYkmS4usb',
        state: 'active',
        member_id: SYSTEM_MEMBER_ID,
        at: wfTimestamp,
    },
    {
        id: 'fSe03Lay0utTest0aActiv',
        entity_id: '7COt7Kf4OaOBg6AjaNO04s',
        state: 'active',
        member_id: SYSTEM_MEMBER_ID,
        at: wfTimestamp,
    },
    {
        id: 'fSe04L3adt0Cl0se0aActiv',
        entity_id: l2cFlowId,
        state: 'active',
        member_id: SYSTEM_MEMBER_ID,
        at: wfTimestamp,
    },
];

// One state event per seeded Record — the creation moment of
// each Record on the states log, doubling as postRecordWriteOp's
// initial-state input.
export const recordStateEvents: StateEntity[] = [
    {
        id: 'rSe01CustPr0fact1ve01A',
        entity_id: customerProfileRecordId,
        state: 'active',
        member_id: SYSTEM_MEMBER_ID,
        at: wfTimestamp,
    },
    {
        id: 'rSe02Pr0jBri3fact1ve02',
        entity_id: projectBriefRecordId,
        state: 'active',
        member_id: SYSTEM_MEMBER_ID,
        at: wfTimestamp,
    },
];

// The project<->flow join rows postFlowCreationOp writes
// alongside each flow it creates.
export const mockProjectFlows: ProjectFlowEntity[] = [
    {
        id: 'noogjofVfg6jFxYOVbdAnC',
        project_id: 'u6YkHhlGc91oDMkr3x0isa',
        flow_id: 'h5mErVBQhwdMKwi1co30jB',
        at: wfTimestamp,
    },
    {
        id: '5ddqhtwd3qcdodXLcsDdyt',
        project_id: 'jRE2Tj32NHsFGZIeEADp0p',
        flow_id: 'E2BnBlZyrriqsQYkmS4usb',
        at: wfTimestamp,
    },
    {
        id: '9YX7ZU4br6zxrHyVcmRjJP',
        project_id: 'u6YkHhlGc91oDMkr3x0isa',
        flow_id: '7COt7Kf4OaOBg6AjaNO04s',
        at: wfTimestamp,
    },
    {
        id: l2cProjectFlowId,
        project_id: l2cProjectId,
        flow_id: l2cFlowId,
        at: wfTimestamp,
    },
];

// ---- deterministic pick helper ----
//
// Moved verbatim out of postMockDataLoadIn so both this file's
// objective-author pick and mock-data.ts's baseline/actual-score
// picks share one implementation.
export function deterministicScore(
    seed: string,
    min: number,
    max: number,
): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    const range = max - min + 1;
    const wrapped = ((hash % range) + range) % range;
    return min + wrapped;
}

// The STARK/org-2 human pools an objective revision's author is
// drawn from — a PURE reconstruction of the same pools
// postMockDataLoadIn's in-tx `humansByOrganization` (still used,
// unchanged, for the project_objective_baseline/actual-score
// deferral) derives by reading the memberships it just wrote
// back from the open transaction. Pass 1 forms an objective's
// pair before any transaction opens, so it has nothing to read
// back; this computes the identical pool straight from the
// seed's own membership assignment (member -> assignOrganization
// (index), 'current' -> both orgs — see postMockDataLoadIn's
// membership Promise.all) instead of a DB round trip.
//
// The two computations are proven to agree: the buffered-tx
// backend's getAll() is insertion-order (backend-buffer-tx.ts),
// and every put the membership Promise.all issues resolves
// synchronously in call order, so "read back what was just
// written" and "recompute from the same static inputs, in the
// same order" are the same list. tests/mock-data-pairs.test.ts
// spot-checks a seeded objective's pair-embedded member_id
// against the written revision row, so a future divergence
// (e.g. a reordered membership Promise.all) fails loudly there
// instead of silently.
export function humanMemberPoolsByOrganization(
    members: readonly SeedHumanMember[],
): ReadonlyMap<Id, readonly Id[]> {
    const pools = new Map<Id, Id[]>();
    members.forEach((member, index) => {
        const organizations = member.id === 'current'
            ? [STARK_ORGANIZATION, ORGANIZATION_TWO]
            : [assignOrganization(index)];
        for (const organization of organizations) {
            const pool = pools.get(organization) ?? [];
            pool.push(member.id);
            pools.set(organization, pool);
        }
    });
    return pools;
}

export function pickHumanMember(
    pools: ReadonlyMap<Id, readonly Id[]>,
    organization: Id,
    seed: string,
): Id {
    const pool = pools.get(organization) ?? [];
    if (pool.length === 0) return SYSTEM_MEMBER_ID;
    return pool[
        deterministicScore(seed, 0, pool.length - 1)
    ]!;
}

// ---- per-family body builders ----
//
// Each returns the EXACT object its family's postXxxOp receives
// as its body/payload argument — the same construction feeds
// both formWritePair (here) and the actual write (mock-data.ts).

export function humanMemberSeedBody(
    member: SeedHumanMember,
): Record<string, unknown> {
    const {
        id: _id, state, name,
        email, phone, bio,
        strengths, team_dimensions,
        ...detail
    } = member;
    return {
        id: member.id,
        pii: { name, email, phone, bio },
        detail: {
            ...detail,
            strengths: jsonArrayField(strengths),
            team_dimensions:
                jsonObjectField(team_dimensions),
        },
        initialState: state,
        initialStateEventId:
            `seed-member-${member.id}-${state}`,
        initialStateAt: MOCK_SEED_TIMESTAMP,
    };
}

export function ideaSeedBody(
    idea: Omit<IdeaEntity, 'organization_id'>,
    event: StateEntity,
    index: number,
): Record<string, unknown> {
    const { id, ...ideaFields } = idea;
    return {
        id,
        idea: {
            ...ideaFields,
            organization_id: assignOrganization(index),
        },
        initialState: event.state,
        initialStateEventId: event.id,
        initialStateAt: event.at,
    };
}

export function flowSeedBody(
    flow: FlowSeed,
    event: StateEntity,
    projectFlow: ProjectFlowEntity,
    flowRelations: FlowGraphRelations,
): Record<string, unknown> {
    const { graph: _graph, id, ...row } = flow;
    const nodeIds = new Set(
        flowRelations.nodes
            .filter(n => n.flow_id === id)
            .map(n => n.id),
    );
    return {
        id,
        flow: {
            ...row, organization_id: STARK_ORGANIZATION,
        },
        projectFlowId: projectFlow.id,
        projectFlow: {
            project_id: projectFlow.project_id,
            flow_id: projectFlow.flow_id,
            at: projectFlow.at,
        },
        initialState: event.state,
        initialStateEventId: event.id,
        initialStateAt: event.at,
        graphDelta: {
            nodes: flowRelations.nodes.filter(
                n => n.flow_id === id,
            ),
            edges: flowRelations.edges.filter(
                e => e.flow_id === id,
            ),
            deletions: [],
            memberEvents: flowRelations.members.filter(
                m => nodeIds.has(m.flow_node_id),
            ),
            attributeEvents:
                flowRelations.attributes.filter(
                    a => nodeIds.has(a.flow_node_id),
                ),
        },
    };
}

export function aiMemberSeedBody(
    m: AIMemberEntity,
): Record<string, unknown> {
    const { id: _id, ...detail } = m;
    return {
        id: m.id,
        detail,
        initialState: 'active',
        initialStateEventId: `seed-member-${m.id}-active`,
        initialStateAt: MOCK_SEED_TIMESTAMP,
    };
}

export function recordSeedBody(
    r: Omit<RecordEntity, 'organization_id'>,
    index: number,
    event: StateEntity,
    attributes: readonly Omit<
        RecordAttributeEntity, 'organization_id'
    >[],
): Record<string, unknown> {
    const organization = assignOrganization(index);
    return {
        kind: 'create',
        id: r.id,
        record: {
            organization_id: organization,
            name: r.name,
            description: r.description,
            position: r.position,
        },
        attributes: attributes.map(a => ({
            id: a.id,
            record_id: a.record_id,
            organization_id: organization,
            name: a.name,
            attribute_type: a.attribute_type,
            sort_order: a.sort_order,
            options: a.options,
            constraints: a.constraints,
        })),
        initialState: event.state,
        initialStateEventId: event.id,
        initialStateAt: event.at,
    };
}

interface ObjectiveSeed {
    readonly id: string;
    readonly position: number;
    readonly name: string;
    readonly description: string;
}

export function objectiveSeedBody(
    seed: ObjectiveSeed,
    organization: Id,
    memberId: Id,
): Record<string, unknown> {
    return {
        id: seed.id,
        objective: {
            organization_id: organization,
            position: seed.position,
        },
        revisionId: `${seed.id}:${MOCK_SEED_TIMESTAMP}`,
        revision: {
            objective_id: seed.id,
            name: seed.name,
            description: seed.description,
            member_id: memberId,
            at: MOCK_SEED_TIMESTAMP,
        },
    };
}

// Org '2' owns one objective so each org owns at least one —
// mirrors the STARK OBJECTIVE_SEEDS shape without a seed entry.
// Exported so mock-data.ts's pass-2 write uses this SAME
// literal rather than a second, independently maintained copy.
export const ORGANIZATION_TWO_OBJECTIVE: ObjectiveSeed = {
    id: 'seed-objective-org2',
    position: 0,
    name: 'Wayne demo objective',
    description: 'Second-org demo objective.',
};

export function bootstrapCurrentMemberBody(
    initialStateAt: string,
): Record<string, unknown> {
    return {
        id: 'current',
        pii: {
            name: 'Tony Stark',
            email: 'demo@example.com',
            phone: '+1 (555) 123-4567',
            bio: 'Passionate about building'
                + ' products that solve'
                + ' real problems.',
        },
        detail: {
            title: 'Admin',
            department: 'Product',
            strengths: jsonArrayField([
                'Strategic Planning',
                'Data Analysis',
                'Stakeholder Management',
            ]),
            team_dimensions: jsonObjectField({
                driver: 80,
                analytical: 80,
                expressive: 80,
                amiable: 80,
            }),
        },
        initialState: 'active',
        initialStateEventId: 'bootstrap-current-active',
        initialStateAt,
    };
}

// ---- pass 1: the op-invocation list + pair formation ----

export function seedPairKey(
    routePattern: string, id: string,
): string {
    return routePattern + ':' + id;
}

interface MockDataInvocation {
    readonly key: string;
    readonly routePattern: string;
    readonly organization: Id | undefined;
    readonly requesterIdentityId: Id;
    readonly body: Record<string, unknown>;
}

// Dependency-ordered (matches postMockDataLoadIn's write order):
// human-members, ideas, flows, ai-members, records, objectives.
// A dropped or reordered invocation here is caught by
// tests/mock-data-pairs.test.ts's pinned invocation count.
export function buildMockDataInvocations():
    readonly MockDataInvocation[] {
    const members = buildMembers();
    const ideaStateEventById = new Map(
        ideaStateEvents.map(e => [e.entity_id, e]),
    );
    const ideas = buildIdeas();
    const mockFlows = buildFlows();
    const flowRelations = buildFlowGraphRelations(
        mockFlows, MOCK_SEED_TIMESTAMP,
    );
    const flowStateEventByFlowId = new Map(
        flowStateEvents.map(e => [e.entity_id, e]),
    );
    const aiMembers = buildAiMembers();
    const mockRecords = buildRecords();
    const mockRecordAttributes = buildRecordAttributes();
    const recordStateEventByRecordId = new Map(
        recordStateEvents.map(e => [e.entity_id, e]),
    );
    const pools = humanMemberPoolsByOrganization(members);

    const invocations: MockDataInvocation[] = [];

    for (const member of members) {
        invocations.push({
            key: seedPairKey('human-members', member.id),
            routePattern: 'human-members',
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: humanMemberSeedBody(member),
        });
    }
    ideas.forEach((idea, i) => {
        const event = ideaStateEventById.get(idea.id)!;
        invocations.push({
            key: seedPairKey('ideas', idea.id),
            routePattern: 'ideas',
            organization: assignOrganization(i),
            requesterIdentityId: event.member_id,
            body: ideaSeedBody(idea, event, i),
        });
    });
    for (const flow of mockFlows) {
        const event = flowStateEventByFlowId.get(flow.id)!;
        const projectFlow = mockProjectFlows.find(
            pf => pf.flow_id === flow.id,
        )!;
        invocations.push({
            key: seedPairKey('flows', flow.id),
            routePattern: 'flows',
            organization: STARK_ORGANIZATION,
            requesterIdentityId: event.member_id,
            body: flowSeedBody(
                flow, event, projectFlow, flowRelations,
            ),
        });
    }
    for (const m of aiMembers) {
        invocations.push({
            key: seedPairKey('ai-members', m.id),
            routePattern: 'ai-members',
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: aiMemberSeedBody(m),
        });
    }
    mockRecords.forEach((r, i) => {
        const event = recordStateEventByRecordId.get(r.id)!;
        const attributes = mockRecordAttributes.filter(
            a => a.record_id === r.id,
        );
        invocations.push({
            key: seedPairKey('records', r.id),
            routePattern: 'records',
            organization: assignOrganization(i),
            requesterIdentityId: event.member_id,
            body: recordSeedBody(r, i, event, attributes),
        });
    });
    for (const seed of OBJECTIVE_SEEDS) {
        const memberId = pickHumanMember(
            pools, STARK_ORGANIZATION,
            `${seed.id}:revision`,
        );
        invocations.push({
            key: seedPairKey('objectives', seed.id),
            routePattern: 'objectives',
            organization: STARK_ORGANIZATION,
            requesterIdentityId: memberId,
            body: objectiveSeedBody(
                seed, STARK_ORGANIZATION, memberId,
            ),
        });
    }
    invocations.push({
        key: seedPairKey(
            'objectives', ORGANIZATION_TWO_OBJECTIVE.id,
        ),
        routePattern: 'objectives',
        organization: ORGANIZATION_TWO,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: objectiveSeedBody(
            ORGANIZATION_TWO_OBJECTIVE,
            ORGANIZATION_TWO, SYSTEM_MEMBER_ID,
        ),
    });
    return invocations;
}

// All six families are global/collection-level POSTs (no `:id`
// segment), so the route/path segments are always the bare
// pattern — messageAddress derives the empty uriId and
// createdEntityUriId (message-pair.ts's CREATE_BODY_ID_FIELDS)
// overrides it to the created entity's own id.
async function formSeedPair(
    inv: MockDataInvocation, requestAt: string,
): Promise<MessagePair> {
    return formWritePair({
        method: 'POST',
        pathname: '/' + inv.routePattern,
        routePattern: inv.routePattern,
        routeSegments: [inv.routePattern],
        pathSegments: [inv.routePattern],
        // The seed carries no real HTTP request — no bearer to
        // redact, no content-type to hoist. Honest about the
        // below-gate carve-out rather than synthesizing a fake
        // bearer (CLAUDE.md's named carve-out).
        headerFields: [],
        body: inv.body,
        requesterIdentityId: inv.requesterIdentityId,
        requestAt,
        organization: inv.organization,
        // Every wired family here is a create route; all six
        // are {status: 204} in WRITE_RESPONSE_SPECS (routes.ts)
        // — no successBody.
        responseStatus: 204,
        responseBody: undefined,
        // Fresh database: every seed pair is genesis, so there
        // is nothing to chain off of — no pre-tx head-read.
        headPairId: undefined,
    });
}

// Pass 1 for postMockDataLoad: every op-invocation's pair,
// formed BEFORE the seed's transaction opens. `requestAt` is
// minted once by the caller (the seed's arrival moment) and
// shared by every pair this seed forms.
export async function formMockDataMessagePairs(
    requestAt: string,
): Promise<ReadonlyMap<string, MessagePair>> {
    const pairs = new Map<string, MessagePair>();
    for (const inv of buildMockDataInvocations()) {
        pairs.set(inv.key, await formSeedPair(inv, requestAt));
    }
    return pairs;
}

// Pass 1 for postBootstrap: the lone 'current' human-member
// create. Its body embeds nowUtc() (bootstrap has no fixed
// seed timestamp), so it is minted ONCE here and returned
// alongside the pair it was hashed from — postBootstrapIn
// (pass 2) writes this SAME body, never a second nowUtc() call,
// so the stored pair never drifts from what was actually
// written.
export async function formBootstrapMessagePair(
    requestAt: string,
): Promise<{
    readonly body: Record<string, unknown>;
    readonly pair: MessagePair;
}> {
    const body = bootstrapCurrentMemberBody(nowUtc());
    const pair = await formSeedPair(
        {
            key: seedPairKey('human-members', 'current'),
            routePattern: 'human-members',
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body,
        },
        requestAt,
    );
    return { body, pair };
}
