// Slice credential-reveal type for the test-plan seeder.
// AA reuses bootstrap; every other section gets one
// organization plus an admin. B, G, and SV add extra
// identities (G also a second organization). Form pairs
// outside the transaction; write them inside it.

import {
    TABLE_NAMES,
    type DbAdapter,
} from './db.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
    DEFAULT_LOCK_TIMEOUT,
    type StateEntity,
} from './types.ts';
import {
    postIdentityDocumentOp,
    postIdentityPiiDocumentOp,
    postMembershipDocumentOp,
    postFlowDocumentOp,
    postAiAgentDocumentOp,
    postIdeaDocumentOp,
    postProjectDocumentOp,
    postRecordWriteOp,
    postObjectiveCreationOp,
    postFlowCreationOp,
    postWorkOrderDocumentOp,
    postWorkOrderTransitionOp,
    postFlowWorkOrderDocumentOp,
    recordDocumentBodyOf,
    recordAttributeDocumentBodyOf,
    objectiveDocumentBodyOf,
    objectiveRevisionBodyOf,
    flowCreateDocumentBody,
    type RecordWritePairs,
    type ObjectiveCreationPairs,
    type FlowCreationPairs,
} from './routes.ts';
import type { MessagePair } from
    './message-pair.ts';
import { appendMessagePair } from
    './message-pair.ts';
import {
    formBootstrapMessagePair,
    formDefaultOrganizationSeedPair,
    formSeedPair,
    seedPairKey,
    organizationSeedBody,
    seatSeedBody,
    bootstrapCurrentIdentityBody,
    flowOrg2SeedBody,
    projectSeedBody,
    objectiveSeedBody,
    flowWorkOrderJoinSeedBody,
} from './mock-data/seed-message-pairs.ts';
import { daysFromNow } from
    './mock-data/seed-kit.ts';
import { STARK_ORGANIZATION } from
    './mock-data/seed-constants.ts';
import {
    postBootstrapIn,
    seedHumanCredentials,
    type SeededCredentials,
} from './mock-data.ts';
import {
    ORGANIZATION_MEMBER_DETAIL_PATTERN,
    RECORD_TYPES_COLLECTION_PATTERN,
    RECORD_TYPE_DETAIL_PATTERN,
    ATTRIBUTE_DETAIL_PATTERN,
} from './family-registry.ts';
import { buildAiMembers } from
    './mock-data/ai-members.ts';
import { buildIdeas } from
    './mock-data/ideas.ts';
import { buildProjects } from
    './mock-data/projects.ts';
import { OBJECTIVE_SEEDS } from
    './mock-data/objectives.ts';
import { buildRecords } from
    './mock-data/records.ts';
import { buildFlowGraphRelations } from
    './mock-data/flows.ts';
import {
    validateObjectiveCreateBody,
    validateRecordWriteBody,
    validateFlowCreateBody,
} from './validators.ts';

export type TestPlanSliceReveal = {
    readonly section: string;
    readonly organizationId: string;
    readonly organizationName: string;
    readonly adminUsername: string;
    readonly adminPassword: string;
    readonly secondOrganizationId?: string;
    readonly secondOrganizationName?: string;
    readonly seatUsername?: string;
    readonly seatPassword?: string;
    readonly unseatedUsername?: string;
    readonly unseatedPassword?: string;
    readonly memberUsername?: string;
    readonly memberPassword?: string;
    readonly flowId?: string;
};

export const PARALLEL_SECTIONS = [
    'AA', 'B', 'C', 'D', 'E', 'F', 'F2',
    'FS', 'G', 'H', 'I', 'K', 'R', 'SV',
] as const;

export type ParallelSection =
    typeof PARALLEL_SECTIONS[number];

export function sectionToken(
    section: ParallelSection,
): string {
    return section.toLowerCase();
}

type Hasher = (
    plaintext: string,
) => Promise<string>;

const STARK_NAME = 'Stark Industries';

type TenantAdminPairs = {
    readonly organizationId: string;
    readonly adminId: string;
    readonly email: string;
    readonly requestAt: string;
    readonly piiBody: Record<string, unknown>;
    readonly organizationPair: MessagePair;
    readonly identityPair: MessagePair;
    readonly piiPair: MessagePair;
    readonly seatPair: MessagePair;
    readonly defaultOrganizationPair: MessagePair;
};

function tenantAdminPiiBody(
    name: string,
    email: string,
): Record<string, unknown> {
    return {
        name,
        email,
        phone: '+1 (555) 000-0000',
        bio: 'Test-plan section admin.',
    };
}

