import type { DbAdapter } from './db.ts';
import type { BackedDbAdapter } from './db-backed.ts';
import { MemoryStorageBackend } from
    './backend-memory.ts';
import {
    postSeedLanding,
    rehearse,
    type SeedRehearsal,
} from './ledger-seed.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

import {
    postIdeaDocumentOp,
    postIdeaSubmissionOp,
    postProjectDocumentOp,
    postFlowCreationOp,
    postFlowDocumentOp,
    postWorkOrderDocumentOp,
    postWorkOrderTransitionOp,
    postWorkOrderBindingOp,
    postInstancePatchOp,
    postFlowWorkOrderDocumentOp,
    postFlowRecordDocumentOp,
    postRecordWriteOp,
    postObjectiveCreationOp,
    postIdentityPiiDocumentOp,
    postBaselineScoreDocumentOp,
    postActualScoreDocumentOp,
    postMembershipDocumentOp,
    postIdentityDocumentOp,
    postIdentityCredentialDocumentOp,
    postAiAgentDocumentOp,
    postOrganizationDocumentOp,
    identityDocumentBodyOf,
} from './routes.ts';
import { putIdentityDefaultOrganization } from
    './organization-requests.ts';
import { postOrganizationInvitationGrant } from
    './invitations-domain.ts';
import type {
    FlowCreationMessagePairs,
    RecordWriteMessagePairs,
    ObjectiveCreationMessagePairs,
} from './routes.ts';
import type { Id } from '../shared/types.ts';
import {
    SYSTEM_MEMBER_ID,
    nowUtc,
} from '../shared/types.ts';
import { generateSecret } from
    '../shared/secret.ts';
import { hashPassword } from '../shared/password-hash.ts';
import type { MessagePair } from './message-pair.ts';
import {
    humanMemberPoolsByOrganization,
    pickHumanMember,
    seedIdentifier,
} from './mock-data/seed-kit.ts';
import {
    MOCK_SEED_TIMESTAMP,
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
    assignOrganization,
} from './mock-data/seed-constants.ts';
import { buildAiMembers } from './mock-data/ai-members.ts';
import {
    buildMembers,
    buildUnaffiliatedIdentity,
} from './mock-data/members.ts';
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
    ideaGenesis,
    projectGenesis,
    flowStateEvents,
    recordGenesis,
    mockProjectFlows,
    mockFlowRecords,
    ideaSeedBody,
    ideaSubmissionSeedBody,
    projectSeedBody,
    projectOrg2,
    projectOrganizationFor,
    buildScoreSeedProjects,
    flowSeedBody,
    flowOrg2SeedBody,
    workOrderDocumentSeedBody,
    transitionSeedBody,
    flowWorkOrderJoinSeedBody,
    flowRecordJoinSeedBody,
    recordSeedBody,
    objectiveSeedBody,
    formMockDataMessagePairs,
    formBootstrapMessagePair,
    formSeedCredentialMessagePairs,
    seedMessagePairKey,
    ORGANIZATION_TWO_OBJECTIVE,
    seatSeedBody,
    identityPersonSeedBody,
    bootstrapCurrentIdentityBody,
    humanMemberPiiSeedBody,
    bootstrapCurrentMemberPiiBody,
    identityCredentialSeedBody,
    VALUE_BEARING_TRANSITION_EVENT_IDS,
    SEED_INSTANCE_ID,
    SEED_RECORD_TYPE_ID,
    WO01_ID,
    formInstanceChainSeedInput,
    formInstanceTransitionSeedPair,
    flowRecordOrganizationFor,
    defaultOrganizationSeedBody,
    memberPrimaryOrganization,
    seededOrganizationBody,
    formInvitationGrantSeedInput,
} from './mock-data/seed-message-pairs.ts';
import type {
    InstanceChainSeedInput,
    InvitationGrantSeedInput,
} from './mock-data/seed-message-pairs.ts';
import { deriveInstanceHead } from
    './derive-record-instances.ts';
import { buildSeedScoreRows } from './mock-data/scores.ts';
import {
    ATTRIBUTE_DETAIL_PATTERN,
    ORGANIZATION_MEMBER_DETAIL_PATTERN,
    RECORD_TYPES_COLLECTION_PATTERN,
    RECORD_TYPE_DETAIL_PATTERN,
} from './family-registry.ts';

// A missing pair here is a pass-1/pass-2 wiring bug (a dropped
// or mis-keyed invocation), never an expected condition — crash
// loud rather than silently write the row with no pair.
function requireMessagePair(
    messagePairs: ReadonlyMap<string, MessagePair>, key: string,
): MessagePair {
    const messagePair = messagePairs.get(key);
    if (messagePair === undefined) {
        throw new Error(
            'seed formed no message pair for ' + key,
        );
    }
    return messagePair;
}

// The seeded sign-ins, returned so the operator
// sees each password once. The seed never stores a
// plaintext: each password's hash lands in its
// identities/:id/credentials/:cid document, and the
// plaintexts live only in this return value.
export interface SeededIdentityCredential {
    readonly identityId: string;
    readonly username: string;
    readonly password: string;
}

