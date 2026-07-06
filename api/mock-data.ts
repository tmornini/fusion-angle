import type { DbAdapter } from './db.ts';
import { TABLE_NAMES } from './db.ts';
import {
    postIdeaDocumentOp,
    postIdeaSubmissionOp,
    postProjectDocumentOp,
    postFlowCreationOp,
    postFlowDocumentOp,
    postWorkOrderDocumentOp,
    postFlowWorkOrderDocumentOp,
    postFlowRecordDocumentOp,
    postRecordWriteOp,
    postObjectiveCreationOp,
    postAiMemberCreationOp,
    postHumanMemberCreationOp,
    postBaselineScoreDocumentOp,
    postActualScoreDocumentOp,
    postMembershipDocumentOp,
    postMemberDocumentOp,
    memberDocumentBodyOf,
} from './routes.ts';
import type {
    FlowCreationPairs,
    RecordWritePairs,
    ObjectiveCreationPairs,
    MemberWritePairs,
} from './routes.ts';
import type {
    StateEntity,
    StateFieldValueEntity,
} from './types.ts';
import {
    SYSTEM_MEMBER_ID,
    nowUtc,
} from './types.ts';
import {
    generateCryptoSafeBase62,
} from '../shared/crypto-safe-base62.ts';
import { hashPassword } from '../shared/password-hash.ts';
import type { MessagePair } from './message-pair.ts';
import {
    daysFromNow,
    humanMemberPoolsByOrganization,
    pickHumanMember,
} from './mock-data/seed-kit.ts';
import {
    MOCK_SEED_TIMESTAMP,
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
    assignOrganization,
} from './mock-data/seed-constants.ts';
import { buildAiMembers } from './mock-data/ai-members.ts';
import { buildMembers } from './mock-data/members.ts';
import {
    buildIdeas,
    buildIdeaSubmissions,
} from './mock-data/ideas.ts';
import {
    buildFlows,
    buildFlowGraphRelations,
} from './mock-data/flows.ts';
import {
    buildProjects,
} from './mock-data/projects.ts';
import {
    OBJECTIVE_SEEDS,
} from './mock-data/objectives.ts';
import {
    buildRecords,
    buildRecordAttributes,
} from './mock-data/records.ts';
import {
    buildWorkOrders,
    buildFlowWorkOrderJoins,
    buildWorkOrderStateEvents,
} from './mock-data/work-orders.ts';
import {
    buildLeadToCloseWorkload,
} from './mock-data/lead-to-close-flow.ts';
import {
    ideaStateEvents,
    projectStateEvents,
    flowStateEvents,
    recordStateEvents,
    mockProjectFlows,
    mockFlowRecords,
    humanMemberSeedBody,
    ideaSeedBody,
    ideaSubmissionSeedBody,
    projectSeedBody,
    projectOrg2,
    projectOrganizationFor,
    buildScoreSeedProjects,
    flowSeedBody,
    flowOrg2SeedBody,
    workOrderDocumentSeedBody,
    flowWorkOrderJoinSeedBody,
    flowRecordJoinSeedBody,
    aiMemberSeedBody,
    recordSeedBody,
    objectiveSeedBody,
    formMockDataMessagePairs,
    formBootstrapMessagePair,
    seedPairKey,
    ORGANIZATION_TWO_OBJECTIVE,
    membershipSeedBody,
    bootstrapMembershipId,
} from './mock-data/seed-message-pairs.ts';
import { buildSeedScoreRows } from './mock-data/scores.ts';

const TIER_SEATS_LIMIT = 200;
const TIER_PROJECTS_LIMIT = 50;
const TIER_IDEAS_LIMIT = 1000;

// A missing pair here is a pass-1/pass-2 wiring bug (a dropped
// or mis-keyed invocation), never an expected condition — crash
// loud rather than silently write the row with no pair.
function requirePair(
    pairs: ReadonlyMap<string, MessagePair>, key: string,
): MessagePair {
    const pair = pairs.get(key);
    if (pair === undefined) {
        throw new Error('seed formed no message pair for ' + key);
    }
    return pair;
}

// The seeded admin credential set, returned to the caller so a
// one-time reveal can surface the plaintext password. The
// plaintext is never stored — only its PBKDF2 hash lands in the
// identity_credentials.secret column.
export interface SeededIdentityCredential {
    readonly identityId: string;
    readonly username: string;
    readonly password: string;
}

// The freshly-seeded human sign-ins, surfaced in-band exactly
// once. Only PBKDF2 hashes land in identity_credentials.secret;
// these plaintexts live only in this return value. DEMO-ONLY:
// the in-band plaintext return is deleted at the server tier.
export interface SeededCredentials {
    readonly identities:
        readonly SeededIdentityCredential[];
}