async function formTenantAdminPairs(
    section: ParallelSection,
    requestAt: string,
): Promise<TenantAdminPairs> {
    const token = sectionToken(section);
    const organizationId = token + '-org';
    const adminId = token + '-admin';
    const email = token
        + '-admin@test-plan.example';
    const piiBody = tenantAdminPiiBody(
        section + ' Admin',
        email,
    );
    const organizationPair = await formSeedPair(
        {
            key: seedPairKey(
                'organizations/:id',
                organizationId,
            ),
            routePattern: 'organizations/:id',
            idParams: [organizationId],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: organizationSeedBody(
                STARK_NAME,
                token + '.test-plan.example',
                daysFromNow(300, 0, 0),
            ),
        },
        requestAt,
    );
    const identityPair = await formSeedPair(
        {
            key: seedPairKey(
                'identities/:id', adminId,
            ),
            routePattern: 'identities/:id',
            idParams: [adminId],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: bootstrapCurrentIdentityBody(),
        },
        requestAt,
    );
    const piiPair = await formSeedPair(
        {
            key: seedPairKey(
                'identities/:id/pii', adminId,
            ),
            routePattern: 'identities/:id/pii',
            idParams: [adminId],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: piiBody,
        },
        requestAt,
    );
    const seatPair = await formSeedPair(
        {
            key: seedPairKey(
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
                adminId,
            ),
            routePattern:
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
            idParams: [organizationId, adminId],
            organization: organizationId,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: seatSeedBody('admin', requestAt),
        },
        requestAt,
    );
    const defaultOrganizationPair =
        await formDefaultOrganizationSeedPair(
            adminId, organizationId, requestAt,
        );
    return {
        organizationId,
        adminId,
        email,
        requestAt,
        piiBody,
        organizationPair,
        identityPair,
        piiPair,
        seatPair,
        defaultOrganizationPair,
    };
}

async function writeTenantAdmin(
    adapter: DbAdapter,
    formed: TenantAdminPairs,
): Promise<void> {
    await Promise.all([
        appendMessagePair(
            adapter, formed.organizationPair,
        ),
        postIdentityDocumentOp(
            adapter,
            formed.adminId,
            bootstrapCurrentIdentityBody(),
            SYSTEM_MEMBER_ID,
            formed.identityPair,
        ),
        postIdentityPiiDocumentOp(
            adapter,
            formed.adminId,
            formed.piiBody,
            SYSTEM_MEMBER_ID,
            formed.piiPair,
        ),
        postMembershipDocumentOp(
            adapter,
            formed.adminId,
            seatSeedBody(
                'admin', formed.requestAt,
            ),
            SYSTEM_MEMBER_ID,
            formed.seatPair,
        ),
        appendMessagePair(
            adapter,
            formed.defaultOrganizationPair,
        ),
    ]);
}

type ExtraIdentity = {
    readonly identityId: string;
    readonly requestAt: string;
    readonly piiBody: Record<string, unknown>;
    readonly identityPair: MessagePair;
    readonly piiPair: MessagePair;
    readonly seatPair?: MessagePair;
};

type ExtraWrites = {
    readonly identities: readonly ExtraIdentity[];
    readonly organizationPair?: MessagePair;
    readonly extraAdminSeat?: {
        readonly identityId: string;
        readonly requestAt: string;
        readonly pair: MessagePair;
    };
    readonly flow?: {
        readonly id: string;
        readonly body: Record<string, unknown>;
        readonly pair: MessagePair;
    };
    readonly ai?: {
        readonly id: string;
        readonly body: Record<string, unknown>;
        readonly pair: MessagePair;
    };
};

async function formExtraIdentity(
    identityId: string,
    name: string,
    email: string,
    requestAt: string,
    seatOrganizationId?: string,
): Promise<ExtraIdentity> {
    const piiBody = tenantAdminPiiBody(name, email);
    const identityPair = await formSeedPair(
        {
            key: seedPairKey(
                'identities/:id', identityId,
            ),
            routePattern: 'identities/:id',
            idParams: [identityId],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: bootstrapCurrentIdentityBody(),
        },
        requestAt,
    );
    const piiPair = await formSeedPair(
        {
            key: seedPairKey(
                'identities/:id/pii', identityId,
            ),
            routePattern: 'identities/:id/pii',
            idParams: [identityId],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: piiBody,
        },
        requestAt,
    );
    if (seatOrganizationId === undefined) {
        return {
            identityId,
            requestAt,
            piiBody,
            identityPair,
            piiPair,
        };
    }
    const seatPair = await formSeedPair(
        {
            key: seedPairKey(
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
                identityId,
            ),
            routePattern:
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
            idParams: [
                seatOrganizationId, identityId,
            ],
            organization: seatOrganizationId,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: seatSeedBody('member', requestAt),
        },
        requestAt,
    );
    return {
        identityId,
        requestAt,
        piiBody,
        identityPair,
        piiPair,
        seatPair,
    };
}