// The seeded sign-ins, returned so the operator
// sees each password once. The seed never stores a
// plaintext: each password's hash lands in its
// identities/:id/credentials/:cid document, and the
// plaintexts live only in this return value.
export interface SeededCredentials {
    readonly identities:
        readonly SeededIdentityCredential[];
}

// Mint a password for every login-capable person
// identity and a client secret for the system identity,
// and hash them all first: the credential documents
// embed the hashes (Sequence, step 1). A placeholder
// would not verify through /authentication/authorize.
// Recipients are the in-memory person list, never a
// row scan.

const SEED_PASSWORD_CREDENTIAL_BY_IDENTITY:
    Readonly<Record<string, string>> = {
    'MQFcPtrZPIGjMCRAXtZUnA': 'LaequOyCoUesHcujaVqOMA',
    'VvzFEpfYONDAsCCwNlIFCQ': 'IFhgIHadHsALGCKLIOssbg',
    'zyGBRshxOnKHUfcyFRqowg': 'uyfznoPqIuXmXpCcRECzXQ',
    'DAjUkaBUIZbXSQeoLDZEXQ': 'hMyWhWPpuQsyGuhoqjnIIQ',
    'CJrglMsNBxOWWfbihHQSeg': 'BYheHlJLizGxgfwfSCelMg',
    'IzdIgJaTTfIZQUudGcmdtA': 'XzeLDCkqriuWnqXphMgIkQ',
    'SsVAZghfSzMZRZmxNKIizw': 'PAoLzUXIczjduyLpIVhkWA',
    'jrMOZzVdWXvLgMpcHoyBTw': 'eVUgUIJnGrvddYcojUXPPg',
    'RPzLGrWcstxLaHoBcViPLQ': 'qDAmzkUKHjUmzObmTGmrKQ',
    'ovKCDVqguNMVIiAyjSYeIg': 'oqpasBaTuYshSZlMeAIfXA',
    'XXZruirZyAOoRpNxaDnpSA': 'hRFubvlhanwDtFRwinlFCA',
    'VbxXtvAkgQzhoXQZkbnHVg': 'VhzYtBXmJdbLNwCzUIULZg',
    'dmGzDTZwsyIYCQhhRISXrw': 'BpqpoywaRNVNGplpFduhSw',
    'qbtQzOgP8OTJSr9Idicllg': 'Foe97qlbGsDqwE_Xq4yizQ',
    'GIo3puu_xoFWELY0Dsdklg': 'kGB8qfzle_4R3rJvLEFIlg',
    'uVgzITlKxKcWZtGSPzmsqA': 'OKUnRcADsiFabnVTmveTFA',
    'JbaPyILUCkLRVIVxJlHMSg': 'doiqitfReBBNaXouPmQNpA',
    'rgrOKkoZRGtCKXoZCKwkTw': 'xWvGfhdTzelnxfPOrqmuKA',
    'PVNrLzrfvTzAwGkxEOvTdw': 'HlLxYJTogBPjopIKArIPIw',
    'VhtqMAOlJREIqexMYxwZOQ': 'CyPrwmgvqrgXHIzqhCTCQQ',
    'filDOGmwcxtlYjNqiNTFeg': 'IkggeGVkMnqXJXBnvzhfsg',
    'xaLPEsKuiAJXlaNLnHLVkw': 'DvpItaUQVNMKcWyQsQETiQ',
    'WxXaodvJSfkEjgtLcoIAHw': 'HcIoKyHvRGMxcVWDLfEBOw',
    'kHaSgLhnsobjMXxNLEzpBw': 'tgsWnFRPItnMUlpJYXxaug',
    'PLJUlcSlswqOmpGbwDzwZw': 'FdnYnVJMdUUCCnNsqiiJuA',
    'RlVXjLbPPTsOimpvwqwLsA': 'HRmZCqpEiBfirOXNJkpRAA',
    'JfHbTXkOyLzJSNWFWFGrMg': 'QzqHjTvgpVUPAEDdaIHAUQ',
    'zuIFDMrBwxTWqLJpRrQWog': 'ljBZzdcZWOSvCekzDQwlOA',
    'hPrdaZfedPOJYevSaGziHw': 'yUTTGOBIUIRXFLdXmPmFGA',
    '_CgIO8a_dKa_WNNUSWlA2A': 'QacaZo3vrtz5vlkyE9Z3bA'
};

function seedPasswordCredentialId(
    identityId: string,
): string {
    const id = SEED_PASSWORD_CREDENTIAL_BY_IDENTITY[
        identityId
    ];
    if (id === undefined) {
        throw new Error(
            'no seed credential id for identity',
        );
    }
    return id;
}

type CredentialRecipient = {
    readonly identityId: string;
    readonly email: string;
};

type PasswordHasher = (
    plaintext: string,
) => Promise<string>;

interface SeedCredentialPlan {
    readonly humans: readonly {
        readonly id: string;
        readonly identityId: string;
        readonly username: string;
        readonly password: string;
        readonly secret: string;
    }[];
    readonly system: {
        readonly id: string;
        readonly secret: string;
    };
}

