import type { DbAdapter } from './db.ts';
import { TABLE_NAMES } from './db.ts';
import type {
    ProjectFlowEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    StateEntity,
    StateFieldValueEntity,
    FlowRecordEntity,
    JsonObjectField,
    Id,
} from './types.ts';
import {
    jsonArrayField,
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
    MS_PER_DAY,
    SYSTEM_MEMBER_ID,
    nowUtc,
} from './types.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';
import { hashPassword } from './password-hash.ts';
import {
    daysFromNow,
    isoFromMs,
} from './mock-data/seed-kit.ts';
import {
    MOCK_SEED_TIMESTAMP,
    STARK_ORG,
    ORG_TWO,
    assignOrg,
} from './mock-data/seed-constants.ts';
import {
    generateFlowWorkload,
} from './mock-data/flow-workload.ts';
import type {
    FlowSeedSpec,
    SojournProfile,
    MemberSkill,
} from './mock-data/flow-workload.ts';
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
    l2cProjectId,
    buildProjects,
} from './mock-data/projects.ts';
import {
    OBJECTIVE_SEEDS,
} from './mock-data/objectives.ts';
import {
    customerProfileRecordId,
    projectBriefRecordId,
    buildRecords,
    buildRecordAttributes,
} from './mock-data/records.ts';
import {
    l2cFlowId,
    l2cProjectFlowId,
    l2cTriageNodeId,
    l2cDiscoveryNodeId,
    l2cQualifNodeId,
    l2cProposalNodeId,
    l2cNegotNodeId,
    memberSarah,
    memberMarcus,
    memberJessica,
    memberLisa,
    memberClaude,
    buildLeadToCloseNodes,
    buildLeadToCloseEdges,
    buildLeadToClosePaths,
} from './mock-data/lead-to-close-flow.ts';

const TIER_SEATS_LIMIT = 200;
const TIER_PROJECTS_LIMIT = 50;
const TIER_IDEAS_LIMIT = 1000;

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
    // Seed the whole demo dataset in one transaction, so a
    // mid-seed failure leaves no half-populated schema. The
    // credentials seed runs after it commits — its PBKDF2
    // hashing is async crypto and cannot run inside the tx.
    // The schema marker stamps LAST, so a failed seed leaves
    // hasSchema() false: the datastore reads as empty and the
    // seed can be retried cleanly.
    await adapter.ensureTables(TABLE_NAMES);
    await adapter.transaction(
        TABLE_NAMES,
        (view) => postMockDataLoadIn(view),
    );
    const creds = await seedHumanCredentials(adapter);
    await adapter.postSchemaCreation();
    return creds;
}