async function formBExtras(
    organizationId: string,
    requestAt: string,
): Promise<ExtraWrites> {
    const identity = await formExtraIdentity(
        'b-member',
        'B Member',
        'b-member@test-plan.example',
        requestAt,
        organizationId,
    );
    const flowBody = {
        ...flowOrg2SeedBody(),
        organization_id: organizationId,
        name: 'B Return Flow',
    };
    const flowPair = await formSeedPair(
        {
            key: seedPairKey('flows/:id', 'b-flow'),
            routePattern:
                'organizations/:id/flows/:id',
            idParams: [organizationId, 'b-flow'],
            organization: organizationId,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: flowBody,
        },
        requestAt,
    );
    return {
        identities: [identity],
        flow: {
            id: 'b-flow',
            body: flowBody,
            pair: flowPair,
        },
    };
}

async function formGExtras(
    organizationId: string,
    adminId: string,
    requestAt: string,
): Promise<ExtraWrites> {
    const secondOrganizationId = 'g-org-2';
    const organizationPair = await formSeedPair(
        {
            key: seedPairKey(
                'organizations/:id',
                secondOrganizationId,
            ),
            routePattern: 'organizations/:id',
            idParams: [secondOrganizationId],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: organizationSeedBody(
                'Wayne Enterprises',
                'g2.test-plan.example',
                daysFromNow(300, 0, 0),
            ),
        },
        requestAt,
    );
    const extraAdminSeatPair = await formSeedPair(
        {
            key: seedPairKey(
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
                adminId + '-1',
            ),
            routePattern:
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
            idParams: [
                secondOrganizationId, adminId,
            ],
            organization: secondOrganizationId,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: seatSeedBody('admin', requestAt),
        },
        requestAt,
    );
    const unseated = await formExtraIdentity(
        'g-unseated',
        'G Unseated',
        'g-unseated@test-plan.example',
        requestAt,
    );
    const member = await formExtraIdentity(
        'g-member',
        'G Member',
        'g-member@test-plan.example',
        requestAt,
        organizationId,
    );
    const firstAi = buildAiMembers()[0]!;
    const aiBody: Record<string, unknown> = {
        name: firstAi.name,
        description: firstAi.description,
        skill_focus: firstAi.skill_focus,
        model: firstAi.model,
    };
    const aiPair = await formSeedPair(
        {
            key: seedPairKey('ai-agents/:id', 'g-ai'),
            routePattern: 'ai-agents/:id',
            idParams: ['g-ai'],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: aiBody,
        },
        requestAt,
    );
    return {
        identities: [unseated, member],
        organizationPair,
        extraAdminSeat: {
            identityId: adminId,
            requestAt,
            pair: extraAdminSeatPair,
        },
        ai: {
            id: 'g-ai',
            body: aiBody,
            pair: aiPair,
        },
    };
}

async function formSvExtras(
    organizationId: string,
    requestAt: string,
): Promise<ExtraWrites> {
    const identity = await formExtraIdentity(
        'sv-member',
        'SV Member',
        'sv-member@test-plan.example',
        requestAt,
        organizationId,
    );
    return { identities: [identity] };
}

async function writeExtraIdentity(
    adapter: DbAdapter,
    formed: ExtraIdentity,
): Promise<void> {
    const writes: Promise<unknown>[] = [
        postIdentityDocumentOp(
            adapter,
            formed.identityId,
            bootstrapCurrentIdentityBody(),
            SYSTEM_MEMBER_ID,
            formed.identityPair,
        ),
        postIdentityPiiDocumentOp(
            adapter,
            formed.identityId,
            formed.piiBody,
            SYSTEM_MEMBER_ID,
            formed.piiPair,
        ),
    ];
    if (formed.seatPair !== undefined) {
        writes.push(postMembershipDocumentOp(
            adapter,
            formed.identityId,
            seatSeedBody('member', formed.requestAt),
            SYSTEM_MEMBER_ID,
            formed.seatPair,
        ));
    }
    await Promise.all(writes);
}