async function hashSeedCredentials(
    recipients: readonly CredentialRecipient[],
    hash: PasswordHasher,
): Promise<SeedCredentialPlan> {
    const humans = await Promise.all(
        recipients.map(async (recipient) => {
            const password = generateSecret();
            return {
                id: seedPasswordCredentialId(
                    recipient.identityId),
                identityId: recipient.identityId,
                username: recipient.email,
                password,
                secret: await hash(password),
            };
        }));
    const systemCredentialId = 'cFiyyRHxbIEVqeVFNPmDnw';
    return {
        humans,
        system: {
            id: systemCredentialId,
            secret: await hash(generateSecret()),
        },
    };
}

// Pass 2's last wave: the credential documents, through
// the op every live PUT identities/:id/credentials/:cid
// rides.
async function postSeedCredentialsIn(
    adapter: DbAdapter,
    plan: SeedCredentialPlan,
    credentialPairs: ReadonlyMap<string, MessagePair>,
): Promise<void> {
    await Promise.all([
        ...plan.humans.map((cred) =>
            postIdentityCredentialDocumentOp(
                adapter,
                cred.id,
                identityCredentialSeedBody(
                    cred.identityId, 'password',
                    cred.secret,
                ),
                SYSTEM_MEMBER_ID,
                requireMessagePair(
                    credentialPairs,
                    seedMessagePairKey(
                        'identities/:id/credentials/:cid',
                        cred.id,
                    ),
                ),
            )),
        postIdentityCredentialDocumentOp(
            adapter,
            plan.system.id,
            identityCredentialSeedBody(
                SYSTEM_MEMBER_ID, 'client_secret',
                plan.system.secret,
            ),
            SYSTEM_MEMBER_ID,
            requireMessagePair(
                credentialPairs,
                seedMessagePairKey(
                    'identities/:id/credentials/:cid',
                    plan.system.id,
                ),
            ),
        ),
    ]);
}

function revealedCredentials(
    plan: SeedCredentialPlan,
): SeededCredentials {
    return {
        identities: plan.humans.map((cred) => ({
            identityId: cred.identityId,
            username: cred.username,
            password: cred.password,
        })),
    };
}

export { OBJECTIVE_SEEDS };

export type PostMockDataLoadOptions = {
    readonly hashPassword?: PasswordHasher;
};

// A rehearsed seed and the sign-ins it minted. The
// plaintexts leave only after the landing commits.
export interface RehearsedSeed {
    readonly rehearsal: SeedRehearsal;
    readonly credentials: SeededCredentials;
}

// Pass 2's input for the mock-data seed: the pass-1 message
// pairs, keyed as requireMessagePair reads them, the
// invitation grant's and the instance chain's own live-op
// inputs (Decision 8), and the seed's shared requestAt.
export interface MockDataSeedInput {
    readonly messagePairs: ReadonlyMap<string, MessagePair>;
    readonly invitation: InvitationGrantSeedInput;
    readonly instanceChain: InstanceChainSeedInput;
    readonly requestAt: string;
}

// Hash, form, and rehearse (Sequence, steps 1 to 3). The
// live ops run on scratch memory; nothing touches the
// target.
export async function rehearseMockData(
    options?: PostMockDataLoadOptions,
): Promise<RehearsedSeed> {
    const credentials = await hashSeedCredentials(
        [
            ...buildMembers(),
            buildUnaffiliatedIdentity(),
        ].map((member) => ({
            identityId: member.id,
            email: member.email,
        })),
        options?.hashPassword ?? hashPassword,
    );
    const seedRunId = generateIdentifier();
    const requestAt = nowUtc();
    const messagePairs =
        await formMockDataMessagePairs(requestAt);
    const credentialPairs =
        await formSeedCredentialMessagePairs(
            credentials.humans, credentials.system,
            requestAt,
        );
    const input: MockDataSeedInput = {
        messagePairs,
        invitation: formInvitationGrantSeedInput(requestAt),
        instanceChain:
            await formInstanceChainSeedInput(requestAt),
        requestAt,
    };
    const statements = await rehearse(
        new MemoryStorageBackend(),
        async (db) => {
            await postMockDataLoadIn(db, input);
            await postSeedCredentialsIn(
                db, credentials, credentialPairs,
            );
        },
    );
    return {
        rehearsal: { seedRunId, statements },
        credentials: revealedCredentials(credentials),
    };
}

// Plan and land (steps 4 and 5) in one transaction
// beneath the adapter. The caller reveals the sign-ins
// after this resolves.
export async function postMockDataLoad(
    adapter: BackedDbAdapter,
    options?: PostMockDataLoadOptions,
): Promise<SeededCredentials> {
    const seed = await rehearseMockData(options);
    await postSeedLanding(adapter.backend, seed.rehearsal);
    return seed.credentials;
}

// Seat types in Stark, as the fence hands a handler its
// roles (api/api.ts).
function starkRolesOf(identityId: Id): readonly string[] {
    return identityId === 'XXZruirZyAOoRpNxaDnpSA'
        ? ['admin']
        : ['member'];
}