// Mint a fresh crypto-grade password for EVERY login-capable
// person identity (one with a PII email), hash it into the
// credential ledger, and return the plaintexts in-band for a
// one-time reveal. A placeholder string would not verify
// through the real /authentication/authorize loop. The system
// identity signs with a client_secret — generated, hashed, and
// discarded, never revealed. Both seed paths call this AFTER
// the entity seed commits, NEVER inside it: PBKDF2 hashing is
// async crypto, and awaiting a non-IDB promise inside a
// transaction body auto-commits the IndexedDB transaction
// early (CLAUDE.md § IndexedDB auto-commit). So every hash is
// computed up front, then the credential rows land together in
// one transaction of pure row ops.
async function seedHumanCredentials(
    adapter: DbAdapter,
): Promise<SeededCredentials> {
    const piiById = new Map(
        (await adapter.identityPii.getAll())
            .map(p => [p.id, p]));
    const persons = (await adapter.identities.getAll())
        .filter(i => i.kind === 'person'
            && piiById.has(i.id));
    const planned = await Promise.all(
        persons.map(async identity => {
            const password = generateCryptoSafeBase62();
            return {
                id: 'seed-cred-'
                    + identity.id + '-password',
                identityId: identity.id,
                username: piiById.get(identity.id)!.email,
                password,
                secret: await hashPassword(password),
            };
        }));
    const systemSecret = await hashPassword(
        generateCryptoSafeBase62());
    await adapter.transaction(
        ['identity_credentials'],
        async (view) => {
            await Promise.all([
                ...planned.map(cred =>
                    view.identityCredentials.put(cred.id, {
                        identity_id: cred.identityId,
                        kind: 'password',
                        status: 'set',
                        secret: cred.secret,
                        at: MOCK_SEED_TIMESTAMP,
                    })),
                view.identityCredentials.put(
                    'seed-cred-system-client-secret', {
                        identity_id: SYSTEM_MEMBER_ID,
                        kind: 'client_secret',
                        status: 'set',
                        secret: systemSecret,
                        at: MOCK_SEED_TIMESTAMP,
                    }),
            ]);
        },
    );
    return {
        identities: planned.map(cred => ({
            identityId: cred.identityId,
            username: cred.username,
            password: cred.password,
        })),
    };
}

export { OBJECTIVE_SEEDS };

export async function postMockDataLoad(
    adapter: DbAdapter,
): Promise<SeededCredentials> {
    // Pass 1 (no tx): every pair-wired op-invocation's message
    // pair, formed up front — formWritePair's hashing is async
    // crypto, which would auto-commit an IndexedDB transaction
    // early if awaited inside one (CLAUDE.md § the IndexedDB
    // auto-commit constraint). requestAt is minted once, the
    // seed's own arrival moment, and shared by every pair.
    const pairs = await formMockDataMessagePairs(nowUtc());
    // Pass 2: seed the whole demo dataset in one transaction —
    // row ops only — so a mid-seed failure leaves no
    // half-populated schema. The credentials seed runs after it
    // commits — its PBKDF2 hashing is ALSO async crypto and
    // cannot run inside the tx. The schema marker stamps LAST,
    // so a failed seed leaves hasSchema() false: the datastore
    // reads as empty and the seed can be retried cleanly.
    await adapter.ensureTables(TABLE_NAMES);
    await adapter.transaction(
        TABLE_NAMES,
        (view) => postMockDataLoadIn(view, pairs),
    );
    const creds = await seedHumanCredentials(adapter);
    await adapter.postSchemaCreation();
    return creds;
}