async function writeExtras(
    adapter: DbAdapter,
    extras: ExtraWrites,
): Promise<void> {
    const writes: Promise<unknown>[] =
        extras.identities.map((identity) =>
            writeExtraIdentity(adapter, identity),
        );
    if (extras.organizationPair !== undefined) {
        writes.push(appendMessagePair(
            adapter, extras.organizationPair,
        ));
    }
    if (extras.extraAdminSeat !== undefined) {
        writes.push(postMembershipDocumentOp(
            adapter,
            extras.extraAdminSeat.identityId,
            seatSeedBody(
                'admin',
                extras.extraAdminSeat.requestAt,
            ),
            SYSTEM_MEMBER_ID,
            extras.extraAdminSeat.pair,
        ));
    }
    if (extras.flow !== undefined) {
        writes.push(postFlowDocumentOp(
            adapter,
            extras.flow.id,
            extras.flow.body,
            SYSTEM_MEMBER_ID,
            extras.flow.pair,
        ));
    }
    if (extras.ai !== undefined) {
        writes.push(postAiAgentDocumentOp(
            adapter,
            extras.ai.id,
            extras.ai.body,
            SYSTEM_MEMBER_ID,
            extras.ai.pair,
        ));
    }
    await Promise.all(writes);
}

const GARDEN_SECTIONS = [
    'C', 'D', 'E', 'F', 'FS', 'K', 'R',
] as const;

const IDEA_GARDEN_STATES = [
    'active',
    'in_review',
    'sent_back',
    'approved',
] as const;

const PROJECT_GARDEN = [
    { suffix: 'submitted', state: 'submitted' },
    { suffix: 'approved', state: 'approved' },
    { suffix: 'approved-2', state: 'approved' },
] as const;

const WORK_ORDER_GARDEN = [
    { suffix: 'capture', node: 'capture', position: 1 },
    { suffix: 'review', node: 'review', position: 2 },
    { suffix: 'archive', node: 'archive', position: 3 },
] as const;

type GardenIdea = {
    readonly id: string;
    readonly body: Record<string, unknown>;
    readonly pair: MessagePair;
};

type GardenProject = {
    readonly id: string;
    readonly body: Record<string, unknown>;
    readonly pair: MessagePair;
};

type GardenObjective = {
    readonly body: Record<string, unknown>;
    readonly pairs: ObjectiveCreationPairs;
};

type GardenRecord = {
    readonly body: Record<string, unknown>;
    readonly pairs: RecordWritePairs;
};

type GardenFlow = {
    readonly body: Record<string, unknown>;
    readonly pairs: FlowCreationPairs;
};

type GardenWorkOrder = {
    readonly id: string;
    readonly body: Record<string, unknown>;
    readonly pair: MessagePair;
    readonly joinId: string;
    readonly joinBody: Record<string, unknown>;
    readonly joinPair: MessagePair;
    readonly transitionBody: Record<string, unknown>;
    readonly transitionPair: MessagePair;
};

type GardenWrites = {
    readonly ideas: readonly GardenIdea[];
    readonly projects: readonly GardenProject[];
    readonly objectives: readonly GardenObjective[];
    readonly record: GardenRecord;
    readonly flow: GardenFlow;
    readonly workOrders: readonly GardenWorkOrder[];
};