// The WO01 chain through the live ops, after the flow
// records land: the binding op reads the flow's record
// joins. Each transition's POST latches the head the
// previous op wrote.
async function postInstanceChainIn(
    adapter: DbAdapter,
    chain: InstanceChainSeedInput,
    requestAt: string,
): Promise<void> {
    await postInstancePatchOp(
        adapter,
        [STARK_ORGANIZATION, SEED_RECORD_TYPE_ID,
            SEED_INSTANCE_ID],
        { set: [] },
        SYSTEM_MEMBER_ID,
        chain.create,
        STARK_ORGANIZATION,
        [],
    );
    await postWorkOrderBindingOp(
        adapter,
        WO01_ID,
        {
            instance_id: SEED_INSTANCE_ID,
            record_type_id: SEED_RECORD_TYPE_ID,
        },
        SYSTEM_MEMBER_ID,
        STARK_ORGANIZATION,
        chain.binding,
    );
    for (const transition of [chain.review, chain.complete]) {
        const head = await deriveInstanceHead(
            adapter, STARK_ORGANIZATION,
            SEED_RECORD_TYPE_ID, SEED_INSTANCE_ID,
        );
        if (head === undefined) {
            throw new Error('the seed instance has no head');
        }
        await postWorkOrderTransitionOp(
            adapter,
            WO01_ID,
            transitionSeedBody(transition.event),
            transition.event.member_id,
            STARK_ORGANIZATION,
            starkRolesOf(transition.event.member_id),
            await formInstanceTransitionSeedPair(
                transition, head.messagePairId, requestAt,
            ),
        );
    }
}