async function postMockDataLoadIn(
    adapter: DbAdapter,
    pairs: ReadonlyMap<string, MessagePair>,
): Promise<void> {
    const members = buildMembers();

    await Promise.all([
        ...members.flatMap((member, index) => {
            // 'current' (the admin) joins BOTH orgs; every
            // other human is single-org via assignOrganization.
            const organizations = member.id === 'current'
                ? [STARK_ORGANIZATION, ORGANIZATION_TWO]
                : [assignOrganization(index)];
            return [
                // Task 5: memberships close their LAST
                // whole-slice seed deferral — the SAME row, now
                // driven through postMembershipDocumentOp so it
                // forms a message pair too (Path A). The body is
                // membershipSeedBody's own construction — the
                // SAME one seed-message-pairs.ts used to form
                // this row's pair, so the two can never drift.
                ...organizations.map((organization, n) =>
                    postMembershipDocumentOp(
                        adapter,
                        'seed-membership-'
                        + member.id + '-' + n,
                        membershipSeedBody(organization, member.id),
                        SYSTEM_MEMBER_ID,
                        requirePair(
                            pairs,
                            seedPairKey(
                                'memberships/:id',
                                'seed-membership-'
                                + member.id + '-' + n,
                            ),
                        ),
                    )),
                adapter.identityDefaultOrganizations.put(
                    'seed-default-org-' + member.id, {
                        identity_id: member.id,
                        organization_id: organizations[0]!,
                        at: MOCK_SEED_TIMESTAMP,
                    }),
                postHumanMemberCreationOp(
                    adapter,
                    humanMemberSeedBody(member),
                    SYSTEM_MEMBER_ID,
                    {
                        operation: requirePair(
                            pairs,
                            seedPairKey(
                                'human-members', member.id,
                            ),
                        ),
                        memberDocument: requirePair(
                            pairs,
                            seedPairKey(
                                'members/:id', member.id,
                            ),
                        ),
                        detailDocument: requirePair(
                            pairs,
                            seedPairKey(
                                'human-members/:id', member.id,
                            ),
                        ),
                    },
                ),
            ];
        }),
        // Task 5: the system member's own members/:id row closes
        // the last raw members.put site — driven through
        // postMemberDocumentOp so it forms a message pair too
        // (Path A), the SAME op the human/AI member-document
        // invocations above already ride. Its identities row
        // stays a raw put — the identity spine itself is Phase
        // 9's own scope, untouched here.
        postMemberDocumentOp(
            adapter,
            SYSTEM_MEMBER_ID,
            memberDocumentBodyOf('system'),
            SYSTEM_MEMBER_ID,
            requirePair(
                pairs, seedPairKey('members/:id', SYSTEM_MEMBER_ID),
            ),
        ),
        adapter.identities.put(SYSTEM_MEMBER_ID, {
            kind: 'service',
        }),
        adapter.roleGrants.put(
            'seed-role-current-admin', {
                organization_id: STARK_ORGANIZATION,
                identity_id: 'current',
                role: 'admin',
                action: 'granted',
                by_member_id: SYSTEM_MEMBER_ID,
                at: MOCK_SEED_TIMESTAMP,
            },
        ),
        adapter.roleGrants.put(
            'seed-role-current-admin-org2', {
                organization_id: ORGANIZATION_TWO,
                identity_id: 'current',
                role: 'admin',
                action: 'granted',
                by_member_id: SYSTEM_MEMBER_ID,
                at: MOCK_SEED_TIMESTAMP,
            },
        ),
        // Every non-admin human gets the member role in its
        // membership org (same assignOrganization(index) partition as
        // the membership seed above), so each seeded sign-in
        // lands on a working content tier — not a 403 wall.
        ...members.flatMap((member, index) =>
            member.id === 'current'
                ? []
                : [adapter.roleGrants.put(
                    'seed-role-' + member.id + '-member', {
                        organization_id: assignOrganization(index),
                        identity_id: member.id,
                        role: 'member',
                        action: 'granted',
                        by_member_id: SYSTEM_MEMBER_ID,
                        at: MOCK_SEED_TIMESTAMP,
                    },
                )]),
    ]);

    // The system member's initial state event. Every OTHER
    // seeded member — human or AI — gets its own initial
    // event posted by its create op (postHumanMemberCreationOp
    // / postAiMemberCreationOp) below. The states log is the
    // sole source of member state; the row carries no column.
    const memberStateEvents: StateEntity[] = [
        {
            id: `seed-member-${SYSTEM_MEMBER_ID}-active`,
            entity_id: SYSTEM_MEMBER_ID,
            state: 'active',
            member_id: SYSTEM_MEMBER_ID,
            at: MOCK_SEED_TIMESTAMP,
        },
    ];

    const ideas = buildIdeas();

    // Each seeded idea's sole state event doubles as its
    // genesis event — driven through postIdeaDocumentOp below
    // so the seed writes exactly as the genesis case of PUT
    // /ideas/:id does (Decision 7, Phase 2 Task 3: create is
    // just the head-absent case of the document PUT). Driving
    // the op below the org fence, the unscoped store stamps
    // nothing, so organization_id rides in the seed body
    // instead of the (route-only) omission. ideaStateEvents is
    // imported from seed-message-pairs.ts — pass 1 there needs
    // the SAME array to form each idea's pair before this
    // transaction opens.
    const ideaStateEventById = new Map(
        ideaStateEvents.map(e => [e.entity_id, e]),
    );

    await Promise.all([
        ...ideas.map((idea, i) => {
            const event = ideaStateEventById.get(idea.id)!;
            return postIdeaDocumentOp(
                adapter,
                idea.id,
                ideaSeedBody(idea, event, i),
                event.member_id,
                requirePair(
                    pairs, seedPairKey('ideas', idea.id),
                ),
            );
        }),
        adapter.organizations.put(STARK_ORGANIZATION, {
            name: 'Stark Industries',
            domain: 'acmecorp.com',
            next_billing: daysFromNow(300, 0, 0),
            seats: TIER_SEATS_LIMIT,
            projects_limit: TIER_PROJECTS_LIMIT,
            ideas_limit: TIER_IDEAS_LIMIT,
        }),
        adapter.organizations.put(ORGANIZATION_TWO, {
            name: 'Wayne Enterprises',
            domain: 'wayne.example.com',
            next_billing: daysFromNow(200, 0, 0),
            seats: TIER_SEATS_LIMIT,
            projects_limit: TIER_PROJECTS_LIMIT,
            ideas_limit: TIER_IDEAS_LIMIT,
        }),
    ]);

    const projects = buildProjects();

    // Each seeded project's sole state event doubles as its
    // genesis event — driven through postProjectDocumentOp
    // below exactly as ideas drive through postIdeaDocumentOp
    // above (Decision 7, Phase 3 Task 3). Driving the op below
    // the org fence, the unscoped store stamps nothing, so
    // organization_id rides in the seed body instead of the
    // (route-only) omission. projectStateEvents (including the
    // org-2 override's own event) is imported from
    // seed-message-pairs.ts — pass 1 there needs the SAME array
    // to form each project's pair before this transaction opens.
    // projectOrg2 extends projects[0] under organization '2' —
    // the SAME construction pass 1 uses, so a seeded pair can
    // never drift from what this write actually stores.
    const projectStateEventById = new Map(
        projectStateEvents.map(e => [e.entity_id, e]),
    );

    await Promise.all(
        [...projects, projectOrg2(projects)].map(project => {
            const event =
                projectStateEventById.get(project.id)!;
            const organization = projectOrganizationFor(project);
            return postProjectDocumentOp(
                adapter,
                project.id,
                projectSeedBody(project, event, organization),
                event.member_id,
                requirePair(
                    pairs, seedPairKey('projects', project.id),
                ),
            );
        }),
    );

    const mockFlows = buildFlows();

    // The normalized graph truth (F-131): each flow's authored
    // graph literal decomposed into relation rows. These ARE the
    // graph — the GET handlers reassemble it from them; the flow
    // row stores no blob.
    const flowRelations = buildFlowGraphRelations(
        mockFlows, MOCK_SEED_TIMESTAMP,
    );

    // One state event per seeded flow — the
    // creation moment of each flow on the states
    // log. Tier 2.3 retires FlowEntity.created_at
    // / updated_at; the log IS the truth. Events
    // are authored by SYSTEM_MEMBER_ID at the
    // shared wfTimestamp moment. Driven through
    // postFlowCreationOp below, alongside each
    // flow's row and graph delta. flowStateEvents is
    // imported from seed-message-pairs.ts — pass 1
    // there needs the SAME array to form each flow's
    // pair before this transaction opens.
    const flowStateEventByFlowId = new Map(
        flowStateEvents.map(e => [e.entity_id, e]),
    );

    // Records: app-global data shapes that flows
    // bind to. Customer Profile carries the
    // company-info attributes referenced by the
    // Customer Onboarding Data Capture and Review
    // nodes, and is multi-bound to Lead-to-Close.
    // Project Brief carries the idea-shape
    // attributes referenced by Fusion Flow's
    // Describe-problem and Solution nodes.
    const mockRecords = buildRecords();

    const mockRecordAttributes = buildRecordAttributes();

    // mockFlowRecords (the flow-record join rows) is imported
    // from seed-message-pairs.ts — pass 1 there needs the SAME
    // array to form each join's pair before this transaction
    // opens.

    // One state event per seeded Record — the
    // creation moment of each Record on the states
    // log. Records start at 'active'. DELETE records/:id splices ONLY
    // the record row; no cascade exists (record_attributes /
    // state_field_values / flow_records rows orphan silently — a
    // pre-existing, named gap). Driven through postRecordWriteOp below,
    // alongside each record's row and attributes.
    // recordStateEvents is imported from
    // seed-message-pairs.ts — pass 1 there needs the
    // SAME array to form each record's pair before
    // this transaction opens.
    const recordStateEventByRecordId = new Map(
        recordStateEvents.map(e => [e.entity_id, e]),
    );

    const fCompanyName =
        '5JZ0LeKdPCa4QMtg1RsF1M';
    const fEmail =
        'nplTIh0qXNtAyoWSwRaBYe';
    const fPhone =
        'kzHpMw9f1thq79VoBYeIX3';
    const fIndustry =
        'QsmqiOmPtoMLGpSjHOqdHA';
    const fRevenue =
        '0TyjQRcygn3DIyXTe6x1F6';
    const fEmployees =
        '8Z62tcRHBpwCRH1kBffx0G';
    const fReviewerNotes =
        'AdQlKf43JV6yrhQbyskDkR';

    const mockWorkOrders = buildWorkOrders();

    const mockFlowWorkOrders = buildFlowWorkOrderJoins();

    const mockStateEvents = buildWorkOrderStateEvents();

    const mockStateFieldValues:
        StateFieldValueEntity[] = [
        {
            id: '4izDJCuygAL7iqjeHdephl',
            state_event_id: 'eJEybxfXaf3sjwFilZnunU',
            attribute_id: fCompanyName,
            value: 'Acme Corp',
        },
        {
            id: 'NBmVbZMOWPSMZ11zhTpzEQ',
            state_event_id: 'eJEybxfXaf3sjwFilZnunU',
            attribute_id: fEmail,
            value: 'onboard@acme.com',
        },
        {
            id: 'lxSMfOtoXk89FTuxLj895r',
            state_event_id: 'eJEybxfXaf3sjwFilZnunU',
            attribute_id: fPhone,
            value: '+1-555-0100',
        },
        {
            id: 'F8Cagh2PlkwHakidXqGEXq',
            state_event_id: 'eJEybxfXaf3sjwFilZnunU',
            attribute_id: fIndustry,
            value: 'Technology',
        },
        {
            id: '57xrfe07Pqj38qvutRJk2N',
            state_event_id: 'eJEybxfXaf3sjwFilZnunU',
            attribute_id: fRevenue,
            value: '5000000',
        },
        {
            id: 'juYwNY2S35qCJqT3SAnwyW',
            state_event_id: 'eJEybxfXaf3sjwFilZnunU',
            attribute_id: fEmployees,
            value: '250',
        },
        {
            id: 'vtXOj3CjsGIYGlnds0FSJd',
            state_event_id: 'C2xb2bbjyHD11WfLayh8Om',
            attribute_id: fReviewerNotes,
            value: 'Approved. Strong fit.',
        },
    ];

    // mockProjectFlows is imported from
    // seed-message-pairs.ts — pass 1 there needs the SAME
    // array to form each flow's pair before this transaction
    // opens.

    const leadToCloseData = buildLeadToCloseWorkload();

    await Promise.all([
        // Store only the flow's scalar fields — the authored
        // graph literal is the relation-seed input, decomposed
        // by postFlowCreationOp's graphDelta below — never a
        // stored column. Each of the four mockFlows carries a
        // project_flows join row (mockProjectFlows), so all
        // four drive through the op; seed-flow-org2 (below)
        // has no project link, so it drives through
        // postFlowDocumentOp instead (Task 6).
        ...mockFlows.map(flow => {
            const event = flowStateEventByFlowId.get(flow.id)!;
            const projectFlow = mockProjectFlows.find(
                pf => pf.flow_id === flow.id,
            )!;
            // Task 5: create threads the triple — the operation
            // pair plus its two synthesized siblings, each
            // pre-formed in pass 1 under its own deterministic
            // key (seed-message-pairs.ts).
            const flowPairs: FlowCreationPairs = {
                operation: requirePair(
                    pairs, seedPairKey('flows', flow.id),
                ),
                document: requirePair(
                    pairs, seedPairKey('flows/:id', flow.id),
                ),
                join: requirePair(
                    pairs,
                    seedPairKey(
                        'projects/:id/flows/:pfid',
                        projectFlow.id,
                    ),
                ),
            };
            return postFlowCreationOp(
                adapter,
                flowSeedBody(
                    flow, event, projectFlow, flowRelations,
                ),
                event.member_id,
                flowPairs,
            );
        }),
        // Organization '2' owns a small, self-contained slice so each
        // org owns at least one project (postProjectDocumentOp
        // above seeds projectOrg2) and flow. The whole
        // work-order graph stays in org '1', so org '2' gets a
        // work-order-free flow and a flow-free project — no
        // cross-org coupling. seed-flow-org2 has no
        // project_flows join row, so it drives through
        // postFlowDocumentOp (Task 6) instead of
        // postFlowCreationOp, which requires one.
        postFlowDocumentOp(
            adapter,
            'seed-flow-org2',
            flowOrg2SeedBody(),
            SYSTEM_MEMBER_ID,
            requirePair(
                pairs,
                seedPairKey('flows/:id', 'seed-flow-org2'),
            ),
        ),
    ]);

    const ideaSubmissions = buildIdeaSubmissions();

    const aiMembers = buildAiMembers();

    await Promise.all([
        ...ideaSubmissions.map(r =>
            postIdeaSubmissionOp(
                adapter,
                r.id,
                ideaSubmissionSeedBody(r),
                requirePair(
                    pairs,
                    seedPairKey('idea-submissions', r.id),
                ),
            ),
        ),
        ...mockWorkOrders.map(r =>
            postWorkOrderDocumentOp(
                adapter,
                r.id,
                workOrderDocumentSeedBody(r),
                SYSTEM_MEMBER_ID,
                requirePair(
                    pairs, seedPairKey('work-orders/:id', r.id),
                ),
            ),
        ),
        ...mockFlowWorkOrders.map(r =>
            postFlowWorkOrderDocumentOp(
                adapter,
                r.id,
                flowWorkOrderJoinSeedBody(r),
                SYSTEM_MEMBER_ID,
                requirePair(
                    pairs,
                    seedPairKey(
                        'flows/:id/work-orders/:woid', r.id,
                    ),
                ),
            ),
        ),
        ...mockStateEvents.map(r =>
            adapter.states.put(r.id, {
                entity_id: r.entity_id,
                state: r.state,
                member_id: r.member_id,
                at: r.at,
            }),
        ),
        ...memberStateEvents.map(r =>
            adapter.states.put(r.id, {
                entity_id: r.entity_id,
                state: r.state,
                member_id: r.member_id,
                at: r.at,
            }),
        ),
        ...mockStateFieldValues.map(r =>
            adapter.stateFieldValues
                .put(r.id, r),
        ),
        // AI members start at 'active' on creation — same
        // single-event seeding as humans, driven through
        // postAiMemberCreationOp. POST /ai-members (and so
        // the op) writes no identities row — only members +
        // ai_members + the initial event — so the identities
        // row rides a separate direct put through the bare
        // PUT /identities/:id primitive (makeIdRoute), the
        // same "leave and note" carve-out as projects.
        ...aiMembers.flatMap(m => {
            return [
                // Task 5: the same memberships closure as the
                // human-members loop above, driven through
                // postMembershipDocumentOp with membershipSeedBody's
                // shared construction.
                postMembershipDocumentOp(
                    adapter,
                    'seed-membership-' + m.id,
                    membershipSeedBody(STARK_ORGANIZATION, m.id),
                    SYSTEM_MEMBER_ID,
                    requirePair(
                        pairs,
                        seedPairKey(
                            'memberships/:id',
                            'seed-membership-' + m.id,
                        ),
                    ),
                ),
                adapter.identities.put(m.id, {
                    kind: 'service',
                }),
                postAiMemberCreationOp(
                    adapter,
                    aiMemberSeedBody(m),
                    SYSTEM_MEMBER_ID,
                    {
                        operation: requirePair(
                            pairs,
                            seedPairKey('ai-members', m.id),
                        ),
                        memberDocument: requirePair(
                            pairs,
                            seedPairKey('members/:id', m.id),
                        ),
                        detailDocument: requirePair(
                            pairs,
                            seedPairKey('ai-members/:id', m.id),
                        ),
                    },
                ),
            ];
        }),
        ...leadToCloseData.workOrders.map(r =>
            postWorkOrderDocumentOp(
                adapter,
                r.id,
                workOrderDocumentSeedBody(r),
                SYSTEM_MEMBER_ID,
                requirePair(
                    pairs, seedPairKey('work-orders/:id', r.id),
                ),
            ),
        ),
        ...leadToCloseData.flowWorkOrders.map(r =>
            postFlowWorkOrderDocumentOp(
                adapter,
                r.id,
                flowWorkOrderJoinSeedBody(r),
                SYSTEM_MEMBER_ID,
                requirePair(
                    pairs,
                    seedPairKey(
                        'flows/:id/work-orders/:woid', r.id,
                    ),
                ),
            ),
        ),
        ...leadToCloseData.stateEvents.map(r =>
            adapter.states.put(r.id, {
                entity_id: r.entity_id,
                state: r.state,
                member_id: r.member_id,
                at: r.at,
            }),
        ),
        ...mockRecords.map((r, i) => {
            const event = recordStateEventByRecordId.get(r.id)!;
            const attributes = mockRecordAttributes.filter(
                a => a.record_id === r.id,
            );
            // The bundle assembled from per-pair requirePair
            // lookups (Phase 6 Task 4) — the FlowCreationPairs
            // assembly precedent above, generalized from fixed
            // cardinality 3 to 1+1+N: the operation and document
            // pairs each resolve by their own deterministic key,
            // one attribute-PUT pair per seeded attribute, and
            // an empty attributeDeletes (the seed never removes
            // an attribute it just created).
            const recordPairs: RecordWritePairs = {
                operation: requirePair(
                    pairs, seedPairKey('records', r.id),
                ),
                document: requirePair(
                    pairs, seedPairKey('records/:id', r.id),
                ),
                attributePuts: attributes.map(a =>
                    requirePair(
                        pairs,
                        seedPairKey(
                            'record-attributes/:id', a.id,
                        ),
                    ),
                ),
                attributeDeletes: [],
            };
            return postRecordWriteOp(
                adapter,
                recordSeedBody(r, i, event, attributes),
                event.member_id,
                recordPairs,
            );
        }),
        ...mockFlowRecords.map(r =>
            postFlowRecordDocumentOp(
                adapter,
                r.id,
                flowRecordJoinSeedBody(r),
                SYSTEM_MEMBER_ID,
                requirePair(
                    pairs,
                    seedPairKey(
                        'flows/:id/records/:frid', r.id,
                    ),
                ),
            ),
        ),
    ]);

    // A score or revision author is always a member of the
    // scored entity's org. Seed authors from that org ONLY:
    // picking across orgs produced authors outside the
    // org-scoped roster, and memberName (strict by design)
    // then threw when the project-history modal resolved them.
    //
    // The STARK-org objective revisions' author cannot read
    // memberships back in-tx: its pair was already formed pre-tx
    // (pass 1, before any membership row existed to read back),
    // so pass 2 must pick from the SAME pure pool pass 1 used —
    // see humanMemberPoolsByOrganization's doc comment for why
    // the two are proven to agree. The baseline/actual-score
    // deferral below (buildSeedScoreRows) draws from this SAME
    // pool now too — the former in-tx memberFor DB-read retired
    // once its pick moved onto pickHumanMember (Phase 7 Task 5).
    const objectiveMemberPools =
        humanMemberPoolsByOrganization(members);
    for (const seed of OBJECTIVE_SEEDS) {
        const memberId = pickHumanMember(
            objectiveMemberPools, STARK_ORGANIZATION,
            `${seed.id}:revision`,
        );
        // Task 3: create threads the triple — the operation
        // pair plus its two synthesized siblings (document,
        // revision), each pre-formed in pass 1 under its own
        // deterministic key (seed-message-pairs.ts) — the
        // flows precedent, objectives' own fixed 1+1+1. The
        // revision id is recomputed identically to
        // objectiveSeedBody's own construction (deterministic,
        // never random), the mock-data-pairs.test.ts precedent.
        const revisionId = `${seed.id}:${MOCK_SEED_TIMESTAMP}`;
        const objectivePairs: ObjectiveCreationPairs = {
            operation: requirePair(
                pairs, seedPairKey('objectives', seed.id),
            ),
            document: requirePair(
                pairs, seedPairKey('objectives/:id', seed.id),
            ),
            revision: requirePair(
                pairs,
                seedPairKey(
                    'objectives/:id/revisions/:rid', revisionId,
                ),
            ),
        };
        await postObjectiveCreationOp(
            adapter,
            objectiveSeedBody(
                seed, STARK_ORGANIZATION, memberId,
            ),
            objectivePairs,
        );
    }

    // Organization '2' owns one objective so each org owns at least one.
    const org2RevisionId =
        `${ORGANIZATION_TWO_OBJECTIVE.id}:${MOCK_SEED_TIMESTAMP}`;
    await postObjectiveCreationOp(
        adapter,
        objectiveSeedBody(
            ORGANIZATION_TWO_OBJECTIVE, ORGANIZATION_TWO,
            SYSTEM_MEMBER_ID,
        ),
        {
            operation: requirePair(
                pairs,
                seedPairKey(
                    'objectives', ORGANIZATION_TWO_OBJECTIVE.id,
                ),
            ),
            document: requirePair(
                pairs,
                seedPairKey(
                    'objectives/:id',
                    ORGANIZATION_TWO_OBJECTIVE.id,
                ),
            ),
            revision: requirePair(
                pairs,
                seedPairKey(
                    'objectives/:id/revisions/:rid',
                    org2RevisionId,
                ),
            ),
        },
    );

    // The baseline/actual-score rows — hoisted VERBATIM into a
    // pure builder (Phase 7 Task 5) so pass 1 (seed-message-
    // pairs.ts) forms each row's message pair before this
    // transaction opens, the SAME split every other seeded
    // family already uses. buildScoreSeedProjects resolves each
    // project's organization_id/state PURELY (never a DB read
    // back). This closes the scores half of the Phase 0 seed
    // deferral WHOLE — baselines AND actuals — one document pair
    // per row, driven through postBaselineScoreDocumentOp /
    // postActualScoreDocumentOp exactly as every other seeded
    // family drives through its own extracted op.
    const baselineScorePattern =
        'projects/:id/objective-baseline-scores/:sid';
    const actualScorePattern =
        'projects/:id/objective-actual-scores/:sid';
    const scoreRows = buildSeedScoreRows(
        buildScoreSeedProjects(), objectiveMemberPools,
    );
    await Promise.all([
        ...scoreRows.baselines.map(row =>
            postBaselineScoreDocumentOp(
                adapter, row.id, row.fields,
                row.fields.member_id,
                requirePair(
                    pairs,
                    seedPairKey(baselineScorePattern, row.id),
                ),
            )),
        ...scoreRows.actuals.map(row =>
            postActualScoreDocumentOp(
                adapter, row.id, row.fields,
                row.fields.member_id,
                requirePair(
                    pairs,
                    seedPairKey(actualScorePattern, row.id),
                ),
            )),
    ]);
}