async function formGarden(
    token: string,
    organizationId: string,
    adminId: string,
    requestAt: string,
): Promise<GardenWrites> {
    const ideaTemplate = buildIdeas()[0]!;
    const {
        id: _ideaId,
        title: ideaTitle,
        ...ideaFields
    } = ideaTemplate;
    const ideas: GardenIdea[] = [];
    for (const state of IDEA_GARDEN_STATES) {
        const id = token + '-idea-' + state;
        const body: Record<string, unknown> = {
            ...ideaFields,
            title: ideaTitle + ' (' + state + ')',
            organization_id: organizationId,
            state,
        };
        const pair = await formSeedPair(
            {
                key: seedPairKey('ideas', id),
                routePattern:
                    'organizations/:id/ideas/:id',
                idParams: [organizationId, id],
                organization: organizationId,
                requesterIdentityId: adminId,
                body,
            },
            requestAt,
        );
        ideas.push({ id, body, pair });
    }
    const projectTemplate = buildProjects()[0]!;
    const projects: GardenProject[] = [];
    let projectPosition = 1;
    for (const spec of PROJECT_GARDEN) {
        const id = token + '-project-' + spec.suffix;
        const project = {
            ...projectTemplate,
            id,
            title: projectTemplate.title
                + ' (' + spec.suffix + ')',
            position: projectPosition,
        };
        projectPosition += 1;
        const event: StateEntity = {
            id: id + '-state',
            entity_id: id,
            member_id: adminId,
            at: requestAt,
            state: spec.state,
        };
        const body = projectSeedBody(
            project, event, organizationId,
        );
        const pair = await formSeedPair(
            {
                key: seedPairKey('projects', id),
                routePattern:
                    'organizations/:id/projects/:id',
                idParams: [organizationId, id],
                organization: organizationId,
                requesterIdentityId: adminId,
                body,
            },
            requestAt,
        );
        projects.push({ id, body, pair });
    }
    const objectives: GardenObjective[] = [];
    for (let i = 0; i < OBJECTIVE_SEEDS.length; i++) {
        const source = OBJECTIVE_SEEDS[i]!;
        const seed = {
            ...source,
            id: token + '-obj-' + (i + 1),
        };
        const body = objectiveSeedBody(
            seed, organizationId, adminId,
        );
        const validated =
            validateObjectiveCreateBody(body);
        const operation = await formSeedPair(
            {
                key: seedPairKey(
                    'objectives', seed.id,
                ),
                routePattern:
                    'organizations/:id/objectives/',
                idParams: [organizationId],
                op: true,
                organization: organizationId,
                requesterIdentityId: adminId,
                body,
            },
            requestAt,
        );
        const document = await formSeedPair(
            {
                key: seedPairKey(
                    'objectives/:id', seed.id,
                ),
                routePattern:
                    'organizations/:id/objectives/:id',
                idParams: [
                    organizationId, seed.id,
                ],
                organization: organizationId,
                requesterIdentityId: adminId,
                body: objectiveDocumentBodyOf(
                    validated,
                ),
            },
            requestAt,
        );
        const revision = await formSeedPair(
            {
                key: seedPairKey(
                    'objectives/:id/revisions/:rid',
                    validated.revisionId,
                ),
                routePattern:
                    'organizations/:id/objectives/:id'
                    + '/revisions/:rid',
                idParams: [
                    organizationId,
                    seed.id,
                    validated.revisionId,
                ],
                organization: organizationId,
                requesterIdentityId: adminId,
                body: objectiveRevisionBodyOf(
                    validated,
                ),
            },
            requestAt,
        );
        objectives.push({
            body,
            pairs: {
                operation, document, revision,
            },
        });
    }
    const profile = buildRecords()[0]!;
    const recordId = token + '-record-customer';
    const attributeRows = [
        {
            id: token + '-attr-1',
            record_id: recordId,
            organization_id: organizationId,
            name: 'Company Name',
            attribute_type: 'text',
            sort_order: 1,
            options: [] as string[],
            constraints: [] as unknown[],
        },
        {
            id: token + '-attr-2',
            record_id: recordId,
            organization_id: organizationId,
            name: 'Contact Email',
            attribute_type: 'text',
            sort_order: 2,
            options: [] as string[],
            constraints: [] as unknown[],
        },
    ];
    const recordBody: Record<string, unknown> = {
        kind: 'create',
        id: recordId,
        record: {
            organization_id: organizationId,
            name: profile.name,
            description: profile.description,
            position: profile.position,
        },
        attributes: attributeRows,
        initialState: 'active',
        initialStateEventId:
            token + '-state-record-customer',
        initialStateAt: requestAt,
    };
    const validatedRecord =
        validateRecordWriteBody(recordBody);
    const recordOperation = await formSeedPair(
        {
            key: seedPairKey(
                RECORD_TYPES_COLLECTION_PATTERN,
                recordId,
            ),
            routePattern:
                RECORD_TYPES_COLLECTION_PATTERN,
            idParams: [organizationId],
            op: true,
            organization: organizationId,
            requesterIdentityId: adminId,
            body: recordBody,
        },
        requestAt,
    );
    const recordDocument = await formSeedPair(
        {
            key: seedPairKey(
                RECORD_TYPE_DETAIL_PATTERN, recordId,
            ),
            routePattern: RECORD_TYPE_DETAIL_PATTERN,
            idParams: [organizationId, recordId],
            organization: organizationId,
            requesterIdentityId: adminId,
            body: recordDocumentBodyOf(
                validatedRecord,
            ),
        },
        requestAt,
    );
    const attributePuts: MessagePair[] = [];
    for (const attribute of attributeRows) {
        attributePuts.push(await formSeedPair(
            {
                key: seedPairKey(
                    ATTRIBUTE_DETAIL_PATTERN,
                    attribute.id,
                ),
                routePattern: ATTRIBUTE_DETAIL_PATTERN,
                idParams: [
                    organizationId,
                    recordId,
                    attribute.id,
                ],
                organization: organizationId,
                requesterIdentityId: adminId,
                body: recordAttributeDocumentBodyOf(
                    attribute as unknown as
                        Record<string, unknown>,
                ),
            },
            requestAt,
        ));
    }
    const flowId = token + '-flow';
    const createNodeId = token + '-node-create';
    const captureNodeId = token + '-node-capture';
    const reviewNodeId = token + '-node-review';
    const archiveNodeId = token + '-node-archive';
    const graph: Record<string, unknown> = {
        nodes: [
            {
                id: createNodeId,
                name: 'Create',
                positionX: 40,
                positionY: 30,
                isCreate: true,
                isArchive: false,
                taskInstructions: '',
                memberIds: [],
                attributes: [],
            },
            {
                id: captureNodeId,
                name: 'Data Capture',
                positionX: 260,
                positionY: 140,
                isCreate: false,
                isArchive: false,
                taskInstructions: '',
                memberIds: [adminId],
                attributes: [],
            },
            {
                id: reviewNodeId,
                name: 'Review',
                positionX: 480,
                positionY: 250,
                isCreate: false,
                isArchive: false,
                taskInstructions: '',
                memberIds: [adminId],
                attributes: [],
            },
            {
                id: archiveNodeId,
                name: 'Archive',
                positionX: 680,
                positionY: 370,
                isCreate: false,
                isArchive: true,
                taskInstructions: '',
                memberIds: [],
                attributes: [],
            },
        ],
        edges: [
            {
                id: token + '-edge-begin',
                name: 'begin',
                fromNodeId: createNodeId,
                toNodeId: captureNodeId,
            },
            {
                id: token + '-edge-submit',
                name: 'submit',
                fromNodeId: captureNodeId,
                toNodeId: reviewNodeId,
            },
            {
                id: token + '-edge-approve',
                name: 'approve',
                fromNodeId: reviewNodeId,
                toNodeId: archiveNodeId,
            },
        ],
    };
    const relations = buildFlowGraphRelations(
        [{ id: flowId, graph }],
        requestAt,
    );
    const projectId = token + '-project-approved';
    const projectFlowId = token + '-project-flow';
    const nodeIds = new Set(
        relations.nodes.map((node) => node.id),
    );
    const flowBody: Record<string, unknown> = {
        id: flowId,
        flow: {
            organization_id: organizationId,
            name: 'Customer Onboarding',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
        },
        projectFlowId,
        projectFlow: {
            project_id: projectId,
            flow_id: flowId,
            at: requestAt,
        },
        initialState: 'active',
        initialStateEventId: token + '-state-flow',
        initialStateAt: requestAt,
        graphDelta: {
            nodes: relations.nodes,
            edges: relations.edges,
            deletions: [],
            memberEvents: relations.members.filter(
                (row) => nodeIds.has(row.flow_node_id),
            ),
            attributeEvents: relations.attributes.filter(
                (row) => nodeIds.has(row.flow_node_id),
            ),
        },
    };
    const validatedFlow =
        validateFlowCreateBody(flowBody);
    const flowOperation = await formSeedPair(
        {
            key: seedPairKey('flows', flowId),
            routePattern: 'organizations/:id/flows/',
            idParams: [organizationId],
            op: true,
            organization: organizationId,
            requesterIdentityId: adminId,
            body: flowBody,
        },
        requestAt,
    );
    const flowDocument = await formSeedPair(
        {
            key: seedPairKey('flows/:id', flowId),
            routePattern:
                'organizations/:id/flows/:id',
            idParams: [organizationId, flowId],
            organization: organizationId,
            requesterIdentityId: adminId,
            body: flowCreateDocumentBody(
                validatedFlow,
            ),
        },
        requestAt,
    );
    const flowJoin = await formSeedPair(
        {
            key: seedPairKey(
                'projects/:id/flows/:pfid',
                projectFlowId,
            ),
            routePattern:
                'organizations/:id/projects/:id'
                + '/flows/:pfid',
            idParams: [
                organizationId,
                projectId,
                projectFlowId,
            ],
            organization: organizationId,
            requesterIdentityId: adminId,
            body: validatedFlow.projectFlow,
        },
        requestAt,
    );
    const frozenGraph: Record<string, unknown> = {
        name: 'Customer Onboarding',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: graph['nodes'],
        edges: graph['edges'],
    };
    const parkNodeId: Record<string, string> = {
        capture: captureNodeId,
        review: reviewNodeId,
        archive: archiveNodeId,
    };
    const workOrders: GardenWorkOrder[] = [];
    for (const spec of WORK_ORDER_GARDEN) {
        const id = token + '-wo-' + spec.suffix;
        const body: Record<string, unknown> = {
            display_id: token + spec.position,
            flow_graph: frozenGraph,
            position: spec.position,
            organization_id: organizationId,
        };
        const pair = await formSeedPair(
            {
                key: seedPairKey(
                    'work-orders/:id', id,
                ),
                routePattern:
                    'organizations/:id/work-orders/:id',
                idParams: [organizationId, id],
                organization: organizationId,
                requesterIdentityId: adminId,
                body,
            },
            requestAt,
        );
        const joinId = id;
        const joinBody = flowWorkOrderJoinSeedBody({
            id: joinId,
            flow_id: flowId,
            work_order_id: id,
            at: requestAt,
        });
        const joinPair = await formSeedPair(
            {
                key: seedPairKey(
                    'flows/:id/work-orders/:woid',
                    joinId,
                ),
                routePattern:
                    'organizations/:id/flows/:id'
                    + '/work-orders/:woid',
                idParams: [
                    organizationId, flowId, joinId,
                ],
                organization: organizationId,
                requesterIdentityId: adminId,
                body: joinBody,
            },
            requestAt,
        );
        const parkId = parkNodeId[spec.node]!;
        const transitionEventId =
            token + '-wo-' + spec.suffix + '-move';
        const transitionBody: Record<string, unknown> = {
            transitionEventId,
            targetState: parkId,
            fieldValues: [],
            release: null,
            transitionAt: requestAt,
        };
        const transitionPair = await formSeedPair(
            {
                key: seedPairKey(
                    'work-orders/:id/transition',
                    transitionEventId,
                ),
                routePattern:
                    'organizations/:id/work-orders/:id'
                    + '/transition',
                idParams: [organizationId, id],
                op: true,
                organization: organizationId,
                requesterIdentityId: adminId,
                body: transitionBody,
            },
            requestAt,
        );
        workOrders.push({
            id,
            body,
            pair,
            joinId,
            joinBody,
            joinPair,
            transitionBody,
            transitionPair,
        });
    }
    return {
        ideas,
        projects,
        objectives,
        record: {
            body: recordBody,
            pairs: {
                operation: recordOperation,
                document: recordDocument,
                attributePuts,
                attributeDeletes: [],
            },
        },
        flow: {
            body: flowBody,
            pairs: {
                operation: flowOperation,
                document: flowDocument,
                join: flowJoin,
            },
        },
        workOrders,
    };
}