async function postMockDataLoadIn(
    adapter: DbAdapter,
    input: MockDataSeedInput,
): Promise<void> {
    const messagePairs = input.messagePairs;
    const members = buildMembers();
    const unaffiliated = buildUnaffiliatedIdentity();

    await Promise.all([
        ...members.flatMap((member, index) => {
            // 'XXZruirZyAOoRpNxaDnpSA' (the admin) joins BOTH orgs; every
            // other human is single-org via assignOrganization.
            const organizations = member.id === 'XXZruirZyAOoRpNxaDnpSA'
                ? [STARK_ORGANIZATION, ORGANIZATION_TWO]
                : [assignOrganization(index)];
            return [
                ...organizations.map((_organization, n) =>
                    postMembershipDocumentOp(
                        adapter,
                        member.id,
                        seatSeedBody(
                            member.id === 'XXZruirZyAOoRpNxaDnpSA'
                                ? 'admin'
                                : 'member',
                        ),
                        SYSTEM_MEMBER_ID,
                        requireMessagePair(
                            messagePairs,
                            seedMessagePairKey(
                                ORGANIZATION_MEMBER_DETAIL_PATTERN,
                                member.id + '-' + n,
                            ),
                        ),
                    )),
                postIdentityDocumentOp(
                    adapter,
                    member.id,
                    identityPersonSeedBody(member),
                    SYSTEM_MEMBER_ID,
                    requireMessagePair(
                        messagePairs,
                        seedMessagePairKey(
                            'identities/:id', member.id,
                        ),
                    ),
                ),
                postIdentityPiiDocumentOp(
                    adapter,
                    member.id,
                    humanMemberPiiSeedBody(member),
                    SYSTEM_MEMBER_ID,
                    requireMessagePair(
                        messagePairs,
                        seedMessagePairKey(
                            'identities/:id/pii', member.id,
                        ),
                    ),
                ),
            ];
        }),
        postIdentityDocumentOp(
            adapter,
            SYSTEM_MEMBER_ID,
            identityDocumentBodyOf('service'),
            SYSTEM_MEMBER_ID,
            requireMessagePair(
                messagePairs,
                seedMessagePairKey('identities/:id', SYSTEM_MEMBER_ID),
            ),
        ),
        postIdentityDocumentOp(
            adapter,
            unaffiliated.id,
            identityPersonSeedBody(unaffiliated),
            SYSTEM_MEMBER_ID,
            requireMessagePair(
                messagePairs,
                seedMessagePairKey(
                    'identities/:id', unaffiliated.id,
                ),
            ),
        ),
        postIdentityPiiDocumentOp(
            adapter,
            unaffiliated.id,
            humanMemberPiiSeedBody(unaffiliated),
            SYSTEM_MEMBER_ID,
            requireMessagePair(
                messagePairs,
                seedMessagePairKey(
                    'identities/:id/pii', unaffiliated.id,
                ),
            ),
        ),
    ]);

    // The default-organization and invitation handlers
    // read the seats and PII wave 1 lands (Decision 8).
    await Promise.all([
        ...members.map((member, index) =>
            putIdentityDefaultOrganization(
                adapter,
                [member.id],
                defaultOrganizationSeedBody(
                    memberPrimaryOrganization(
                        member.id, index,
                    ),
                ),
                member.id,
                requireMessagePair(
                    messagePairs,
                    seedMessagePairKey(
                        'identities/:id/default-organization',
                        member.id,
                    ),
                ),
            )),
        postOrganizationInvitationGrant(
            adapter,
            [input.invitation.organization],
            input.invitation.body,
            input.invitation.granterId,
            undefined,
            input.invitation.organization,
            ['admin'],
            input.invitation.requestAt,
            input.invitation.operationId,
            input.invitation.received,
        ),
    ]);

    // Role grants retired: membership `type` (admin for
    // current, member otherwise) seeds privilege; mint
    // bakes claim roles from those memberships.

    const ideas = buildIdeas();

    // Each seeded idea's genesis row drives
    // postIdeaDocumentOp below, so the seed writes exactly as
    // the genesis case of PUT /ideas/:id does (create is just
    // the head-absent case of the document PUT). Driving the
    // op below the org fence, the unscoped store stamps
    // nothing, so organization_id rides in the seed body
    // instead of the (route-only) omission. ideaGenesis is
    // imported from seed-message-pairs.ts — pass 1 there needs
    // the SAME array to form each idea's pair before the
    // rehearsal's writes.
    const ideaGenesisById = new Map(
        ideaGenesis.map(g => [g.entityId, g]),
    );

    await Promise.all([
        ...ideas.map((idea, i) => {
            const genesis = ideaGenesisById.get(idea.id)!;
            return postIdeaDocumentOp(
                adapter,
                idea.id,
                ideaSeedBody(idea, genesis.state, i),
                genesis.memberId,
                requireMessagePair(
                    messagePairs, seedMessagePairKey('ideas', idea.id),
                ),
            );
        }),
        // Phase Final Task 2: organizations ROW half stripped —
        // message-plane only (seededOrganizationBody still
        // shapes the pair body in seed-message-pairs.ts).
        ...[STARK_ORGANIZATION, ORGANIZATION_TWO].map(
            (organization) => postOrganizationDocumentOp(
                adapter,
                [organization],
                seededOrganizationBody(organization),
                SYSTEM_MEMBER_ID,
                requireMessagePair(
                    messagePairs,
                    seedMessagePairKey(
                        'organizations/:id', organization,
                    ),
                ),
            )),
    ]);

    const projects = buildProjects();

    // Each seeded project's genesis row drives
    // postProjectDocumentOp below exactly as ideas drive
    // through postIdeaDocumentOp above. Driving the op below
    // the org fence, the unscoped store stamps nothing, so
    // organization_id rides in the seed body instead of the
    // (route-only) omission. projectGenesis (including the
    // org-2 override's own row) is imported from
    // seed-message-pairs.ts — pass 1 there needs the SAME array
    // to form each project's pair before the rehearsal's
    // writes. projectOrg2 extends projects[0] under organization
    // 'BBjWJsjYIDkTRKIIPrzWRw' —
    // the SAME construction pass 1 uses, so a seeded pair can
    // never drift from what this write actually stores.
    const projectGenesisById = new Map(
        projectGenesis.map(g => [g.entityId, g]),
    );

    await Promise.all(
        [...projects, projectOrg2(projects)].map(project => {
            const genesis =
                projectGenesisById.get(project.id)!;
            const organization = projectOrganizationFor(project);
            return postProjectDocumentOp(
                adapter,
                project.id,
                projectSeedBody(
                    project, genesis.state, organization,
                ),
                genesis.memberId,
                requireMessagePair(
                    messagePairs, seedMessagePairKey('projects', project.id),
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
    // pair before the rehearsal's writes.
    const flowStateEventByFlowId = new Map(
        flowStateEvents.map(e => [e.entity_id, e]),
    );

    // Records: app-global data shapes that flows
    // bind to. Customer Profile carries the
    // company-info attributes referenced by the
    // Customer Onboarding Data Capture and Review
    // nodes, and is multi-bound to Lead-to-Close.
    // Project Brief carries the idea-shape
    // attributes referenced by Fusion Angle Flow's
    // Describe-problem and Solution nodes.
    const mockRecords = buildRecords();

    const mockRecordAttributes = buildRecordAttributes();

    // mockFlowRecords (the flow-record join rows) is imported
    // from seed-message-pairs.ts — pass 1 there needs the SAME
    // array to form each join's pair before the rehearsal's
    // writes.

    // One genesis row per seeded Record: its initial
    // state and the member credited with creating it.
    // Phase Final Task 2: records + record_attributes +
    // flow_records ROW halves stripped — seed drives
    // through postRecordWriteOp / postFlowRecordDocumentOp
    // (pairs + states.postEvent only). recordGenesis
    // is imported from seed-message-pairs.ts — pass 1
    // there needs the SAME array to form each record's
    // pair before the rehearsal's writes.
    const recordGenesisById = new Map(
        recordGenesis.map(g => [g.entityId, g]),
    );

    const mockWorkOrders = buildWorkOrders();

    const mockFlowWorkOrders = buildFlowWorkOrderJoins();

    const mockStateEvents = buildWorkOrderStateEvents();

    // mockProjectFlows is imported from
    // seed-message-pairs.ts — pass 1 there needs the SAME
    // array to form each flow's pair before the rehearsal's
    // writes.

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
            // message pair plus its two synthesized siblings,
            // each pre-formed in pass 1 under its own
            // deterministic key (seed-message-pairs.ts).
            const flowMessagePairs: FlowCreationMessagePairs = {
                operation: requireMessagePair(
                    messagePairs, seedMessagePairKey('flows', flow.id),
                ),
                document: requireMessagePair(
                    messagePairs, seedMessagePairKey('flows/:id', flow.id),
                ),
                join: requireMessagePair(
                    messagePairs,
                    seedMessagePairKey(
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
                flowMessagePairs,
            );
        }),
        // Organization 'BBjWJsjYIDkTRKIIPrzWRw' owns a small, self-contained
        // slice so each
        // org owns at least one project (postProjectDocumentOp
        // above seeds projectOrg2) and flow. The whole
        // work-order graph stays in org 'AjdvjuECVZEgZoFajaIEkg', so org
        // 'BBjWJsjYIDkTRKIIPrzWRw' gets a
        // work-order-free flow and a flow-free project — no
        // cross-org coupling. seed-flow-org2 has no
        // project_flows join row, so it drives through
        // postFlowDocumentOp (Task 6) instead of
        // postFlowCreationOp, which requires one.
        postFlowDocumentOp(
            adapter,
            seedIdentifier('seed-flow-org2'),
            flowOrg2SeedBody(),
            SYSTEM_MEMBER_ID,
            requireMessagePair(
                messagePairs,
                seedMessagePairKey(
                    'flows/:id',
                    seedIdentifier('seed-flow-org2'),
                ),
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
                requireMessagePair(
                    messagePairs,
                    seedMessagePairKey('idea-submissions', r.id),
                ),
            ),
        ),
        ...mockWorkOrders.map(r =>
            postWorkOrderDocumentOp(
                adapter,
                r.id,
                workOrderDocumentSeedBody(r),
                SYSTEM_MEMBER_ID,
                requireMessagePair(
                    messagePairs,
                    seedMessagePairKey(
                        'work-orders/:id', r.id,
                    ),
                ),
            ),
        ),
        ...mockFlowWorkOrders.map(r =>
            postFlowWorkOrderDocumentOp(
                adapter,
                r.id,
                flowWorkOrderJoinSeedBody(r),
                SYSTEM_MEMBER_ID,
                requireMessagePair(
                    messagePairs,
                    seedMessagePairKey(
                        'flows/:id/work-orders/:woid', r.id,
                    ),
                ),
            ),
        ),
        // States-document retirement Task 12: every historical
        // trace drives through the live transition op — body
        // validates via validateWorkOrderTransitionBody. WO-
        // instance SoT Task 6: value-bearing WO01 events leave
        // this loop (they drive the instance chain below).
        ...mockStateEvents
            .filter((r) =>
                !VALUE_BEARING_TRANSITION_EVENT_IDS.has(
                    r.id,
                ))
            .map(r =>
                postWorkOrderTransitionOp(
                    adapter,
                    r.entity_id,
                    transitionSeedBody(r),
                    r.member_id,
                    undefined,
                    [],
                    requireMessagePair(
                        messagePairs,
                        seedMessagePairKey(
                            'work-orders/:id/transition',
                            r.id,
                        ),
                    ),
                ),
            ),
        ...aiMembers.map(m => {
            const { id: _id, ...fields } = m;
            return postAiAgentDocumentOp(
                adapter,
                m.id,
                fields,
                SYSTEM_MEMBER_ID,
                requireMessagePair(
                    messagePairs, seedMessagePairKey('ai-agents/:id', m.id),
                ),
            );
        }),
        ...leadToCloseData.workOrders.map(r =>
            postWorkOrderDocumentOp(
                adapter,
                r.id,
                workOrderDocumentSeedBody(r),
                SYSTEM_MEMBER_ID,
                requireMessagePair(
                    messagePairs,
                    seedMessagePairKey(
                        'work-orders/:id', r.id,
                    ),
                ),
            ),
        ),
        ...leadToCloseData.flowWorkOrders.map(r =>
            postFlowWorkOrderDocumentOp(
                adapter,
                r.id,
                flowWorkOrderJoinSeedBody(r),
                SYSTEM_MEMBER_ID,
                requireMessagePair(
                    messagePairs,
                    seedMessagePairKey(
                        'flows/:id/work-orders/:woid', r.id,
                    ),
                ),
            ),
        ),
        ...leadToCloseData.stateEvents
            .filter((r) =>
                !VALUE_BEARING_TRANSITION_EVENT_IDS.has(
                    r.id,
                ))
            .map(r =>
                postWorkOrderTransitionOp(
                    adapter,
                    r.entity_id,
                    transitionSeedBody(r),
                    r.member_id,
                    undefined,
                    [],
                    requireMessagePair(
                        messagePairs,
                        seedMessagePairKey(
                            'work-orders/:id/transition',
                            r.id,
                        ),
                    ),
                ),
            ),
        ...mockRecords.map((r, i) => {
            const genesis = recordGenesisById.get(r.id)!;
            const attributes = mockRecordAttributes.filter(
                a => a.record_id === r.id,
            );
            // The bundle assembled from per-pair requireMessagePair
            // lookups (Phase 6 Task 4) — the FlowCreationMessagePairs
            // assembly precedent above, generalized from fixed
            // cardinality 3 to 1+1+N: the operation and document
            // pairs each resolve by their own deterministic key,
            // one attribute-PUT pair per seeded attribute, and
            // an empty attributeDeletes (the seed never removes
            // an attribute it just created).
            const recordMessagePairs: RecordWriteMessagePairs = {
                operation: requireMessagePair(
                    messagePairs,
                    seedMessagePairKey(
                        RECORD_TYPES_COLLECTION_PATTERN,
                        r.id,
                    ),
                ),
                document: requireMessagePair(
                    messagePairs,
                    seedMessagePairKey(
                        RECORD_TYPE_DETAIL_PATTERN, r.id,
                    ),
                ),
                attributePuts: attributes.map(a =>
                    requireMessagePair(
                        messagePairs,
                        seedMessagePairKey(
                            ATTRIBUTE_DETAIL_PATTERN, a.id,
                        ),
                    ),
                ),
                attributeDeletes: [],
            };
            return postRecordWriteOp(
                adapter,
                recordSeedBody(r, i, genesis.state, attributes),
                genesis.memberId,
                recordMessagePairs,
            );
        }),
    ]);

    // Bindings probe their record inside the write gate
    // (postFlowRecordDocumentOp), so the records above must
    // have landed first — a second wave, not a spread into
    // the first.
    await Promise.all(
        mockFlowRecords.map(r =>
            postFlowRecordDocumentOp(
                adapter,
                r.id,
                flowRecordJoinSeedBody(r),
                SYSTEM_MEMBER_ID,
                flowRecordOrganizationFor(r),
                requireMessagePair(
                    messagePairs,
                    seedMessagePairKey(
                        'flows/:id/records/:frid', r.id,
                    ),
                ),
            ),
        ),
    );
    await postInstanceChainIn(
        adapter, input.instanceChain, input.requestAt,
    );

    // A score or revision author is always a member of the
    // scored entity's org. Seed authors from that org ONLY:
    // picking across orgs produced authors outside the
    // org-scoped roster, and memberName (strict by design)
    // then threw when the project-history modal resolved them.
    //
    // The STARK-org objective revisions' author cannot read
    // memberships back in the rehearsal: its pair was already
    // formed before the rehearsal's writes (pass 1, before any
    // membership row existed to read back), so pass 2 must pick
    // from the SAME pure pool pass 1 used — see
    // humanMemberPoolsByOrganization's doc comment for why the
    // two are proven to agree. The baseline/actual-score
    // deferral below (buildSeedScoreRows) draws from this SAME
    // pool now too — the former memberFor DB-read done in the
    // rehearsal retired once its pick moved onto
    // pickHumanMember (Phase 7 Task 5).
    // Phase Final Task 2: objectives + objective_revisions
    // ROW halves stripped — seed drives through
    // postObjectiveCreationOp (pairs only).
    const objectiveMemberPools =
        humanMemberPoolsByOrganization(members);
    for (const seed of OBJECTIVE_SEEDS) {
        const memberId = pickHumanMember(
            objectiveMemberPools, STARK_ORGANIZATION,
            `${seed.id}:revision`,
        );
        // Create threads the triple — the operation message
        // pair plus its two synthesized siblings (document,
        // revision), each pre-formed in pass 1 under its own
        // deterministic key (seed-message-pairs.ts) — fixed
        // 1+1+1. The revision id is recomputed identically to
        // objectiveSeedBody's own construction (deterministic).
        const revisionId = seedIdentifier(
            `${seed.id}:${MOCK_SEED_TIMESTAMP}`,
        );
        const objectiveMessagePairs: ObjectiveCreationMessagePairs = {
            operation: requireMessagePair(
                messagePairs, seedMessagePairKey('objectives', seed.id),
            ),
            document: requireMessagePair(
                messagePairs, seedMessagePairKey('objectives/:id', seed.id),
            ),
            revision: requireMessagePair(
                messagePairs,
                seedMessagePairKey(
                    'objectives/:id/revisions/:rid', revisionId,
                ),
            ),
        };
        await postObjectiveCreationOp(
            adapter,
            objectiveSeedBody(
                seed, STARK_ORGANIZATION, memberId,
            ),
            objectiveMessagePairs,
        );
    }

    // Organization 'BBjWJsjYIDkTRKIIPrzWRw' owns one objective so each org
    // owns
    // at least one (message plane only after Task 2 strip).
    const org2RevisionId = seedIdentifier(
        `${ORGANIZATION_TWO_OBJECTIVE.id}:${MOCK_SEED_TIMESTAMP}`,
    );
    await postObjectiveCreationOp(
        adapter,
        objectiveSeedBody(
            ORGANIZATION_TWO_OBJECTIVE, ORGANIZATION_TWO,
            SYSTEM_MEMBER_ID,
        ),
        {
            operation: requireMessagePair(
                messagePairs,
                seedMessagePairKey(
                    'objectives', ORGANIZATION_TWO_OBJECTIVE.id,
                ),
            ),
            document: requireMessagePair(
                messagePairs,
                seedMessagePairKey(
                    'objectives/:id',
                    ORGANIZATION_TWO_OBJECTIVE.id,
                ),
            ),
            revision: requireMessagePair(
                messagePairs,
                seedMessagePairKey(
                    'objectives/:id/revisions/:rid',
                    org2RevisionId,
                ),
            ),
        },
    );

    // The baseline/actual-score rows — hoisted VERBATIM into a
    // pure builder (Phase 7 Task 5) so pass 1 (seed-message-
    // pairs.ts) forms each row's message pair before the
    // rehearsal's writes, the SAME split every other seeded
    // family already uses. buildScoreSeedProjects resolves each
    // project's organization_id/state PURELY (never a DB read
    // back). This closes the scores half of the Phase 0 seed
    // deferral WHOLE — baselines AND actuals — one document
    // message pair per row, driven through
    // postBaselineScoreDocumentOp / postActualScoreDocumentOp
    // exactly as every other seeded family drives through
    // its own extracted op.
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
                requireMessagePair(
                    messagePairs,
                    seedMessagePairKey(baselineScorePattern, row.id),
                ),
            )),
        ...scoreRows.actuals.map(row =>
            postActualScoreDocumentOp(
                adapter, row.id, row.fields,
                row.fields.member_id,
                requireMessagePair(
                    messagePairs,
                    seedMessagePairKey(actualScorePattern, row.id),
                ),
            )),
    ]);
}