export async function postBootstrap(
    adapter: DbAdapter,
): Promise<SeededCredentials> {
    // Pass 1 (no tx): the lone 'current' human-member create's
    // bundle, formed up front — see postMockDataLoad's pass 1 for
    // why (formWritePair's hashing is async crypto, which would
    // auto-commit an IndexedDB transaction early if awaited
    // inside one). Bootstrap's body embeds nowUtc() (there is
    // no fixed seed timestamp here), so it is minted ONCE inside
    // formBootstrapMessagePair and reused verbatim by pass 2
    // below — never a second, independently timestamped body.
    // Task 4: the bundle grows from one pair to three (operation,
    // member document, detail document), the SAME triple every
    // other seeded human-member create forms. Task 5: ALSO forms
    // bootstrap's own membership pair and the system member's own
    // members/:id document pair — the last two raw bootstrap
    // writes, now closed the SAME way postMockDataLoad's own
    // memberships/system-member sites are.
    const {
        body: currentMemberBody,
        pairs: currentMemberPairs,
        membershipPair,
        systemMemberPair,
    } = await formBootstrapMessagePair(nowUtc());
    // Pass 2: seed the pristine bootstrap data in one
    // transaction. Credentials seed after it commits — PBKDF2
    // hashing is ALSO async crypto and cannot run inside the tx.
    // The schema marker stamps LAST so a failed bootstrap leaves
    // the anonymous plane open for retry.
    await adapter.ensureTables(TABLE_NAMES);
    await adapter.transaction(
        TABLE_NAMES,
        (view) => postBootstrapIn(
            view, currentMemberBody, currentMemberPairs,
            membershipPair, systemMemberPair,
        ),
    );
    const creds = await seedHumanCredentials(adapter);
    await adapter.postSchemaCreation();
    return creds;
}