async function writeGarden(
    adapter: DbAdapter,
    garden: GardenWrites,
): Promise<void> {
    await Promise.all([
        ...garden.ideas.map((idea) =>
            postIdeaDocumentOp(
                adapter,
                idea.id,
                idea.body,
                SYSTEM_MEMBER_ID,
                idea.pair,
            ),
        ),
        ...garden.projects.map((project) =>
            postProjectDocumentOp(
                adapter,
                project.id,
                project.body,
                SYSTEM_MEMBER_ID,
                project.pair,
            ),
        ),
        ...garden.objectives.map((objective) =>
            postObjectiveCreationOp(
                adapter,
                objective.body,
                objective.pairs,
            ),
        ),
        postRecordWriteOp(
            adapter,
            garden.record.body,
            SYSTEM_MEMBER_ID,
            garden.record.pairs,
        ),
        postFlowCreationOp(
            adapter,
            garden.flow.body,
            SYSTEM_MEMBER_ID,
            garden.flow.pairs,
        ),
        ...garden.workOrders.map((workOrder) =>
            postWorkOrderDocumentOp(
                adapter,
                workOrder.id,
                workOrder.body,
                SYSTEM_MEMBER_ID,
                workOrder.pair,
            ),
        ),
        ...garden.workOrders.map((workOrder) =>
            postFlowWorkOrderDocumentOp(
                adapter,
                workOrder.joinId,
                workOrder.joinBody,
                SYSTEM_MEMBER_ID,
                workOrder.joinPair,
            ),
        ),
        ...garden.workOrders.map((workOrder) =>
            postWorkOrderTransitionOp(
                adapter,
                workOrder.id,
                workOrder.transitionBody,
                SYSTEM_MEMBER_ID,
                undefined,
                [],
                workOrder.transitionPair,
            ),
        ),
    ]);
}