export async function rehearseBootstrap(
    options?: PostMockDataLoadOptions,
): Promise<RehearsedSeed> {
    const bootstrapEmail =
        bootstrapCurrentMemberPiiBody()['email'];
    if (typeof bootstrapEmail !== 'string') {
        throw new Error('bootstrap PII body lacks email');
    }
    const credentials = await hashSeedCredentials(
        [{
            identityId: 'XXZruirZyAOoRpNxaDnpSA',
            email: bootstrapEmail,
        }],
        options?.hashPassword ?? hashPassword,
    );
    const seedRunId = generateIdentifier();
    const requestAt = nowUtc();
    const bootstrap =
        await formBootstrapMessagePair(requestAt);
    const credentialPairs =
        await formSeedCredentialMessagePairs(
            credentials.humans, credentials.system,
            requestAt,
        );
    const statements = await rehearse(
        new MemoryStorageBackend(),
        async (db) => {
            await postBootstrapIn(
                db,
                bootstrap.identityMessagePair,
                bootstrap.seatMessagePair,
                bootstrap.piiMessagePair,
                bootstrap.systemIdentityMessagePair,
                bootstrap.defaultOrganizationMessagePair,
                bootstrap.organizationMessagePair,
            );
            await postSeedCredentialsIn(
                db, credentials, credentialPairs,
            );
        },
    );
    return {
        rehearsal: { seedRunId, statements },
        credentials: revealedCredentials(credentials),
    };
}