async function postMockDataLoadIn(
    adapter: DbAdapter,
): Promise<void> {
    const members = buildMembers();

    await Promise.all([
        ...members.flatMap((member, index) => {
            const {
                id: _id, state: _state, name,
                email, phone, bio,
                strengths, team_dimensions,
                ...detail
            } = member;
            // 'current' (the admin) joins BOTH orgs; every
            // other human is single-org via assignOrg.
            const orgs = member.id === 'current'
                ? [STARK_ORG, ORG_TWO]
                : [assignOrg(index)];
            return [
                adapter.members.put(member.id, {
                    type: 'human',
                }),
                ...orgs.map((org, n) =>
                    adapter.memberships.put(
                        'seed-membership-'
                        + member.id + '-' + n, {
                            organization_id: org,
                            identity_id: member.id,
                            at: MOCK_SEED_TIMESTAMP,
                        })),
                adapter.identityDefaultOrganizations.put(
                    'seed-default-org-' + member.id, {
                        identity_id: member.id,
                        organization_id: orgs[0]!,
                        at: MOCK_SEED_TIMESTAMP,
                    }),
                adapter.humanMembers.put(member.id, {
                    ...detail,
                    strengths:
                        jsonArrayField(strengths),
                    team_dimensions:
                        jsonObjectField(
                            team_dimensions,
                        ),
                }),
                adapter.identities.put(member.id, {
                    kind: 'person',
                }),
                adapter.identityPii.put(member.id, {
                    name,
                    email,
                    phone,
                    bio,
                }),
            ];
        }),
        adapter.members.put(SYSTEM_MEMBER_ID, {
            type: 'system',
        }),
        adapter.identities.put(SYSTEM_MEMBER_ID, {
            kind: 'service',
        }),
        adapter.roleGrants.put(
            'seed-role-current-admin', {
                organization_id: STARK_ORG,
                identity_id: 'current',
                role: 'admin',
                action: 'granted',
                by_member_id: SYSTEM_MEMBER_ID,
                at: MOCK_SEED_TIMESTAMP,
            },
        ),
        adapter.roleGrants.put(
            'seed-role-current-admin-org2', {
                organization_id: ORG_TWO,
                identity_id: 'current',
                role: 'admin',
                action: 'granted',
                by_member_id: SYSTEM_MEMBER_ID,
                at: MOCK_SEED_TIMESTAMP,
            },
        ),
        // Every non-admin human gets the member role in its
        // membership org (same assignOrg(index) partition as
        // the membership seed above), so each seeded sign-in
        // lands on a working content tier — not a 403 wall.
        ...members.flatMap((member, index) =>
            member.id === 'current'
                ? []
                : [adapter.roleGrants.put(
                    'seed-role-' + member.id + '-member', {
                        organization_id: assignOrg(index),
                        identity_id: member.id,
                        role: 'member',
                        action: 'granted',
                        by_member_id: SYSTEM_MEMBER_ID,
                        at: MOCK_SEED_TIMESTAMP,
                    },
                )]),
    ]);

    // Initial member state events. Every seeded
    // member — human or AI — gets one event at
    // creation. The states log is the sole source
    // of member state; the row carries no column.
    const memberStateEvents: StateEntity[] = [
        ...members.map(w => ({
            id: `seed-member-${w.id}-${w.state}`,
            entity_id: w.id,
            state: w.state,
            member_id: SYSTEM_MEMBER_ID,
            at: MOCK_SEED_TIMESTAMP,
        })),
        {
            id: `seed-member-${SYSTEM_MEMBER_ID}-active`,
            entity_id: SYSTEM_MEMBER_ID,
            state: 'active',
            member_id: SYSTEM_MEMBER_ID,
            at: MOCK_SEED_TIMESTAMP,
        },
    ];

    const ideas = buildIdeas();

    await Promise.all([
        ...ideas.map((idea, i) =>
            adapter.ideas.put(idea.id, {
                ...idea, organization_id: assignOrg(i),
            }),
        ),
        adapter.organizations.put(STARK_ORG, {
            name: 'Stark Industries',
            domain: 'acmecorp.com',
            next_billing: daysFromNow(300, 0, 0),
            seats: TIER_SEATS_LIMIT,
            projects_limit: TIER_PROJECTS_LIMIT,
            ideas_limit: TIER_IDEAS_LIMIT,
        }),
        adapter.organizations.put(ORG_TWO, {
            name: 'Wayne Enterprises',
            domain: 'wayne.example.com',
            next_billing: daysFromNow(200, 0, 0),
            seats: TIER_SEATS_LIMIT,
            projects_limit: TIER_PROJECTS_LIMIT,
            ideas_limit: TIER_IDEAS_LIMIT,
        }),
    ]);

    const projects = buildProjects();

    const wfTimestamp = daysFromNow(-60, 9, 0);

    const leadToCloseNodes = buildLeadToCloseNodes();

    const leadToCloseEdges = buildLeadToCloseEdges();

    const mockFlows = buildFlows();

    // The normalized graph truth (F-131): each flow's authored
    // graph literal decomposed into relation rows. These ARE the
    // graph — the GET handlers reassemble it from them; the flow
    // row stores no blob.
    const flowRelations = buildFlowGraphRelations(
        mockFlows, MOCK_SEED_TIMESTAMP,
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

    // Flow ↔ Record bindings. Customer Profile (org '1')
    // is bound to two flows (Customer Onboarding and
    // Lead-to-Close); Project Brief (org '2') is bound to
    // the org-'2' flow so every binding stays within one
    // org. The Layout Test flow is left unbound — it
    // exists to exercise Auto Layout.
    const mockFlowRecords: FlowRecordEntity[] = [
        {
            id: 'frb01CustOnbCustProfA1',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            record_id: customerProfileRecordId,
            at: wfTimestamp,
        },
        {
            id: 'frb02L3adt0ClCustProf2',
            flow_id: l2cFlowId,
            record_id: customerProfileRecordId,
            at: wfTimestamp,
        },
        {
            // Project Brief lives in org '2'
            // (assignOrg(index 1)), so it binds to the
            // org-'2' flow — flowOrg === recordOrg keeps
            // the binding visible behind the org fence.
            id: 'frb03Fus10nPr0jBri3f03',
            flow_id: 'seed-flow-org2',
            record_id: projectBriefRecordId,
            at: wfTimestamp,
        },
    ];

    // One state event per seeded Record — the
    // creation moment of each Record on the states
    // log. Records start at 'active'; subordinate
    // record_attributes hard-splice when the
    // parent is deleted via EntityStore.delete.
    const recordStateEvents: StateEntity[] = [
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

    const woId =
        'wg25b0R2gwy5kYPIhQB6cS';
    const woFlowGraph =
        mockFlows[0]!.graph;
    const woCreated = daysFromNow(-14, 10, 0);
    const woNodeNew =
        'lzkYvFNCEHARBQmZ4YHAn4';
    const woNodeCapture =
        'KoWNvvHG8d3TLAVN5nrWGX';
    const woNodeReview =
        'wDcQp0cIycrtWXEde6IsB1';
    const woNodeComplete =
        '8jSnGiQ4Hedb2G75Y5aT7O';
    const woPersonSarah =
        'LhfaUUf4IumVsCSGB4xjdK';
    const woPersonEmily =
        '53J8h9dr76XFqCjYcNVwIR';
    // Data Capture node members: Marcus and the
    // current user (the in-clan members)
    const woPersonMarcus =
        'WxQn4LVWb76YkmqK5B0EPp';
    const woPersonCurrent = 'current';
    // Parsed once so every seeded WO snapshot
    // matches the live flow_graph shape without
    // 36 redundant JSON.parse calls.
    const woGraphParsed = JSON.parse(
        woFlowGraph,
    ) as { nodes: unknown; edges: unknown };
    function woGraph(): JsonObjectField {
        return jsonObjectField({
            name:
                'Customer Onboarding',
            lockTimeout:
                DEFAULT_LOCK_TIMEOUT,
            nodes: woGraphParsed.nodes,
            edges: woGraphParsed.edges,
        });
    }

    // Parsed once so all prc WO snapshots
    // match the live flow_graph shape.
    const prcFlowGraph =
        mockFlows[2]!.graph;
    const prcGraphParsed = JSON.parse(
        prcFlowGraph,
    ) as { nodes: unknown; edges: unknown };
    function prcGraph(): JsonObjectField {
        return jsonObjectField({
            name:
                'Layout Test: Proposal'
                + ' Review Cycle',
            lockTimeout:
                DEFAULT_LOCK_TIMEOUT,
            nodes: prcGraphParsed.nodes,
            edges: prcGraphParsed.edges,
        });
    }

    const prcNodeStart =
        'qfuFbfKwwlpKAewu3Uujb7';
    const prcNodeDraft =
        'M3HcytVGj8JNjrFS0AyVfA';
    const prcNodeSubmit =
        'T6I6dn4MKD50QZXlvxIm9I';
    const prcNodeTriage =
        'OHPERFEO1EMfDoGZnccF5F';
    const prcNodeQuickRev =
        'NHIpcNdKKV4gbT4QOkkXEO';
    const prcNodeDecision =
        'rWdJ5vz4hm9dLVhBYROSoK';
    const prcNodeApproved =
        '4zi5yzNsiA89SzrcEityhr';
    const prcNodeRevise =
        '8yXx35sqhjAb3lfkSWbsG2';
    const prcNodeArchive =
        '9r0eSQ4ndyaRoYbKTTDpW2';

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

    const mockWorkOrders:
        Omit<WorkOrderEntity, 'organization_id'>[] = [
        {
            id: woId,
            display_id: 'a7c3e1f9',
            flow_graph: jsonObjectField({
                name:
                    'Customer Onboarding',
                lockTimeout:
                    DEFAULT_LOCK_TIMEOUT,
                nodes: JSON.parse(
                    woFlowGraph,
                ).nodes,
                edges: JSON.parse(
                    woFlowGraph,
                ).edges,
            }),
            position: 1,
        },
        // ── happy-path runs (WO02-WO23) ──────────
        // Create → Data Capture → Review → Archive.
        // Sojourn in Data Capture varies 1–9 days
        // with a fat right tail so Data Capture is
        // the hot node in heat stats.
        {
            id: 'kKtX2W0iVTWFPEoPrJmIHW',
            display_id: 'b2d4f6a8',
            flow_graph: woGraph(),
            position: 2,
        },
        {
            id: 'taUp8y0cuMhzf0UOk6Ev8Y',
            display_id: 'c3e5g7b9',
            flow_graph: woGraph(),
            position: 3,
        },
        {
            id: 'KD2WFTEwzJFvxZ6cpCwpvc',
            display_id: 'd4f6h8c0',
            flow_graph: woGraph(),
            position: 4,
        },
        {
            id: 'b6YNHrFyi6V9dJNXyCXu1K',
            display_id: 'e5g7i9d1',
            flow_graph: woGraph(),
            position: 5,
        },
        {
            id: 'V3AXXlSjJwDQAmkNiRA8aP',
            display_id: 'f6h8j0e2',
            flow_graph: woGraph(),
            position: 6,
        },
        {
            id: '9ooK5olzSsEnpgP8ASzBQi',
            display_id: 'g7i9k1f3',
            flow_graph: woGraph(),
            position: 7,
        },
        {
            id: 'cnXN4DZx9dUVIZL4OZnyw0',
            display_id: 'h8j0l2g4',
            flow_graph: woGraph(),
            position: 8,
        },
        {
            id: 'kKw82RQDHRfgg5xQnw1lPk',
            display_id: 'i9k1m3h5',
            flow_graph: woGraph(),
            position: 9,
        },
        {
            id: 'ec0n7Ab6pJYLFDF6H0nyvV',
            display_id: 'j0l2n4i6',
            flow_graph: woGraph(),
            position: 10,
        },
        {
            id: 'gAjJnjirIrIgcFDMJyNsPa',
            display_id: 'k1m3o5j7',
            flow_graph: woGraph(),
            position: 11,
        },
        {
            id: 'kyWtMAZPazKqAfIwPzACsL',
            display_id: 'l2n4p6k8',
            flow_graph: woGraph(),
            position: 12,
        },
        {
            id: 'C41Hni5pMxp8xMQFEGNaib',
            display_id: 'm3o5q7l9',
            flow_graph: woGraph(),
            position: 13,
        },
        {
            id: 'FGAZYYwoS9To1tNb24DfLc',
            display_id: 'n4p6r8m0',
            flow_graph: woGraph(),
            position: 14,
        },
        {
            id: '0zgLwuyPgtreVYjg4TScJR',
            display_id: 'o5q7s9n1',
            flow_graph: woGraph(),
            position: 15,
        },
        {
            id: 'XGJklKFO4aUtjSAEHEE8Zn',
            display_id: 'p6r8t0o2',
            flow_graph: woGraph(),
            position: 16,
        },
        {
            id: 'rtuFD9uWn5zguEHyT3fh8s',
            display_id: 'q7s9u1p3',
            flow_graph: woGraph(),
            position: 17,
        },
        {
            id: 'XrO05MeyqldO8qm0O4VPdq',
            display_id: 'r8t0v2q4',
            flow_graph: woGraph(),
            position: 18,
        },
        {
            id: 'S74N7CPA2dsMESryJNrFAC',
            display_id: 's9u1w3r5',
            flow_graph: woGraph(),
            position: 19,
        },
        {
            id: 'Cr8KZH5Q2j5n8Q8Yw3qdMw',
            display_id: 't0v2x4s6',
            flow_graph: woGraph(),
            position: 20,
        },
        {
            id: '4T56gYme7ae4Ya7AMA0hpW',
            display_id: 'u1w3y5t7',
            flow_graph: woGraph(),
            position: 21,
        },
        {
            id: 'aFCyJrvokoJM5iINwO3WCf',
            display_id: 'v2x4z6u8',
            flow_graph: woGraph(),
            position: 22,
        },
        {
            id: 'Sr4k75y6vuKODCA9zlSUjk',
            display_id: 'w3y5a7v9',
            flow_graph: woGraph(),
            position: 23,
        },
        // ── needs-revision loops (WO24-WO29) ─────
        // … → Data Capture → Review → Data Capture
        // → Review → Archive. Exercises revisit
        // rate and the Review→Capture branch split.
        {
            id: 'Mm6KUpykGSwjD7YofI6zpb',
            display_id: 'x4z6b8w0',
            flow_graph: woGraph(),
            position: 24,
        },
        {
            id: 'BbZ3Z7OZnFmdF5MBgVIYzI',
            display_id: 'y5a7c9x1',
            flow_graph: woGraph(),
            position: 25,
        },
        {
            id: 'NydsTqMmCgEKI7R9xxp36g',
            display_id: 'z6b8d0y2',
            flow_graph: woGraph(),
            position: 26,
        },
        {
            id: 'x2uQev3HutthrUWRFkXSkH',
            display_id: 'a7c9e1z3',
            flow_graph: woGraph(),
            position: 27,
        },
        {
            id: 'w7XA9UnuYI7e46RTQL1xGW',
            display_id: 'b8d0f2a4',
            flow_graph: woGraph(),
            position: 28,
        },
        {
            id: '3H3XeeNE4rS2wbANs3JvYz',
            display_id: 'c9e1g3b5',
            flow_graph: woGraph(),
            position: 29,
        },
        // in-flight runs (WO30-WO34):
        // Last transition lands in Data Capture or
        // Review with no Archive; exercises WIP and
        // incompleteWorkOrderCount.
        {
            id: 'i7YYgKN3ZUlrkulQ2aWdIE',
            display_id: 'd0f2h4c6',
            flow_graph: woGraph(),
            position: 30,
        },
        {
            id: '0brjvcoPEVBwMkUQ3tKHWc',
            display_id: 'e1g3i5d7',
            flow_graph: woGraph(),
            position: 31,
        },
        {
            id: 'mTdhglHhl7pM0mKt0M2IjF',
            display_id: 'f2h4j6e8',
            flow_graph: woGraph(),
            position: 32,
        },
        {
            id: 'GMhfH8lMQJXzE4vkjnSH1u',
            display_id: 'g3i5k7f9',
            flow_graph: woGraph(),
            position: 33,
        },
        {
            id: 'pLxCFGOINXVaXmrS0VG0vC',
            display_id: 'h4j6l8g0',
            flow_graph: woGraph(),
            position: 34,
        },
        // ── out-of-clan runs (WO35-WO36) ─────────
        // OUT-transition from Data Capture is by
        // Sarah or Mike — neither is among that
        // node's members, so topProducer.inCurrentClan
        // is false.
        {
            id: 'IyrpZrIl2hbmmnCtiifEGm',
            display_id: 'i5k7m9h1',
            flow_graph: woGraph(),
            position: 35,
        },
        {
            id: 'zYnDWBV4VP5guzW5fDWtHN',
            display_id: 'j6l8n0i2',
            flow_graph: woGraph(),
            position: 36,
        },
        // old runs (WO37-WO38):
        // Created ~105 days ago, outside the
        // trailing-90-day stats window — so heat
        // values for their node visits are clipped.
        {
            id: '7HX7RPwlYopHWfD7I0QAPs',
            display_id: 'k7m9o1j3',
            flow_graph: woGraph(),
            position: 37,
        },
        {
            id: 'EXphSopBU1Is2TH4QZo4nO',
            display_id: 'l8n0p2k4',
            flow_graph: woGraph(),
            position: 38,
        },
        // Proposal Review Cycle (prc01-prc06):
        // second flow demo -- 4 happy-path, 1
        // revisit, 1 in-flight.
        {
            id: 'hRPNkjrYBTQqzzFe1t8FH6',
            display_id: '5tb2nOoHyhRpy3UHlyrJKl',
            flow_graph: prcGraph(),
            position: 39,
        },
        {
            id: 'L3UhOvrAGluk4kNnN6J8NT',
            display_id: 'ZifylnGqzY8uXQ30d1DgeP',
            flow_graph: prcGraph(),
            position: 40,
        },
        {
            id: 'oTscblsEOjZDkvkW3vs7rU',
            display_id: 'IoF2qGX8bftkrW4QrLnBwp',
            flow_graph: prcGraph(),
            position: 41,
        },
        {
            id: 'Xpw9VGpZ6RyevuInSr8yze',
            display_id: '3eC66vpxib66qPnv7hdxvJ',
            flow_graph: prcGraph(),
            position: 42,
        },
        // prc05: revisit -- Decision sends back
        // to Revise then Draft before completing.
        {
            id: 'yqPpJb0NoQDgx8DoZ183Nx',
            display_id: 'tmj4YM3W8H1qgr4sUIpY35',
            flow_graph: prcGraph(),
            position: 43,
        },
        // prc06: in-flight -- stuck at Decision.
        {
            id: 'BUrGEVDMF6FeU35WUHUY5E',
            display_id: 'Tb52zOWUVGcaSQRFSLDXPV',
            flow_graph: prcGraph(),
            position: 44,
        },
        // Gate violation case: sits at Create with
        // no values captured. The next transition
        // to Data Capture must trip the property-
        // test gate on Company Name + Contact
        // Email (both Required, both null) — the
        // reachable browser-testing case.
        {
            id: 'gateV101W0rkOrd3rXY0a1',
            display_id: 'gate0001',
            flow_graph: woGraph(),
            position: 45,
        },
    ];

    const mockFlowWorkOrders:
        FlowWorkOrderEntity[] = [
        {
            id: 'Cc7LblYXfmmZpg8DLZmhVw',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id: woId,
            at: woCreated,
        },
        // happy-path
        {
            id: 'l1QwKaS2EYCT8nJCAFXXN0',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'kKtX2W0iVTWFPEoPrJmIHW',
            at: daysFromNow(-88, 9, 0),
        },
        {
            id: 'FjjhKDthEYLf50lmPrKkaq',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'taUp8y0cuMhzf0UOk6Ev8Y',
            at: daysFromNow(-82, 10, 0),
        },
        {
            id: 'vNj3XdrWhDpoFW8qsLsqKg',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'KD2WFTEwzJFvxZ6cpCwpvc',
            at: daysFromNow(-76, 8, 30),
        },
        {
            id: 'hjPgB0KYD5Sesnjejnohf6',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'b6YNHrFyi6V9dJNXyCXu1K',
            at: daysFromNow(-71, 9, 0),
        },
        {
            id: 'UhSuMtC66uclQH5irfsqd0',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'V3AXXlSjJwDQAmkNiRA8aP',
            at: daysFromNow(-66, 11, 0),
        },
        {
            id: 'J0GfRrP7J5tNhBDCXDDOPV',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                '9ooK5olzSsEnpgP8ASzBQi',
            at: daysFromNow(-61, 9, 30),
        },
        {
            id: 'nULvK3MsVfud7QkAlrNGpQ',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'cnXN4DZx9dUVIZL4OZnyw0',
            at: daysFromNow(-57, 8, 0),
        },
        {
            id: 'NUnAiiPpzpQ9wKx6utsGwn',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'kKw82RQDHRfgg5xQnw1lPk',
            at: daysFromNow(-52, 10, 0),
        },
        {
            id: 'tuqFkKJMD4baNSMgXFWIh3',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'ec0n7Ab6pJYLFDF6H0nyvV',
            at: daysFromNow(-48, 9, 0),
        },
        {
            id: 'G1IeM0YcxnPVe8ZuYnJ9oJ',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'gAjJnjirIrIgcFDMJyNsPa',
            at: daysFromNow(-44, 10, 30),
        },
        {
            id: '5Ctl6blp1xESHHiQtp0hUU',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'kyWtMAZPazKqAfIwPzACsL',
            at: daysFromNow(-40, 9, 0),
        },
        {
            id: 'tlNTceD8uVvWlIjXDH0ayW',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'C41Hni5pMxp8xMQFEGNaib',
            at: daysFromNow(-37, 8, 0),
        },
        {
            id: 'RUF1gVmAhswD070VXbltZj',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'FGAZYYwoS9To1tNb24DfLc',
            at: daysFromNow(-33, 9, 30),
        },
        {
            id: 's8LTGragbMejtSAdAVF1u3',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                '0zgLwuyPgtreVYjg4TScJR',
            at: daysFromNow(-29, 10, 0),
        },
        {
            id: 'IAEG9nJXxCFzya2R3z9Rzy',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'XGJklKFO4aUtjSAEHEE8Zn',
            at: daysFromNow(-26, 9, 0),
        },
        {
            id: 'c1BsfY0187lX0bv9IMRin6',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'rtuFD9uWn5zguEHyT3fh8s',
            at: daysFromNow(-23, 8, 30),
        },
        {
            id: 'HdDAafhVYetmEDZI57F2o9',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'XrO05MeyqldO8qm0O4VPdq',
            at: daysFromNow(-20, 10, 0),
        },
        {
            id: 'yFhQ6jemy8OUls9GCH9sJq',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'S74N7CPA2dsMESryJNrFAC',
            at: daysFromNow(-17, 9, 0),
        },
        {
            id: 'C7ASzGoDhS3c9Er43SznuQ',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'Cr8KZH5Q2j5n8Q8Yw3qdMw',
            at: daysFromNow(-14, 8, 0),
        },
        {
            id: 'gj9UFVp6N0LY43tiZO7kEH',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                '4T56gYme7ae4Ya7AMA0hpW',
            at: daysFromNow(-11, 10, 30),
        },
        {
            id: 'QXnnDlwCXKN12k4oUPse4B',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'aFCyJrvokoJM5iINwO3WCf',
            at: daysFromNow(-9, 9, 0),
        },
        {
            id: 'hyC8PMVNYng3UIO93yexAR',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'Sr4k75y6vuKODCA9zlSUjk',
            at: daysFromNow(-6, 11, 0),
        },
        // needs-revision
        {
            id: '9lPGvmt7DdS6Uy7RuOYCxZ',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            at: daysFromNow(-77, 9, 0),
        },
        {
            id: 'w9t0kM5OR9xNz8Qd8YMvWd',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'BbZ3Z7OZnFmdF5MBgVIYzI',
            at: daysFromNow(-63, 10, 0),
        },
        {
            id: 'OynJa34EkAifV6XvROGJHO',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'NydsTqMmCgEKI7R9xxp36g',
            at: daysFromNow(-50, 8, 30),
        },
        {
            id: 'hFaKVhqcwwCtiDmjHOhglF',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'x2uQev3HutthrUWRFkXSkH',
            at: daysFromNow(-38, 9, 0),
        },
        {
            id: 'lJalI8qDpdF8zng1mr7dkW',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'w7XA9UnuYI7e46RTQL1xGW',
            at: daysFromNow(-25, 10, 0),
        },
        {
            id: 'UFSLHfELrPhlOvdaQv8yrC',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                '3H3XeeNE4rS2wbANs3JvYz',
            at: daysFromNow(-12, 9, 30),
        },
        // in-flight
        {
            id: 'U0vPeW2wXXSwUQ1IWSxa2O',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'i7YYgKN3ZUlrkulQ2aWdIE',
            at: daysFromNow(-18, 9, 0),
        },
        {
            id: 'uhMESfwESpe11vhqKvQ2kB',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                '0brjvcoPEVBwMkUQ3tKHWc',
            at: daysFromNow(-10, 10, 0),
        },
        {
            id: 'ZNrxNuiqHTULou4TqYPtXL',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'mTdhglHhl7pM0mKt0M2IjF',
            at: daysFromNow(-7, 8, 0),
        },
        {
            id: '5AsLDAhvbkXZ6OUvvoZhND',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'GMhfH8lMQJXzE4vkjnSH1u',
            at: daysFromNow(-4, 9, 0),
        },
        {
            id: 'avduZh1Hyokc9xiUjDQA0F',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'pLxCFGOINXVaXmrS0VG0vC',
            at: daysFromNow(-2, 11, 0),
        },
        // out-of-clan
        {
            id: 'XeHGIWNzurFqBqHkQqV6El',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'IyrpZrIl2hbmmnCtiifEGm',
            at: daysFromNow(-35, 9, 0),
        },
        {
            id: 'jxMN634ymWUYVZQK5on62x',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'zYnDWBV4VP5guzW5fDWtHN',
            at: daysFromNow(-22, 10, 30),
        },
        // old (outside 90-day window)
        {
            id: 'ChEQk8m36NL0ADf6Nfez5f',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                '7HX7RPwlYopHWfD7I0QAPs',
            at: daysFromNow(-108, 9, 0),
        },
        {
            id: 'nycbBiutlHj1MUnI02Pw20',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'EXphSopBU1Is2TH4QZo4nO',
            at: daysFromNow(-103, 10, 0),
        },
        // prc join rows (Proposal Review Cycle)
        {
            id: '1MMz7BIQ0qgacH3CCUafKk',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            at: daysFromNow(-60, 9, 0),
        },
        {
            id: 'UXIU5zCYBFkQnMnChd1Q6T',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            at: daysFromNow(-45, 10, 0),
        },
        {
            id: 'jQUWpOW1y7QcYSS49Cy3dE',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'oTscblsEOjZDkvkW3vs7rU',
            at: daysFromNow(-30, 8, 0),
        },
        {
            id: 'y9Aba8YosD7VcSMV2Ncwoc',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            at: daysFromNow(-20, 11, 0),
        },
        {
            id: 'RKSovIx9Jb03ZHsLWpI1EC',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            at: daysFromNow(-15, 9, 0),
        },
        {
            id: 'XAQNINxgYd6Ngjv06NztQh',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'BUrGEVDMF6FeU35WUHUY5E',
            at: daysFromNow(-5, 10, 0),
        },
        {
            id: 'gvFW01gateV101CustOnb1',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'gateV101W0rkOrd3rXY0a1',
            at: daysFromNow(-1, 9, 0),
        },
    ];

    const mockStateEvents:
        StateEntity[] = [
        {
            id: '9nP0K7FVlCFps3eqMnbnMU',
            entity_id: woId,
            state: woNodeNew,
            member_id: woPersonSarah,
            at:
                woCreated,
        },
        {
            id: 'MbiHcJxVA5Tde3oBh3Ka8p',
            entity_id: woId,
            state: woNodeCapture,
            member_id: woPersonSarah,
            at:
                woCreated,
        },
        {
            id: 'eJEybxfXaf3sjwFilZnunU',
            entity_id: woId,
            state: woNodeReview,
            member_id: woPersonEmily,
            at:
                daysFromNow(-13, 14, 30),
        },
        {
            id: 'C2xb2bbjyHD11WfLayh8Om',
            entity_id: woId,
            state:
                woNodeComplete,
            member_id: woPersonSarah,
            at:
                daysFromNow(-12, 9, 15),
        },
        // happy-path WO02: Data Capture sojourn 1 day
        {
            id: '6eT1jG5MoR9A5PvRvgCUBq',
            entity_id:
                'kKtX2W0iVTWFPEoPrJmIHW',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-88, 9, 0),
        },
        {
            id: 'MEsinaVfIifb90ByaJBjrp',
            entity_id:
                'kKtX2W0iVTWFPEoPrJmIHW',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-88, 9, 5),
        },
        {
            id: 'xI5NDQXN8Ns5oe0XeEPX2o',
            entity_id:
                'kKtX2W0iVTWFPEoPrJmIHW',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-87, 10, 0),
        },
        {
            id: 'k4yValdb0nLdwsZdgvuwtq',
            entity_id:
                'kKtX2W0iVTWFPEoPrJmIHW',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-85, 14, 0),
        },
        // happy-path WO03: Data Capture sojourn 2 days
        {
            id: 'rAnt2MH37Zm1uvaDdJQIU7',
            entity_id:
                'taUp8y0cuMhzf0UOk6Ev8Y',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-82, 10, 0),
        },
        {
            id: 'VwD21aMsYlSZ91oOeKoQv3',
            entity_id:
                'taUp8y0cuMhzf0UOk6Ev8Y',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-82, 10, 8),
        },
        {
            id: 'lntXIDCTtC6uXtkanv5XYm',
            entity_id:
                'taUp8y0cuMhzf0UOk6Ev8Y',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-80, 11, 0),
        },
        {
            id: 'oSOuQpIKaTo9TU70OtfU8P',
            entity_id:
                'taUp8y0cuMhzf0UOk6Ev8Y',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-79, 9, 0),
        },
        // happy-path WO04: Data Capture sojourn 3 days
        {
            id: 'ggJA4BZvTpqxEPkgbiNnyt',
            entity_id:
                'KD2WFTEwzJFvxZ6cpCwpvc',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-76, 8, 30),
        },
        {
            id: 'LzLQkGqfrjFNaQIQNVp2yt',
            entity_id:
                'KD2WFTEwzJFvxZ6cpCwpvc',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-76, 8, 40),
        },
        {
            id: 'ZpwjIdExxdeZP7m5YDH5Qt',
            entity_id:
                'KD2WFTEwzJFvxZ6cpCwpvc',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-73, 10, 0),
        },
        {
            id: 'ZdoF8Ka2fa6xFFdzWi3odO',
            entity_id:
                'KD2WFTEwzJFvxZ6cpCwpvc',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-71, 15, 0),
        },
        // happy-path WO05: Data Capture sojourn 1 day
        {
            id: 'IJKj026ouhbUQv7w4y7V7o',
            entity_id:
                'b6YNHrFyi6V9dJNXyCXu1K',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-71, 9, 0),
        },
        {
            id: 'g4q1KxVqvyS8ZxOIDnu4MG',
            entity_id:
                'b6YNHrFyi6V9dJNXyCXu1K',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-71, 9, 10),
        },
        {
            id: '6kwY7EJsL4khehGbJmS9YV',
            entity_id:
                'b6YNHrFyi6V9dJNXyCXu1K',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-70, 14, 0),
        },
        {
            id: 'zK2ywEqCxPE75HKfGdGtEY',
            entity_id:
                'b6YNHrFyi6V9dJNXyCXu1K',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-68, 10, 0),
        },
        // happy-path WO06: Data Capture sojourn 5 days
        {
            id: '3lD2Yf5csm1zBR9vdGnnh2',
            entity_id:
                'V3AXXlSjJwDQAmkNiRA8aP',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-66, 11, 0),
        },
        {
            id: 'Kqw1IND5JwmUemrbWDKSg1',
            entity_id:
                'V3AXXlSjJwDQAmkNiRA8aP',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-66, 11, 12),
        },
        {
            id: '8fuCWUtGDYOCBszoGuYhNZ',
            entity_id:
                'V3AXXlSjJwDQAmkNiRA8aP',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-61, 9, 0),
        },
        {
            id: 'vqxo8lToEgDdEItcJg8GMI',
            entity_id:
                'V3AXXlSjJwDQAmkNiRA8aP',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-59, 14, 0),
        },
        // happy-path WO07: Data Capture sojourn 2 days
        {
            id: 'DkCRDYtzbHbaGZY45hrIrB',
            entity_id:
                '9ooK5olzSsEnpgP8ASzBQi',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-61, 9, 30),
        },
        {
            id: 'g7Fnaud4XIGM4bceFOFtim',
            entity_id:
                '9ooK5olzSsEnpgP8ASzBQi',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-61, 9, 45),
        },
        {
            id: 'gdnClJs1LLxrx2fvZ3vQQ4',
            entity_id:
                '9ooK5olzSsEnpgP8ASzBQi',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-59, 11, 0),
        },
        {
            id: 'WT4tD5XUmDdh40hI5Ny17B',
            entity_id:
                '9ooK5olzSsEnpgP8ASzBQi',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-58, 9, 0),
        },
        // happy-path WO08: Data Capture sojourn 4 days
        {
            id: 'hKpS4YMC7r7PivyHgc2Swa',
            entity_id:
                'cnXN4DZx9dUVIZL4OZnyw0',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-57, 8, 0),
        },
        {
            id: 'hhTvFksUIDQyQA401xmNXg',
            entity_id:
                'cnXN4DZx9dUVIZL4OZnyw0',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-57, 8, 15),
        },
        {
            id: 'mAOQLPzk3Ud64ndZnbjMPB',
            entity_id:
                'cnXN4DZx9dUVIZL4OZnyw0',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-53, 10, 0),
        },
        {
            id: 'qMAn5oFts3CEnMsqbNYPA8',
            entity_id:
                'cnXN4DZx9dUVIZL4OZnyw0',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-51, 14, 0),
        },
        // happy-path WO09: Data Capture sojourn 7 days (fat tail)
        {
            id: 'KcxCc7AQLnNZddDwJ8YMOu',
            entity_id:
                'kKw82RQDHRfgg5xQnw1lPk',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-52, 10, 0),
        },
        {
            id: 'HM3YTTlopkJetDhpXglt3l',
            entity_id:
                'kKw82RQDHRfgg5xQnw1lPk',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-52, 10, 20),
        },
        {
            id: 'ZXc0n8qwamt9gjeXFZYPYQ',
            entity_id:
                'kKw82RQDHRfgg5xQnw1lPk',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-45, 9, 0),
        },
        {
            id: 'h4s2ZGnlkiHKTB41nfKXzR',
            entity_id:
                'kKw82RQDHRfgg5xQnw1lPk',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-43, 11, 0),
        },
        // happy-path WO10: Data Capture sojourn 3 days
        {
            id: 'i13zOn0NJF0wZANpm9qtz8',
            entity_id:
                'ec0n7Ab6pJYLFDF6H0nyvV',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-48, 9, 0),
        },
        {
            id: 'hSuu3PNyZ6vzzQRse3MT2y',
            entity_id:
                'ec0n7Ab6pJYLFDF6H0nyvV',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-48, 9, 10),
        },
        {
            id: 'f78pCgCBuvzSIHNSiksOY3',
            entity_id:
                'ec0n7Ab6pJYLFDF6H0nyvV',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-45, 14, 0),
        },
        {
            id: 'FHTXZEVfwmd8eXb3Kc4iyn',
            entity_id:
                'ec0n7Ab6pJYLFDF6H0nyvV',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-43, 10, 0),
        },
        // happy-path WO11: Data Capture sojourn 2 days
        {
            id: '4tXtqSAncDHgMSfj292vLB',
            entity_id:
                'gAjJnjirIrIgcFDMJyNsPa',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-44, 10, 30),
        },
        {
            id: 'EuTRGmhwi9ZKpu4bICyIAA',
            entity_id:
                'gAjJnjirIrIgcFDMJyNsPa',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-44, 10, 45),
        },
        {
            id: 'SShq2HjeSjOa2tDzITkJHj',
            entity_id:
                'gAjJnjirIrIgcFDMJyNsPa',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-42, 11, 0),
        },
        {
            id: 'CgSA6m6TcjUwqAgugKt4U2',
            entity_id:
                'gAjJnjirIrIgcFDMJyNsPa',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-41, 14, 0),
        },
        // happy-path WO12: Data Capture sojourn 6 days (fat tail)
        {
            id: 'YIZ38Dgl4BXjhVyOlXnevi',
            entity_id:
                'kyWtMAZPazKqAfIwPzACsL',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-40, 9, 0),
        },
        {
            id: 'lx7EAKYYTwDEsOA0CTRXbz',
            entity_id:
                'kyWtMAZPazKqAfIwPzACsL',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-40, 9, 15),
        },
        {
            id: '47p7RbBeyj6gq7UoglbTLQ',
            entity_id:
                'kyWtMAZPazKqAfIwPzACsL',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-34, 10, 0),
        },
        {
            id: 'TMBYhhOKzYesHHiHsNXfMH',
            entity_id:
                'kyWtMAZPazKqAfIwPzACsL',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-32, 9, 0),
        },
        // happy-path WO13: Data Capture sojourn 1 day
        {
            id: 'VZsA9htg9Km4qLsfhRGETg',
            entity_id:
                'C41Hni5pMxp8xMQFEGNaib',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-37, 8, 0),
        },
        {
            id: 'Er9sQyVEvd6rSbmH2tC6zc',
            entity_id:
                'C41Hni5pMxp8xMQFEGNaib',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-37, 8, 10),
        },
        {
            id: 'QGs5QdbV9ANQf2reuiemRd',
            entity_id:
                'C41Hni5pMxp8xMQFEGNaib',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-36, 11, 0),
        },
        {
            id: 'nx5ooiuS68Mvj63uuuFpQN',
            entity_id:
                'C41Hni5pMxp8xMQFEGNaib',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-35, 14, 0),
        },
        // happy-path WO14: Data Capture sojourn 9 days (fat tail)
        {
            id: 'f2v27lmnpRGtYQxQ9omyeZ',
            entity_id:
                'FGAZYYwoS9To1tNb24DfLc',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-33, 9, 30),
        },
        {
            id: 'GIJUAabpi1KGevTrAzXirD',
            entity_id:
                'FGAZYYwoS9To1tNb24DfLc',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-33, 9, 45),
        },
        {
            id: '6r9REsvwOdW8DqriF2g76f',
            entity_id:
                'FGAZYYwoS9To1tNb24DfLc',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-24, 10, 0),
        },
        {
            id: 'Q56P9URSLJfpKaSMBejDla',
            entity_id:
                'FGAZYYwoS9To1tNb24DfLc',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-22, 9, 0),
        },
        // happy-path WO15: Data Capture sojourn 2 days
        {
            id: '7Qg7wrpNWmoTHlSPoXJrMm',
            entity_id:
                '0zgLwuyPgtreVYjg4TScJR',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-29, 10, 0),
        },
        {
            id: 'TFj780SI0g7CP9d1nO1mjy',
            entity_id:
                '0zgLwuyPgtreVYjg4TScJR',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-29, 10, 15),
        },
        {
            id: 'Ly9CvZo9IA5JS77ETKKtRj',
            entity_id:
                '0zgLwuyPgtreVYjg4TScJR',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-27, 14, 0),
        },
        {
            id: 'aWPQp3IBWqWnaqr45BhMba',
            entity_id:
                '0zgLwuyPgtreVYjg4TScJR',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-25, 10, 0),
        },
        // happy-path WO16: Data Capture sojourn 3 days
        {
            id: 'BKqz7auwaCm7bYitQ1V0yG',
            entity_id:
                'XGJklKFO4aUtjSAEHEE8Zn',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-26, 9, 0),
        },
        {
            id: 'eReG7OzD6HyZ2ywVP6K7Ac',
            entity_id:
                'XGJklKFO4aUtjSAEHEE8Zn',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-26, 9, 12),
        },
        {
            id: 'f1bm18FOcYixT5prK2pCcV',
            entity_id:
                'XGJklKFO4aUtjSAEHEE8Zn',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-23, 11, 0),
        },
        {
            id: 'MqxWBCMVJOc0RfEXCEUiEo',
            entity_id:
                'XGJklKFO4aUtjSAEHEE8Zn',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-21, 14, 0),
        },
        // happy-path WO17: Data Capture sojourn 1 day
        {
            id: 'G83ZLOMIsgg486X9QDNXvC',
            entity_id:
                'rtuFD9uWn5zguEHyT3fh8s',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-23, 8, 30),
        },
        {
            id: '6FaR1TmuHJgxw7KW1g8sbf',
            entity_id:
                'rtuFD9uWn5zguEHyT3fh8s',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-23, 8, 42),
        },
        {
            id: 'qsNwh43wdaGqGjeKeaAeh4',
            entity_id:
                'rtuFD9uWn5zguEHyT3fh8s',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-22, 10, 0),
        },
        {
            id: '7j8VyPb3kuq8TNVz0iPP9M',
            entity_id:
                'rtuFD9uWn5zguEHyT3fh8s',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-21, 9, 0),
        },
        // happy-path WO18: Data Capture sojourn 4 days
        {
            id: 'cEd2hUuCY4EOandCCx6bQX',
            entity_id:
                'XrO05MeyqldO8qm0O4VPdq',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-20, 10, 0),
        },
        {
            id: 'ZywDPM0MCJeweinimZA6wH',
            entity_id:
                'XrO05MeyqldO8qm0O4VPdq',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-20, 10, 18),
        },
        {
            id: 'G5LYG1yT8213GM9zfqqKmU',
            entity_id:
                'XrO05MeyqldO8qm0O4VPdq',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-16, 9, 0),
        },
        {
            id: 'GUjeLpcj82NtxqFH0gcjtB',
            entity_id:
                'XrO05MeyqldO8qm0O4VPdq',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-14, 14, 0),
        },
        // happy-path WO19: Data Capture sojourn 8 days (fat tail)
        {
            id: '8woeY7cfbuSKMFI4wMrQZH',
            entity_id:
                'S74N7CPA2dsMESryJNrFAC',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-17, 9, 0),
        },
        {
            id: 'OJ5bx5CPsfeb8A1ieKyeQ7',
            entity_id:
                'S74N7CPA2dsMESryJNrFAC',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-17, 9, 20),
        },
        {
            id: 'uQQcXyLLxrVFiydl7FCGOZ',
            entity_id:
                'S74N7CPA2dsMESryJNrFAC',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-9, 10, 0),
        },
        {
            id: 'L1hWSVRmSjhvzoQUPDDhMc',
            entity_id:
                'S74N7CPA2dsMESryJNrFAC',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-7, 14, 0),
        },
        // happy-path WO20: Data Capture sojourn 2 days
        {
            id: 'ZNE2sS8KyRpIzMAq7lR4uA',
            entity_id:
                'Cr8KZH5Q2j5n8Q8Yw3qdMw',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-14, 8, 0),
        },
        {
            id: 'ahjiruKeA9qdnMDO4TZf39',
            entity_id:
                'Cr8KZH5Q2j5n8Q8Yw3qdMw',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-14, 8, 15),
        },
        {
            id: '7ZtemWfFZOqf9SuQVzUwp6',
            entity_id:
                'Cr8KZH5Q2j5n8Q8Yw3qdMw',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-12, 11, 0),
        },
        {
            id: 'w36jEVysbnbIdaPhjIcvDI',
            entity_id:
                'Cr8KZH5Q2j5n8Q8Yw3qdMw',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-10, 9, 0),
        },
        // happy-path WO21: Data Capture sojourn 3 days
        {
            id: 'SSLVclkfoa6nJhoffBS2Zm',
            entity_id:
                '4T56gYme7ae4Ya7AMA0hpW',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-11, 10, 30),
        },
        {
            id: 'mSCE3Z6y5RpTb74TEW62ky',
            entity_id:
                '4T56gYme7ae4Ya7AMA0hpW',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-11, 10, 48),
        },
        {
            id: 'smCeF7cSnQQaysWwJPsiTu',
            entity_id:
                '4T56gYme7ae4Ya7AMA0hpW',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-8, 14, 0),
        },
        {
            id: 'KFrDOkEJ3SiUVB3OR29ntN',
            entity_id:
                '4T56gYme7ae4Ya7AMA0hpW',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-6, 10, 0),
        },
        // happy-path WO22: Data Capture sojourn 1 day
        {
            id: 'fwVQwEUQ8xG4McvCnNVFIV',
            entity_id:
                'aFCyJrvokoJM5iINwO3WCf',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-9, 9, 0),
        },
        {
            id: 'UlPzcQK7dJWr6sLiV7qvfh',
            entity_id:
                'aFCyJrvokoJM5iINwO3WCf',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-9, 9, 10),
        },
        {
            id: 'aicMwA0QmZUEzeUtlmQOOS',
            entity_id:
                'aFCyJrvokoJM5iINwO3WCf',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-8, 10, 0),
        },
        {
            id: 'ADeYyyUb4p3eknFC5v6nW2',
            entity_id:
                'aFCyJrvokoJM5iINwO3WCf',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-7, 9, 0),
        },
        // happy-path WO23: Data Capture sojourn 2 days
        {
            id: 'DANvBctxus8NEMcTOUy1hi',
            entity_id:
                'Sr4k75y6vuKODCA9zlSUjk',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-6, 11, 0),
        },
        {
            id: '3EOMPhhyYNW6pY6LnIegUt',
            entity_id:
                'Sr4k75y6vuKODCA9zlSUjk',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-6, 11, 15),
        },
        {
            id: 'CYglhrk5PKScZSwHQX65Ss',
            entity_id:
                'Sr4k75y6vuKODCA9zlSUjk',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-4, 9, 0),
        },
        {
            id: 'hVa7HADjYHSSsW2qxPPzTw',
            entity_id:
                'Sr4k75y6vuKODCA9zlSUjk',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-2, 14, 0),
        },
        // needs-revision WO24: double loop Data Capture->Review->Data Capture
        // twice, creating a 3rd distinct completed path
        {
            id: 'jNY1G5bpJ6aXd9s8hgqRtN',
            entity_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-77, 9, 0),
        },
        {
            id: 'dHUzDlpmED6x7Hv24kR2nB',
            entity_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-77, 9, 10),
        },
        {
            id: '0LxzRUVeucbfu95bWGkq75',
            entity_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-75, 11, 0),
        },
        {
            id: 'CiXBfp5CJ8ZAWNahki1Cu8',
            entity_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-74, 14, 0),
        },
        {
            id: 'wGVP4JjVdAS6FtQrhTGrC7',
            entity_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-73, 10, 0),
        },
        {
            id: 'caS4tLtoEUOaPLr2VUxScZ',
            entity_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-72, 14, 0),
        },
        {
            id: 'bQsLuRYpBTppyQtdZqtR5L',
            entity_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-71, 10, 0),
        },
        {
            id: 'eKFDk2YAO7K93hcrnIveru',
            entity_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-70, 9, 0),
        },
        // needs-revision WO25: loops Data Capture->Review->Data Capture
        {
            id: '0Zmtiyp7rFFameCdQwawr7',
            entity_id:
                'BbZ3Z7OZnFmdF5MBgVIYzI',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-63, 10, 0),
        },
        {
            id: 'lvvaw4Yx5lJnHZoLB3fQqI',
            entity_id:
                'BbZ3Z7OZnFmdF5MBgVIYzI',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-63, 10, 15),
        },
        {
            id: 'NkrcEkNWD9bu9ntBee8JnO',
            entity_id:
                'BbZ3Z7OZnFmdF5MBgVIYzI',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-61, 14, 0),
        },
        {
            id: 'H7PRtRrjeAoPlty7IxnTTF',
            entity_id:
                'BbZ3Z7OZnFmdF5MBgVIYzI',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-60, 22, 0),
        },
        {
            id: 'Xjy85N6xcsUc0dCe49kC1h',
            entity_id:
                'BbZ3Z7OZnFmdF5MBgVIYzI',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-59, 14, 0),
        },
        {
            id: '3IwmCFVLZn4y18iTwydMpO',
            entity_id:
                'BbZ3Z7OZnFmdF5MBgVIYzI',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-58, 9, 0),
        },
        // needs-revision WO26: loops Data Capture->Review->Data Capture
        {
            id: '993Ka1UzsvcerLiBQkW8nn',
            entity_id:
                'NydsTqMmCgEKI7R9xxp36g',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-50, 8, 30),
        },
        {
            id: 'EIo4tqqUH9XBmTxLKQa3wY',
            entity_id:
                'NydsTqMmCgEKI7R9xxp36g',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-50, 8, 45),
        },
        {
            id: 'Q05vkdZMSIHF8dFhFdu2T9',
            entity_id:
                'NydsTqMmCgEKI7R9xxp36g',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-48, 11, 0),
        },
        {
            id: 'f4raRzWhac1d0qfMW4bHCo',
            entity_id:
                'NydsTqMmCgEKI7R9xxp36g',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-47, 14, 0),
        },
        {
            id: '8lTjUXAaJGsmi28M5VvnEs',
            entity_id:
                'NydsTqMmCgEKI7R9xxp36g',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-46, 10, 0),
        },
        {
            id: 'GNbLd7I9sqHDpu4xKbBdjV',
            entity_id:
                'NydsTqMmCgEKI7R9xxp36g',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-44, 14, 0),
        },
        // needs-revision WO27: loops Data Capture->Review->Data Capture
        {
            id: 'CXA7kHHLRi4K7kuhFrrzpa',
            entity_id:
                'x2uQev3HutthrUWRFkXSkH',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-38, 9, 0),
        },
        {
            id: 't1qnertaXJmzaaELr6IsYU',
            entity_id:
                'x2uQev3HutthrUWRFkXSkH',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-38, 9, 18),
        },
        {
            id: 'h59lAwdhgMdefl9RisCCj7',
            entity_id:
                'x2uQev3HutthrUWRFkXSkH',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-36, 14, 0),
        },
        {
            id: 'c7ikZyOjtqlGuoz9zODuHy',
            entity_id:
                'x2uQev3HutthrUWRFkXSkH',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-35, 22, 0),
        },
        {
            id: 'eKSPOrAHWb6CNNMhRQTYKt',
            entity_id:
                'x2uQev3HutthrUWRFkXSkH',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-34, 14, 0),
        },
        {
            id: 'zGJlSHo6fbztITB52k1vuP',
            entity_id:
                'x2uQev3HutthrUWRFkXSkH',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-33, 9, 0),
        },
        // needs-revision WO28: loops Data Capture->Review->Data Capture
        {
            id: 'ZHtYaVGAAmYCcJYUbDsEZl',
            entity_id:
                'w7XA9UnuYI7e46RTQL1xGW',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-25, 10, 0),
        },
        {
            id: '9SqVX67zSGRvJr6LzgLoqA',
            entity_id:
                'w7XA9UnuYI7e46RTQL1xGW',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-25, 10, 20),
        },
        {
            id: 'tgkwKH3qWOdn2BcWaazkdN',
            entity_id:
                'w7XA9UnuYI7e46RTQL1xGW',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-23, 14, 0),
        },
        {
            id: 'IGUf2HrDyAJCpT1OrdBEdb',
            entity_id:
                'w7XA9UnuYI7e46RTQL1xGW',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-22, 14, 0),
        },
        {
            id: 'PxLFPaM23m2rQXIzeJIywN',
            entity_id:
                'w7XA9UnuYI7e46RTQL1xGW',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-21, 10, 0),
        },
        {
            id: '01Xeks1usn4PgpxH0QwyHi',
            entity_id:
                'w7XA9UnuYI7e46RTQL1xGW',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-19, 14, 0),
        },
        // needs-revision WO29: loops Data Capture->Review->Data Capture
        {
            id: 'UsCm8zcTD7V2b5csEp7Mcr',
            entity_id:
                '3H3XeeNE4rS2wbANs3JvYz',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-12, 9, 30),
        },
        {
            id: 'eRBpgQtP1g4IrauEEkfOCl',
            entity_id:
                '3H3XeeNE4rS2wbANs3JvYz',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-12, 9, 45),
        },
        {
            id: 'vfWjLYPYadU0NFA6mk7yRl',
            entity_id:
                '3H3XeeNE4rS2wbANs3JvYz',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-11, 11, 0),
        },
        {
            id: 'G2eaGEcEP0s7q8ThefRKze',
            entity_id:
                '3H3XeeNE4rS2wbANs3JvYz',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-10, 14, 0),
        },
        {
            id: 'ZstKsrHfLjCwfx2qFso2ZR',
            entity_id:
                '3H3XeeNE4rS2wbANs3JvYz',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-9, 11, 0),
        },
        {
            id: 'BZ2RDP2rbCFKJvqqERE7eE',
            entity_id:
                '3H3XeeNE4rS2wbANs3JvYz',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-8, 9, 0),
        },
        // in-flight WO30: sitting in Data Capture
        {
            id: '6DutgmmGcJ1gqIvJgAcUHc',
            entity_id:
                'i7YYgKN3ZUlrkulQ2aWdIE',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-18, 9, 0),
        },
        {
            id: '8IEmMehaWoNrxS2NNocSNE',
            entity_id:
                'i7YYgKN3ZUlrkulQ2aWdIE',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-18, 9, 15),
        },
        // in-flight WO31: sitting in Data Capture
        {
            id: 'y0Mx6OUCbfA0HXgyqArpcv',
            entity_id:
                '0brjvcoPEVBwMkUQ3tKHWc',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-10, 10, 0),
        },
        {
            id: 'xPBiF7zri62itn9FCXWtUE',
            entity_id:
                '0brjvcoPEVBwMkUQ3tKHWc',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-10, 10, 20),
        },
        // in-flight WO32: sitting in Data Capture
        {
            id: 'vX4jtsFFLGpU3CXPRpdCrv',
            entity_id:
                'mTdhglHhl7pM0mKt0M2IjF',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-7, 8, 0),
        },
        {
            id: 'du3liNmXeejdDA0OMRfibW',
            entity_id:
                'mTdhglHhl7pM0mKt0M2IjF',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-7, 8, 12),
        },
        // in-flight WO33: sitting in Review
        {
            id: 'YhSbU5pZG78ab0G4SepE3j',
            entity_id:
                'GMhfH8lMQJXzE4vkjnSH1u',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-4, 9, 0),
        },
        {
            id: 'oapOBSYlGiuRXZDQoODFj7',
            entity_id:
                'GMhfH8lMQJXzE4vkjnSH1u',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-4, 9, 18),
        },
        {
            id: '4GQOHCMoSVszRiPyPIEJFj',
            entity_id:
                'GMhfH8lMQJXzE4vkjnSH1u',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-3, 14, 0),
        },
        // in-flight WO34: sitting in Review
        {
            id: 'W1A4TYQHkFgG0ijSUUQPR1',
            entity_id:
                'pLxCFGOINXVaXmrS0VG0vC',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-2, 11, 0),
        },
        {
            id: 'IUWLLWpuMM5EHbpESuAG13',
            entity_id:
                'pLxCFGOINXVaXmrS0VG0vC',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-2, 11, 20),
        },
        {
            id: 'IvGW6Yw71dy7s5wmMEYxDr',
            entity_id:
                'pLxCFGOINXVaXmrS0VG0vC',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-1, 10, 0),
        },
        // out-of-clan WO35: Sarah (not in Data Capture members)
        // transitions Data Capture out
        {
            id: 'uGXz0fPBwWaBQcviQP5ZsV',
            entity_id:
                'IyrpZrIl2hbmmnCtiifEGm',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-35, 9, 0),
        },
        {
            id: 'cEFDawHdIHfIaZQYGhH5xu',
            entity_id:
                'IyrpZrIl2hbmmnCtiifEGm',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-35, 9, 12),
        },
        {
            id: 'MGhDId9jZaFJZ5fBhnrGem',
            entity_id:
                'IyrpZrIl2hbmmnCtiifEGm',
            state: woNodeReview,
            member_id: woPersonSarah,
            at: daysFromNow(-33, 10, 0),
        },
        {
            id: 'Zch8By7ZpKFDwCNMEPI62h',
            entity_id:
                'IyrpZrIl2hbmmnCtiifEGm',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-31, 14, 0),
        },
        // out-of-clan WO36: Mike (not in Data Capture members)
        // transitions Data Capture out
        {
            id: 'VrxyiUJqWcdd3hBdMyoTBt',
            entity_id:
                'zYnDWBV4VP5guzW5fDWtHN',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-22, 10, 30),
        },
        {
            id: 'yikZQBGGjkiZXksUJM3gkS',
            entity_id:
                'zYnDWBV4VP5guzW5fDWtHN',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-22, 10, 45),
        },
        {
            id: '0J4UMtQY7x8cfN8FNXaToL',
            entity_id:
                'zYnDWBV4VP5guzW5fDWtHN',
            state: woNodeReview,
            member_id: woPersonEmily,
            at: daysFromNow(-20, 11, 0),
        },
        {
            id: 'XqSDgqjNZLihLPd2MX8fRR',
            entity_id:
                'zYnDWBV4VP5guzW5fDWtHN',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-18, 14, 0),
        },
        // old WO37: straddles window edge; Create + Data Capture
        // entry 108 days ago but Data Capture exit 8 days ago so
        // only the in-window ~82 days of Data Capture sojourn
        // count toward heat (exercises window clipping)
        {
            id: 'QsV9mE5GIUpMXGh3SVTCB7',
            entity_id:
                '7HX7RPwlYopHWfD7I0QAPs',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-108, 9, 0),
        },
        {
            id: 'pq0sBjRnF8XBooRpIPhsQp',
            entity_id:
                '7HX7RPwlYopHWfD7I0QAPs',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-108, 9, 15),
        },
        {
            id: 'BNbXMdM5RReniv5obnnHF8',
            entity_id:
                '7HX7RPwlYopHWfD7I0QAPs',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-8, 10, 0),
        },
        {
            id: 'txMcs1q11W87MhhBuR83vx',
            entity_id:
                '7HX7RPwlYopHWfD7I0QAPs',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-5, 14, 0),
        },
        // old WO38: all transitions ~100-103 days ago,
        // entirely outside the 90-day window; contributes
        // ~0 to heat stats
        {
            id: 'jobf5lBzIn2MPw34grYi2d',
            entity_id:
                'EXphSopBU1Is2TH4QZo4nO',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-103, 10, 0),
        },
        {
            id: 'o97Okl09WcFIc5EHkfBNL0',
            entity_id:
                'EXphSopBU1Is2TH4QZo4nO',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-103, 10, 18),
        },
        {
            id: '783y3zl2CZTp98AaqPhggs',
            entity_id:
                'EXphSopBU1Is2TH4QZo4nO',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-101, 11, 0),
        },
        {
            id: 'HXbhOvQZXx6DnrRB0T3mve',
            entity_id:
                'EXphSopBU1Is2TH4QZo4nO',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-100, 9, 0),
        },
        // prc01: happy path, ~3 day draft sojourn
        {
            id: 'fGWA9Dk2EKdOzT2DDU9XOC',
            entity_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            state: prcNodeStart,
            member_id: woPersonSarah,
            at: daysFromNow(-60, 9, 0),
        },
        {
            id: '3ksjRuCLxe6hNXR0dNzxWQ',
            entity_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            state: prcNodeDraft,
            member_id: woPersonSarah,
            at: daysFromNow(-60, 9, 5),
        },
        {
            id: 'uWiv67EN75R9nQ1njZxhuv',
            entity_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            state: prcNodeSubmit,
            member_id: woPersonEmily,
            at: daysFromNow(-57, 10, 0),
        },
        {
            id: 'odxDZFFHmZwFy1FmpUuxU5',
            entity_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            state: prcNodeTriage,
            member_id: woPersonEmily,
            at: daysFromNow(-57, 10, 30),
        },
        {
            id: 'AC5WlYdwXBnnE58qHaHmIo',
            entity_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            state: prcNodeQuickRev,
            member_id: woPersonMarcus,
            at: daysFromNow(-57, 11, 0),
        },
        {
            id: 'RgZgN0b8utwKl61fc4TzZP',
            entity_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            state: prcNodeDecision,
            member_id: woPersonMarcus,
            at: daysFromNow(-56, 14, 0),
        },
        {
            id: 'z6hNmYbEWvegszxhwcJ61f',
            entity_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            state: prcNodeApproved,
            member_id: woPersonSarah,
            at: daysFromNow(-56, 15, 0),
        },
        {
            id: 'XdBVq4IIUbuiefP1w0g0yu',
            entity_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            state: prcNodeArchive,
            member_id: woPersonSarah,
            at: daysFromNow(-55, 9, 0),
        },
        // prc02: happy path, ~2 day draft sojourn
        {
            id: 'Voznw9q5B5mGSoQek1jAHs',
            entity_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            state: prcNodeStart,
            member_id: woPersonEmily,
            at: daysFromNow(-45, 10, 0),
        },
        {
            id: 'm0nfsE2rTHaRbAWuxmum9d',
            entity_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            state: prcNodeDraft,
            member_id: woPersonEmily,
            at: daysFromNow(-45, 10, 10),
        },
        {
            id: 'yxbLBIMHtHgVjO74NsrNgX',
            entity_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            state: prcNodeSubmit,
            member_id: woPersonEmily,
            at: daysFromNow(-43, 9, 0),
        },
        {
            id: 'z9NN5xeQ6CMu9DChJ16m1V',
            entity_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            state: prcNodeTriage,
            member_id: woPersonMarcus,
            at: daysFromNow(-43, 9, 20),
        },
        {
            id: 'UAO4qYna7zIzLSJwM8iIoh',
            entity_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            state: prcNodeQuickRev,
            member_id: woPersonMarcus,
            at: daysFromNow(-43, 10, 0),
        },
        {
            id: 'UrbW8eFstKcsHbh99uRUds',
            entity_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            state: prcNodeDecision,
            member_id: woPersonSarah,
            at: daysFromNow(-42, 14, 0),
        },
        {
            id: 'KW7NkVunQCIEUzL9R78DpF',
            entity_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            state: prcNodeApproved,
            member_id: woPersonSarah,
            at: daysFromNow(-42, 15, 0),
        },
        {
            id: 'wVgv2i4c1o7t11tIrmngjN',
            entity_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            state: prcNodeArchive,
            member_id: woPersonEmily,
            at: daysFromNow(-41, 10, 0),
        },
        // prc03: happy path, ~1 day draft sojourn
        {
            id: 'jMUHUNKZX9A0LJOuoDt3UQ',
            entity_id:
                'oTscblsEOjZDkvkW3vs7rU',
            state: prcNodeStart,
            member_id: woPersonSarah,
            at: daysFromNow(-30, 8, 0),
        },
        {
            id: '5opUgNKNUIWnlm3MnpGX9F',
            entity_id:
                'oTscblsEOjZDkvkW3vs7rU',
            state: prcNodeDraft,
            member_id: woPersonSarah,
            at: daysFromNow(-30, 8, 10),
        },
        {
            id: '0XabGfXLVpJqRrrA8Tmo4S',
            entity_id:
                'oTscblsEOjZDkvkW3vs7rU',
            state: prcNodeSubmit,
            member_id: woPersonCurrent,
            at: daysFromNow(-29, 9, 0),
        },
        {
            id: 'sbPLHxmfJUpk3tfXZ7ShRX',
            entity_id:
                'oTscblsEOjZDkvkW3vs7rU',
            state: prcNodeTriage,
            member_id: woPersonCurrent,
            at: daysFromNow(-29, 9, 15),
        },
        {
            id: 'CEUHkraKtR9HC4heDL8OaZ',
            entity_id:
                'oTscblsEOjZDkvkW3vs7rU',
            state: prcNodeQuickRev,
            member_id: woPersonMarcus,
            at: daysFromNow(-29, 10, 0),
        },
        {
            id: 'EqVBgaYCFKRwp9uIHOyVle',
            entity_id:
                'oTscblsEOjZDkvkW3vs7rU',
            state: prcNodeDecision,
            member_id: woPersonMarcus,
            at: daysFromNow(-28, 15, 0),
        },
        {
            id: '1DfCm0yI6ycGmVNPcudsOU',
            entity_id:
                'oTscblsEOjZDkvkW3vs7rU',
            state: prcNodeApproved,
            member_id: woPersonEmily,
            at: daysFromNow(-28, 16, 0),
        },
        {
            id: 'lAOOAfrD4ZO0rKWfQFI8Px',
            entity_id:
                'oTscblsEOjZDkvkW3vs7rU',
            state: prcNodeArchive,
            member_id: woPersonEmily,
            at: daysFromNow(-27, 9, 0),
        },
        // prc04: happy path, ~4 day draft sojourn
        {
            id: 'JOz3BgXyTUkvWLmmNGszc7',
            entity_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            state: prcNodeStart,
            member_id: woPersonEmily,
            at: daysFromNow(-20, 11, 0),
        },
        {
            id: 'JpSsbb9JNMnGteG4RBWrZB',
            entity_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            state: prcNodeDraft,
            member_id: woPersonEmily,
            at: daysFromNow(-20, 11, 5),
        },
        {
            id: 'dn32O6s5Ibe5aDOByr87J7',
            entity_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            state: prcNodeSubmit,
            member_id: woPersonMarcus,
            at: daysFromNow(-16, 10, 0),
        },
        {
            id: 'nFGAxCNAthhvb9m4walDUe',
            entity_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            state: prcNodeTriage,
            member_id: woPersonSarah,
            at: daysFromNow(-16, 10, 20),
        },
        {
            id: 'fjM70dtNCzEFNoQ6cjJCWO',
            entity_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            state: prcNodeQuickRev,
            member_id: woPersonSarah,
            at: daysFromNow(-16, 11, 0),
        },
        {
            id: '12eJcjUwJ7G1iqPAU6cSx0',
            entity_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            state: prcNodeDecision,
            member_id: woPersonSarah,
            at: daysFromNow(-15, 14, 0),
        },
        {
            id: 'eM38EYOkl4REWI8y8IhCzA',
            entity_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            state: prcNodeApproved,
            member_id: woPersonEmily,
            at: daysFromNow(-15, 15, 30),
        },
        {
            id: 'Vx8TlX4GIyRQPYS6oocHhd',
            entity_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            state: prcNodeArchive,
            member_id: woPersonEmily,
            at: daysFromNow(-14, 9, 0),
        },
        // prc05: revisit -- Decision sends to
        // Revise, then Draft again, then completes
        {
            id: '4PaHruvvvyktmxiaGvTjM2',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeStart,
            member_id: woPersonSarah,
            at: daysFromNow(-15, 9, 0),
        },
        {
            id: 'WMNTfIbJPW1m39FOKqMZhH',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeDraft,
            member_id: woPersonSarah,
            at: daysFromNow(-15, 9, 10),
        },
        {
            id: 'tMWEwY6qb3ICXZtz6P28Ut',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeSubmit,
            member_id: woPersonEmily,
            at: daysFromNow(-14, 10, 0),
        },
        {
            id: 'gOUPiWUJiZa99BUOQTrYjh',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeTriage,
            member_id: woPersonEmily,
            at: daysFromNow(-14, 10, 15),
        },
        {
            id: 'zQbr7dr0N8gG14HJT8hCop',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeQuickRev,
            member_id: woPersonMarcus,
            at: daysFromNow(-14, 11, 0),
        },
        {
            id: 'c1O3BtoItm3bp1owvVmVWY',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeDecision,
            member_id: woPersonMarcus,
            at: daysFromNow(-13, 14, 0),
        },
        // Decision routes to Revise (revisit)
        {
            id: '3g2Tomp04bLGvwNRss9zCi',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeRevise,
            member_id: woPersonCurrent,
            at: daysFromNow(-13, 15, 0),
        },
        // Revise sends back to Draft
        {
            id: 'clXy8qWTzs8eNo3YaNi3Q5',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeDraft,
            member_id: woPersonSarah,
            at: daysFromNow(-12, 9, 0),
        },
        {
            id: 'T0hms37kIuFsjCmKKnt5Je',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeSubmit,
            member_id: woPersonSarah,
            at: daysFromNow(-11, 10, 0),
        },
        {
            id: 'GnfjTPti69qF7OyWRdJTQV',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeTriage,
            member_id: woPersonEmily,
            at: daysFromNow(-11, 10, 20),
        },
        {
            id: 'QnMQPkZbvU0IPt6XODVj2K',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeQuickRev,
            member_id: woPersonEmily,
            at: daysFromNow(-11, 11, 0),
        },
        {
            id: 'boVwgdzs2FbJ3lV2BK6rFe',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeDecision,
            member_id: woPersonMarcus,
            at: daysFromNow(-10, 14, 0),
        },
        {
            id: 'JeIgVixuJXQgtsLJ2jVEV6',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeApproved,
            member_id: woPersonMarcus,
            at: daysFromNow(-10, 15, 0),
        },
        {
            id: 'N09pFEf67fHMeaf5d9Hmud',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeArchive,
            member_id: woPersonSarah,
            at: daysFromNow(-9, 9, 0),
        },
        // prc06: in-flight -- stuck at Decision
        {
            id: 'iGftzPJwYdoaZr4Hm5MlsE',
            entity_id:
                'BUrGEVDMF6FeU35WUHUY5E',
            state: prcNodeStart,
            member_id: woPersonEmily,
            at: daysFromNow(-5, 10, 0),
        },
        {
            id: 'sCPs7p4WtQgm0VuR81yMyy',
            entity_id:
                'BUrGEVDMF6FeU35WUHUY5E',
            state: prcNodeDraft,
            member_id: woPersonEmily,
            at: daysFromNow(-5, 10, 8),
        },
        {
            id: 'bHOxRfjKzqHi2DH8w3I8Xg',
            entity_id:
                'BUrGEVDMF6FeU35WUHUY5E',
            state: prcNodeSubmit,
            member_id: woPersonCurrent,
            at: daysFromNow(-4, 11, 0),
        },
        {
            id: 'LlXYA4dYJtau7GSAu2549Z',
            entity_id:
                'BUrGEVDMF6FeU35WUHUY5E',
            state: prcNodeTriage,
            member_id: woPersonSarah,
            at: daysFromNow(-4, 11, 20),
        },
        {
            id: 'pojq7QRvrUQorLUztKWUW5',
            entity_id:
                'BUrGEVDMF6FeU35WUHUY5E',
            state: prcNodeQuickRev,
            member_id: woPersonSarah,
            at: daysFromNow(-4, 12, 0),
        },
        {
            id: 'C4i8pmiwfwvwRFk19mjOa8',
            entity_id:
                'BUrGEVDMF6FeU35WUHUY5E',
            state: prcNodeDecision,
            member_id: woPersonMarcus,
            at: daysFromNow(-3, 14, 0),
        },
        // stays at Decision -- no more transitions
        // Gate-violation work order: only a Create
        // event; transitioning to Data Capture
        // trips the gate on Company Name + Email.
        {
            id: 'gvSe01CreateGateV101AB',
            entity_id:
                'gateV101W0rkOrd3rXY0a1',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-1, 9, 0),
        },
    ];

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

    const mockProjectFlows:
        ProjectFlowEntity[] = [
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

    const leadToClosePaths = buildLeadToClosePaths();

    const leadToCloseSojourn:
        SojournProfile = {
        meanHoursByNodeId:
            new Map<Id, number>([
                [l2cTriageNodeId, 8],
                [l2cDiscoveryNodeId, 36],
                [l2cQualifNodeId, 22 * 24],
                [l2cProposalNodeId, 24],
                [l2cNegotNodeId, 24],
            ]),
        sigmaByNodeId:
            new Map<Id, number>([
                [l2cTriageNodeId, 0.5],
                [l2cDiscoveryNodeId, 0.5],
                [l2cQualifNodeId, 1.4],
                [l2cProposalNodeId, 0.5],
                [l2cNegotNodeId, 0.5],
            ]),
    };

    const leadToCloseSkill: MemberSkill = {
        byMemberAndNode: new Map<
            Id, ReadonlyMap<Id, number>
        >([
            [memberSarah, new Map<
                Id, number
            >([
                [l2cDiscoveryNodeId, 0.75],
                [l2cQualifNodeId, 0.55],
                [l2cProposalNodeId, 0.80],
                [l2cNegotNodeId, 0.70],
            ])],
            [memberMarcus, new Map<
                Id, number
            >([
                [l2cDiscoveryNodeId, 1.10],
                [l2cQualifNodeId, 1.10],
            ])],
            [memberJessica, new Map<
                Id, number
            >([
                [l2cProposalNodeId, 0.85],
            ])],
            [memberLisa, new Map<
                Id, number
            >([
                [l2cTriageNodeId, 0.90],
            ])],
            [memberClaude, new Map<
                Id, number
            >([
                [l2cTriageNodeId, 0.60],
            ])],
        ]),
        jitterPct: 0.15,
    };

    const leadToCloseSpec: FlowSeedSpec = {
        flowId: l2cFlowId,
        name: 'Lead-to-Close',
        nodes: leadToCloseNodes,
        edges: leadToCloseEdges,
        creator: leadToCloseNodes[0]!,
        archive: leadToCloseNodes[6]!,
    };

    const leadToCloseData =
        generateFlowWorkload({
            flow: leadToCloseSpec,
            paths: leadToClosePaths,
            sojourn: leadToCloseSojourn,
            skill: leadToCloseSkill,
            totalWorkOrders: 100,
            oldestDaysAgo: 80,
            newestDaysAgo: 5,
            seed: 0xC0DEF00D,
        });

    await Promise.all([
        ...projects.map(project =>
            adapter.projects.put(project.id, {
                ...project, organization_id: STARK_ORG,
            }),
        ),
        // Store only the flow's scalar fields — the authored
        // graph literal is the relation-seed input (below),
        // never a stored column.
        ...mockFlows.map(flow => {
            const { graph: _graph, ...row } = flow;
            return adapter.flows.put(flow.id, {
                ...row, organization_id: STARK_ORG,
            });
        }),
        // Org '2' owns a small, self-contained slice so each
        // org owns at least one project and flow. The whole
        // work-order graph stays in org '1', so org '2' gets a
        // work-order-free flow and a flow-free project — no
        // cross-org coupling.
        adapter.projects.put('seed-project-org2', {
            ...projects[0]!,
            organization_id: ORG_TWO,
            title: 'Wayne R&D Portfolio',
        }),
        adapter.flows.put('seed-flow-org2', {
            organization_id: ORG_TWO,
            name: 'Wayne Onboarding',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
        }),
        adapter.states.put('seed-state-flow-org2', {
            entity_id: 'seed-flow-org2',
            state: 'active',
            member_id: SYSTEM_MEMBER_ID,
            at: MOCK_SEED_TIMESTAMP,
        }),
        ...flowRelations.nodes.map(node =>
            adapter.flowNodes.put(node.id, node)),
        ...flowRelations.edges.map(edge =>
            adapter.flowEdges.put(edge.id, edge)),
        ...flowRelations.members.map(member =>
            adapter.flowNodeMembers.put(member.id, member)),
        ...flowRelations.attributes.map(attribute =>
            adapter.flowNodeAttributes.put(
                attribute.id, attribute)),
    ]);

    const ideaSubmissions = buildIdeaSubmissions();

    const ideaStateEvents: StateEntity[] = [
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

    const projectStateEvents: StateEntity[] = [
        {
            // 'submitted' so the scoring loop skips this org-'2'
            // project — no cross-org score against org-'1'
            // objectives.
            id: 'seed-state-project-org2',
            entity_id: 'seed-project-org2',
            state: 'submitted',
            member_id: SYSTEM_MEMBER_ID,
            at: MOCK_SEED_TIMESTAMP,
        },
        {
            id: 'pSe01Cu5tSegmAi5pEv01',
            entity_id: 'u6YkHhlGc91oDMkr3x0isa',
            state: 'approved',
            member_id: SYSTEM_MEMBER_ID,
            at: daysFromNow(-60, 9, 0),
        },
        {
            id: 'pSe02Aut0Rep0rtComp02',
            entity_id: 'jRE2Tj32NHsFGZIeEADp0p',
            state: 'archived',
            member_id: SYSTEM_MEMBER_ID,
            at: daysFromNow(-110, 9, 0),
        },
        {
            id: 'pSe03SalesP1p3App03Z',
            entity_id: l2cProjectId,
            state: 'approved',
            member_id: SYSTEM_MEMBER_ID,
            at: daysFromNow(-55, 9, 0),
        },
        {
            id: 'pSe04PredMa1ntRev04AB',
            entity_id: 'P04PredMa1ntzyXY010203',
            state: 'under_review',
            member_id: SYSTEM_MEMBER_ID,
            at: daysFromNow(-18, 9, 0),
        },
        {
            id: 'pSe05RtAna1ytComp05CD',
            entity_id: 'P05RtAna1ytcsXY010203Z',
            state: 'archived',
            member_id: SYSTEM_MEMBER_ID,
            at: daysFromNow(-95, 9, 0),
        },
        {
            id: 'pSe06SmInvOptSnt06EF',
            entity_id: 'P06SmInvOptZyXY010203A',
            state: 'sent_back',
            member_id: SYSTEM_MEMBER_ID,
            at: daysFromNow(-38, 9, 0),
        },
        {
            id: 'pSe07Empl0yTraRev07GH',
            entity_id: 'P07Empl0yTrainZyXY00B0',
            state: 'under_review',
            member_id: SYSTEM_MEMBER_ID,
            at: daysFromNow(-12, 9, 0),
        },
        {
            id: 'pSe08CustSuppApp08IJ',
            entity_id: 'P08CustSuppKn0wXY01C0D',
            state: 'approved',
            member_id: SYSTEM_MEMBER_ID,
            at: daysFromNow(-48, 9, 0),
        },
        {
            id: 'pSe09C0mp1AudApp09KL',
            entity_id: 'P09C0mp1AudAut0mXY01E0',
            state: 'approved',
            member_id: SYSTEM_MEMBER_ID,
            at: daysFromNow(-72, 9, 0),
        },
        {
            id: 'pSe10MlRgD1s4App10MN',
            entity_id: 'P10MlRgD1s4stRc1XY01FG',
            state: 'approved',
            member_id: SYSTEM_MEMBER_ID,
            at: daysFromNow(-82, 9, 0),
        },
        {
            id: 'pSe11V0iceField11OPQ',
            entity_id: 'P11V0iceField0psXY01HJ',
            state: 'approved',
            member_id: SYSTEM_MEMBER_ID,
            at: daysFromNow(-40, 9, 0),
        },
        {
            id: 'pSe12CarbF00tCmp12RS',
            entity_id: 'P12CarbF00tprXY01K0L0M',
            state: 'archived',
            member_id: SYSTEM_MEMBER_ID,
            at: daysFromNow(-120, 9, 0),
        },
        {
            id: 'pSe13W0rk4rcRev13TU',
            entity_id: 'P13W0rk4rcF0r3castsXY1',
            state: 'under_review',
            member_id: SYSTEM_MEMBER_ID,
            at: daysFromNow(-22, 9, 0),
        },
        {
            id: 'pSe14SmartD0cAp14VWX',
            entity_id: 'P14SmartD0cumtR0utngX1',
            state: 'approved',
            member_id: SYSTEM_MEMBER_ID,
            at: daysFromNow(-65, 9, 0),
        },
        {
            id: 'pSe15Inv3st0rAp15YZA',
            entity_id: 'P15Inv3st0rRep0rtP1Y00',
            state: 'approved',
            member_id: SYSTEM_MEMBER_ID,
            at: daysFromNow(-58, 9, 0),
        },
        {
            id: 'pSe16MktSentSubmt16BC',
            entity_id: 'P16MktSent1mentXY01020',
            state: 'submitted',
            member_id: SYSTEM_MEMBER_ID,
            at: daysFromNow(-5, 9, 0),
        },
    ];

    // One state event per seeded flow — the
    // creation moment of each flow on the states
    // log. Tier 2.3 retires FlowEntity.created_at
    // / updated_at; the log IS the truth. Events
    // are authored by SYSTEM_MEMBER_ID at the
    // shared wfTimestamp moment.
    const flowStateEvents: StateEntity[] = [
        {
            id: 'fSe01CustomerOnboard0aA',
            entity_id:
                'h5mErVBQhwdMKwi1co30jB',
            state: 'active',
            member_id: SYSTEM_MEMBER_ID,
            at: wfTimestamp,
        },
        {
            id: 'fSe02FusionFl0w0aActiv',
            entity_id:
                'E2BnBlZyrriqsQYkmS4usb',
            state: 'active',
            member_id: SYSTEM_MEMBER_ID,
            at: wfTimestamp,
        },
        {
            id: 'fSe03Lay0utTest0aActiv',
            entity_id:
                '7COt7Kf4OaOBg6AjaNO04s',
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

    const aiMembers = buildAiMembers();

    // AI members start at 'active' on creation.
    // Same single-event seeding as humans.
    for (const ai of aiMembers) {
        memberStateEvents.push({
            id: `seed-member-${ai.id}-active`,
            entity_id: ai.id,
            state: 'active',
            member_id: SYSTEM_MEMBER_ID,
            at: MOCK_SEED_TIMESTAMP,
        });
    }

    // Each record attribute is stamped with ITS parent
    // record's org, so the recordAttributes-match-parent
    // invariant holds however records are partitioned.
    const recordOrgById = new Map(
        mockRecords.map((r, i) => [r.id, assignOrg(i)]));

    await Promise.all([
        ...ideaSubmissions.map(r =>
            adapter.ideaSubmissions.put(
                r.id, r,
            ),
        ),
        ...mockProjectFlows.map(r =>
            adapter.projectFlows.put(
                r.id, r,
            ),
        ),
        ...mockWorkOrders.map(r =>
            adapter.workOrders.put(r.id, {
                ...r, organization_id: STARK_ORG,
            }),
        ),
        ...mockFlowWorkOrders.map(r =>
            adapter.flowWorkOrders.put(
                r.id, r,
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
        ...ideaStateEvents.map(r =>
            adapter.states.put(r.id, {
                entity_id: r.entity_id,
                state: r.state,
                member_id: r.member_id,
                at: r.at,
            }),
        ),
        ...projectStateEvents.map(r =>
            adapter.states.put(r.id, {
                entity_id: r.entity_id,
                state: r.state,
                member_id: r.member_id,
                at: r.at,
            }),
        ),
        ...flowStateEvents.map(r =>
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
        ...aiMembers.flatMap(m => {
            const { id: _id, ...detail } = m;
            return [
                adapter.members.put(m.id, {
                    type: 'ai',
                }),
                adapter.memberships.put(
                    'seed-membership-' + m.id, {
                        organization_id: STARK_ORG,
                        identity_id: m.id,
                        at: MOCK_SEED_TIMESTAMP,
                    }),
                adapter.aiMembers.put(m.id, detail),
                adapter.identities.put(m.id, {
                    kind: 'service',
                }),
            ];
        }),
        ...leadToCloseData.workOrders.map(r =>
            adapter.workOrders.put(r.id, r),
        ),
        ...leadToCloseData.flowWorkOrders
            .map(r =>
                adapter.flowWorkOrders.put(
                    r.id, r,
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
        ...mockRecords.map((r, i) =>
            adapter.records.put(r.id, {
                organization_id: assignOrg(i),
                name: r.name,
                description: r.description,
                position: r.position,
            }),
        ),
        ...mockRecordAttributes.map(r =>
            adapter.recordAttributes.put(r.id, {
                organization_id:
                    recordOrgById.get(r.record_id)!,
                record_id: r.record_id,
                name: r.name,
                attribute_type:
                    r.attribute_type,
                sort_order: r.sort_order,
                options: r.options,
                constraints: r.constraints,
            }),
        ),
        ...mockFlowRecords.map(r =>
            adapter.flowRecords.put(r.id, {
                flow_id: r.flow_id,
                record_id: r.record_id,
                at: r.at,
            }),
        ),
        ...recordStateEvents.map(r =>
            adapter.states.put(r.id, {
                entity_id: r.entity_id,
                state: r.state,
                member_id: r.member_id,
                at: r.at,
            }),
        ),
    ]);

    const humanIds = new Set(
        (await adapter.members.getAll())
            .filter(w => w.type === 'human')
            .map(w => w.id),
    );
    // A score or revision author is always a member of the
    // scored entity's org. Seed authors from that org ONLY:
    // picking across orgs produced authors outside the
    // org-scoped roster, and memberName (strict by design)
    // then threw when the project-history modal resolved them.
    const humansByOrg = new Map<string, string[]>();
    for (const m of await adapter.memberships.getAll()) {
        if (!humanIds.has(m.identity_id)) continue;
        const pool =
            humansByOrg.get(m.organization_id) ?? [];
        pool.push(m.identity_id);
        humansByOrg.set(m.organization_id, pool);
    }
    const memberFor = (
        org: string, seed: string,
    ): string => {
        const pool = humansByOrg.get(org) ?? [];
        return pool[
            deterministicScore(seed, 0, pool.length - 1)
        ] ?? SYSTEM_MEMBER_ID;
    };

    for (const seed of OBJECTIVE_SEEDS) {
        await adapter.objectives.put(seed.id, {
            organization_id: STARK_ORG,
            position: seed.position,
        });
        await adapter.objectiveRevisions.put(
            `${seed.id}:${MOCK_SEED_TIMESTAMP}`,
            {
                objective_id: seed.id,
                name: seed.name,
                description: seed.description,
                member_id: memberFor(
                    STARK_ORG,
                    `${seed.id}:revision`,
                ),
                at: MOCK_SEED_TIMESTAMP,
            },
        );
    }

    // Org '2' owns one objective so each org owns at least one.
    await adapter.objectives.put('seed-objective-org2', {
        organization_id: ORG_TWO,
        position: 0,
    });
    await adapter.objectiveRevisions.put(
        `seed-objective-org2:${MOCK_SEED_TIMESTAMP}`, {
            objective_id: 'seed-objective-org2',
            name: 'Wayne demo objective',
            description: 'Second-org demo objective.',
            member_id: SYSTEM_MEMBER_ID,
            at: MOCK_SEED_TIMESTAMP,
        },
    );

    const allProjects = await adapter.projects.getAll();
    const projectStateById = new Map(
        projectStateEvents.map(
            ev => [ev.entity_id, ev.state],
        ),
    );

    function deterministicScore(
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

    for (const p of allProjects) {
        const state = projectStateById.get(p.id);
        if (state === undefined) {
            throw new Error(
                'seeded project has no state event: '
                + p.id,
            );
        }
        if (
            state === 'submitted'
            || state === 'declined'
            || state === 'deleted'
        ) {
            continue;
        }

        const baselineCoverage =
            state === 'approved'
            || state === 'archived'
                ? OBJECTIVE_SEEDS.length
                : deterministicScore(
                    p.id + ':coverage',
                    0,
                    OBJECTIVE_SEEDS.length - 1,
                );

        const baselineStart =
            new Date(p.start_date).getTime();
        // Committed work (approved + archived) is
        // expected to advance objectives; baselines
        // skew positive. Drafts (under_review +
        // sent_back) can dip negative — a flagged
        // risk worth surfacing on the dashboard.
        const baselineMin =
            state === 'approved'
            || state === 'archived'
                ? 0
                : -100;
        for (let i = 0; i < baselineCoverage; i++) {
            const obj = OBJECTIVE_SEEDS[i]!;
            const score = deterministicScore(
                `${p.id}:${obj.id}:baseline`,
                baselineMin,
                100,
            );
            const scoredAt = isoFromMs(
                baselineStart + i * 1000,
            );
            await adapter
                .projectObjectiveBaselineScores
                .put(
                    `${p.id}:${obj.id}:${scoredAt}`,
                    {
                        project_id: p.id,
                        objective_id: obj.id,
                        score,
                        member_id: memberFor(
                            p.organization_id,
                            `${p.id}:${obj.id}:baseline`,
                        ),
                        at: scoredAt,
                    },
                );
        }

        if (
            state === 'approved'
            || state === 'archived'
        ) {
            const minActuals = 1;
            const baseActualTime =
                baselineStart + MS_PER_DAY;
            for (
                let i = 0; i < OBJECTIVE_SEEDS.length; i++
            ) {
                const obj = OBJECTIVE_SEEDS[i]!;
                const nActuals =
                    minActuals
                    + deterministicScore(
                        `${p.id}:${obj.id}:nactual`,
                        0,
                        2,
                    );
                for (let k = 0; k < nActuals; k++) {
                    const score = deterministicScore(
                        `${p.id}:${obj.id}:actual:${k}`,
                        -100,
                        100,
                    );
                    const scoredAt = isoFromMs(
                        baseActualTime
                            + (i * 10 + k) * 1000,
                    );
                    await adapter
                        .projectObjectiveActualScores
                        .put(
                            `${p.id}:${obj.id}:${scoredAt}`,
                            {
                                project_id: p.id,
                                objective_id: obj.id,
                                score,
                                member_id: memberFor(
                                    p.organization_id,
                                    `${p.id}:${obj.id}:actual:${k}`,
                                ),
                                at: scoredAt,
                            },
                        );
                }
            }
        }
    }
}

export async function postBootstrap(
    adapter: DbAdapter,
): Promise<SeededCredentials> {
    // Seed the pristine bootstrap data in one transaction.
    // Credentials seed after it commits — PBKDF2 hashing is
    // async crypto and cannot run inside the tx. The schema
    // marker stamps LAST so a failed bootstrap leaves the
    // anonymous plane open for retry.
    await adapter.ensureTables(TABLE_NAMES);
    await adapter.transaction(
        TABLE_NAMES,
        (view) => postBootstrapIn(view),
    );
    const creds = await seedHumanCredentials(adapter);
    await adapter.postSchemaCreation();
    return creds;
}

async function postBootstrapIn(
    adapter: DbAdapter,
): Promise<void> {
    // The pristine seed plants only what the app needs
    // to render its shell: the system actor that authors
    // state events, the current user, and the singleton
    // organization. No Records — an empty Records page is
    // the correct pristine state; sample Records are demo
    // content loaded by postMockDataLoad, not bootstrap.
    await Promise.all([
        adapter.members.put(SYSTEM_MEMBER_ID, {
            type: 'system',
        }),
        adapter.identities.put(SYSTEM_MEMBER_ID, {
            kind: 'service',
        }),
        adapter.members.put('current', {
            type: 'human',
        }),
        adapter.memberships.put(
            'bootstrap-membership-current', {
                organization_id: STARK_ORG,
                identity_id: 'current',
                at: MOCK_SEED_TIMESTAMP,
            }),
        adapter.identityDefaultOrganizations.put(
            'bootstrap-default-org-current', {
                identity_id: 'current',
                organization_id: STARK_ORG,
                at: MOCK_SEED_TIMESTAMP,
            }),
        adapter.identities.put('current', {
            kind: 'person',
        }),
        adapter.identityPii.put('current', {
            name: 'Tony Stark',
            email: 'demo@example.com',
            phone: '+1 (555) 123-4567',
            bio: 'Passionate about building'
                + ' products that solve'
                + ' real problems.',
        }),
        adapter.humanMembers.put('current', {
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
        }),
        adapter.states.postEvent(
            'bootstrap-system-active',
            SYSTEM_MEMBER_ID,
            'active',
            SYSTEM_MEMBER_ID,
            nowUtc(),
        ),
        adapter.states.postEvent(
            'bootstrap-current-active',
            'current',
            'active',
            SYSTEM_MEMBER_ID,
            nowUtc(),
        ),
        adapter.organizations.put(STARK_ORG, {
            name: 'Stark Industries',
            domain: 'acmecorp.com',
            next_billing: daysFromNow(300, 0, 0),
            seats: TIER_SEATS_LIMIT,
            projects_limit: TIER_PROJECTS_LIMIT,
            ideas_limit: TIER_IDEAS_LIMIT,
        }),
        adapter.roleGrants.put(
            'bootstrap-role-current-admin', {
                organization_id: STARK_ORG,
                identity_id: 'current',
                role: 'admin',
                action: 'granted',
                by_member_id: SYSTEM_MEMBER_ID,
                at: MOCK_SEED_TIMESTAMP,
            },
        ),
    ]);
}