function passwordFor(
    passwords: Map<string, string>,
    username: string | undefined,
): string | undefined {
    if (username === undefined) {
        return undefined;
    }
    const password = passwords.get(username);
    if (password === undefined) {
        throw new Error(
            'seed formed no password for '
                + username,
        );
    }
    return password;
}

function fillPasswords(
    reveals: readonly TestPlanSliceReveal[],
    creds: SeededCredentials,
): TestPlanSliceReveal[] {
    const passwords = new Map<string, string>();
    for (const identity of creds.identities) {
        passwords.set(
            identity.username, identity.password,
        );
    }
    return reveals.map((row) => {
        const adminPassword = passwords.get(
            row.adminUsername,
        );
        if (adminPassword === undefined) {
            throw new Error(
                'seed formed no password for '
                    + row.adminUsername,
            );
        }
        const seatPassword = passwordFor(
            passwords, row.seatUsername,
        );
        const unseatedPassword = passwordFor(
            passwords, row.unseatedUsername,
        );
        const memberPassword = passwordFor(
            passwords, row.memberUsername,
        );
        return {
            ...row,
            adminPassword,
            ...(seatPassword === undefined
                ? {}
                : { seatPassword }),
            ...(unseatedPassword === undefined
                ? {}
                : { unseatedPassword }),
            ...(memberPassword === undefined
                ? {}
                : { memberPassword }),
        };
    });
}