export async function postBootstrap(
    adapter: BackedDbAdapter,
    options?: PostMockDataLoadOptions,
): Promise<SeededCredentials> {
    const seed = await rehearseBootstrap(options);
    await postSeedLanding(adapter.backend, seed.rehearsal);
    return seed.credentials;
}

export async function postBootstrapIn(
    adapter: DbAdapter,
    identityMessagePair: MessagePair,
    seatMessagePair: MessagePair,
    piiMessagePair: MessagePair,
    systemIdentityMessagePair: MessagePair,
    defaultOrganizationMessagePair: MessagePair,
    organizationMessagePair: MessagePair,
): Promise<void> {
    await Promise.all([
        postIdentityDocumentOp(
            adapter,
            SYSTEM_MEMBER_ID,
            identityDocumentBodyOf('service'),
            SYSTEM_MEMBER_ID,
            systemIdentityMessagePair,
        ),
        postIdentityDocumentOp(
            adapter,
            'XXZruirZyAOoRpNxaDnpSA',
            bootstrapCurrentIdentityBody(),
            SYSTEM_MEMBER_ID,
            identityMessagePair,
        ),
        postMembershipDocumentOp(
            adapter,
            'XXZruirZyAOoRpNxaDnpSA',
            seatSeedBody('admin', seatMessagePair.requestAt),
            SYSTEM_MEMBER_ID,
            seatMessagePair,
        ),
        postIdentityPiiDocumentOp(
            adapter, 'XXZruirZyAOoRpNxaDnpSA'
                , bootstrapCurrentMemberPiiBody(),
            SYSTEM_MEMBER_ID, piiMessagePair,
        ),
    ]);
    await Promise.all([
        putIdentityDefaultOrganization(
            adapter,
            ['XXZruirZyAOoRpNxaDnpSA'],
            defaultOrganizationSeedBody(STARK_ORGANIZATION),
            'XXZruirZyAOoRpNxaDnpSA',
            defaultOrganizationMessagePair,
        ),
        postOrganizationDocumentOp(
            adapter,
            [STARK_ORGANIZATION],
            seededOrganizationBody(STARK_ORGANIZATION),
            SYSTEM_MEMBER_ID,
            organizationMessagePair,
        ),
    ]);
}