async function postBootstrapIn(
    adapter: DbAdapter,
    currentMemberBody: Record<string, unknown>,
    currentMemberPairs: MemberWritePairs,
    membershipPair: MessagePair,
    systemMemberPair: MessagePair,
): Promise<void> {
    // The pristine seed plants only what the app needs
    // to render its shell: the system actor that authors
    // state events, the current user, and the singleton
    // organization. No Records — an empty Records page is
    // the correct pristine state; sample Records are demo
    // content loaded by postMockDataLoad, not bootstrap.
    await Promise.all([
        // Task 5: the system member's own members/:id row closes
        // the last raw members.put site bootstrap held — driven
        // through postMemberDocumentOp, the SAME op
        // postMockDataLoadIn's own system-member site now rides.
        // Its identities row stays a raw put — the identity
        // spine itself is Phase 9's own scope, untouched here.
        postMemberDocumentOp(
            adapter,
            SYSTEM_MEMBER_ID,
            memberDocumentBodyOf('system'),
            SYSTEM_MEMBER_ID,
            systemMemberPair,
        ),
        adapter.identities.put(SYSTEM_MEMBER_ID, {
            kind: 'service',
        }),
        // Task 5: bootstrap's own membership closes the SAME
        // whole-slice deferral as postMockDataLoadIn's memberships
        // — driven through postMembershipDocumentOp with
        // membershipSeedBody's shared construction.
        postMembershipDocumentOp(
            adapter,
            bootstrapMembershipId,
            membershipSeedBody(STARK_ORGANIZATION, 'current'),
            SYSTEM_MEMBER_ID,
            membershipPair,
        ),
        adapter.identityDefaultOrganizations.put(
            'bootstrap-default-org-current', {
                identity_id: 'current',
                organization_id: STARK_ORGANIZATION,
                at: MOCK_SEED_TIMESTAMP,
            }),
        // The 'current' human member row shares its shape
        // with postMockDataLoadIn's human-member seed —
        // driven through postHumanMemberCreationOp with the
        // explicit actor SYSTEM_MEMBER_ID (the named bootstrap
        // genesis carve-out now exempts only the schema marker —
        // the system member and the membership row closed this
        // task). currentMemberBody is pass 1's frozen body (see
        // postBootstrap) — never rebuilt here, so it can never
        // drift from what currentMemberPairs was hashed from.
        postHumanMemberCreationOp(
            adapter, currentMemberBody,
            SYSTEM_MEMBER_ID, currentMemberPairs,
        ),
        adapter.states.postEvent(
            'bootstrap-system-active',
            SYSTEM_MEMBER_ID,
            'active',
            SYSTEM_MEMBER_ID,
            nowUtc(),
        ),
        adapter.organizations.put(STARK_ORGANIZATION, {
            name: 'Stark Industries',
            domain: 'acmecorp.com',
            next_billing: daysFromNow(300, 0, 0),
            seats: TIER_SEATS_LIMIT,
            projects_limit: TIER_PROJECTS_LIMIT,
            ideas_limit: TIER_IDEAS_LIMIT,
        }),
        adapter.roleGrants.put(
            'bootstrap-role-current-admin', {
                organization_id: STARK_ORGANIZATION,
                identity_id: 'current',
                role: 'admin',
                action: 'granted',
                by_member_id: SYSTEM_MEMBER_ID,
                at: MOCK_SEED_TIMESTAMP,
            },
        ),
    ]);
}