export async function postTestPlanSlices(
    adapter: DbAdapter,
    options?: { readonly hashPassword?: Hasher },
): Promise<readonly TestPlanSliceReveal[]> {
    const requestAt = nowUtc();
    await adapter.ensureTables(TABLE_NAMES);
    const bootstrap =
        await formBootstrapMessagePair(
            requestAt,
        );
    const recipients: Array<{
        readonly identityId: string;
        readonly email: string;
    }> = [{
        identityId: 'current',
        email: 'demo@example.com',
    }];
    const reveals: TestPlanSliceReveal[] = [{
        section: 'AA',
        organizationId: STARK_ORGANIZATION,
        organizationName: STARK_NAME,
        adminUsername: 'demo@example.com',
        adminPassword: '',
    }];
    const formed: TenantAdminPairs[] = [];
    const extras: ExtraWrites[] = [];
    const gardens: GardenWrites[] = [];
    for (const section of PARALLEL_SECTIONS) {
        if (section === 'AA') continue;
        const slice = await formTenantAdminPairs(
            section, requestAt,
        );
        formed.push(slice);
        recipients.push({
            identityId: slice.adminId,
            email: slice.email,
        });
        let reveal: TestPlanSliceReveal = {
            section,
            organizationId: slice.organizationId,
            organizationName: STARK_NAME,
            adminUsername: slice.email,
            adminPassword: '',
        };
        if (section === 'B') {
            extras.push(await formBExtras(
                slice.organizationId, requestAt,
            ));
            recipients.push({
                identityId: 'b-member',
                email:
                    'b-member@test-plan.example',
            });
            reveal = {
                ...reveal,
                seatUsername:
                    'b-member@test-plan.example',
                seatPassword: '',
                flowId: 'b-flow',
            };
        } else if (section === 'G') {
            extras.push(await formGExtras(
                slice.organizationId,
                slice.adminId,
                requestAt,
            ));
            recipients.push({
                identityId: 'g-unseated',
                email:
                    'g-unseated@test-plan.example',
            });
            recipients.push({
                identityId: 'g-member',
                email:
                    'g-member@test-plan.example',
            });
            reveal = {
                ...reveal,
                secondOrganizationId: 'g-org-2',
                secondOrganizationName:
                    'Wayne Enterprises',
                unseatedUsername:
                    'g-unseated@test-plan.example',
                unseatedPassword: '',
                memberUsername:
                    'g-member@test-plan.example',
                memberPassword: '',
            };
        } else if (section === 'SV') {
            extras.push(await formSvExtras(
                slice.organizationId, requestAt,
            ));
            recipients.push({
                identityId: 'sv-member',
                email:
                    'sv-member@test-plan.example',
            });
            reveal = {
                ...reveal,
                seatUsername:
                    'sv-member@test-plan.example',
                seatPassword: '',
            };
        }
        if ((GARDEN_SECTIONS as readonly string[])
            .includes(section)) {
            gardens.push(await formGarden(
                sectionToken(section),
                slice.organizationId,
                slice.adminId,
                requestAt,
            ));
        }
        reveals.push(reveal);
    }
    await adapter.transaction(
        TABLE_NAMES,
        async (view) => {
            await postBootstrapIn(
                view,
                bootstrap.identityPair,
                bootstrap.seatPair,
                bootstrap.piiPair,
                bootstrap.systemIdentityPair,
                bootstrap.defaultOrganizationPair,
                bootstrap.organizationPair,
            );
            await Promise.all(
                formed.map((slice) =>
                    writeTenantAdmin(view, slice),
                ),
            );
            await Promise.all(
                extras.map((extra) =>
                    writeExtras(view, extra),
                ),
            );
            await Promise.all(
                gardens.map((garden) =>
                    writeGarden(view, garden),
                ),
            );
        },
    );
    const creds = await seedHumanCredentials(
        adapter,
        recipients,
        options?.hashPassword,
    );
    const filled = fillPasswords(reveals, creds);
    await adapter.postSchemaCreation();
    return filled;
}
