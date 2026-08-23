import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import {
    postTestPlanSlices, sliceEntityId,
    PARALLEL_SECTIONS,
    type ParallelSection,
} from '../api/test-plan-slices.ts';
import { testHashPassword } from
    './mock-seed.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    organizationToken, claimToken,
} from './token-fixtures.ts';
import { PAGE_REGISTRY } from
    '../web-app/app/page-registry.ts';
import {
    WorkboxDetailPresenter,
} from '../web-app/app/presenters/index.ts';
import {
    instanceListItems,
} from
    '../web-app/app/presenters/record-detail.ts';
import { getDashboardGauges } from
    '../web-app/app/adapters/dashboard.ts';
import {
    getCurrentObjectiveDefinitions,
    getActiveObjectives,
    getObjectives,
    getArchivedObjectiveIds,
    getObjectiveStateDetails,
} from '../web-app/app/adapters/objectives.ts';
import {
    getOrganization,
    getOrganizationStats,
} from '../web-app/app/adapters/admin.ts';
import {
    getSentInvitations, getInvitations,
} from '../web-app/app/adapters/invitations.ts';
import {
    getIdeas, getIdea,
} from '../web-app/app/adapters/ideas.ts';
import {
    getProjects, getProjectEntity,
} from '../web-app/app/adapters/projects.ts';
import {
    getProjectScoring,
    getObjectiveScoringInputs,
    getProjectsScoreColumn,
} from '../web-app/app/adapters/project-scoring.ts';
import {
    getFlowsByProject,
    getFlowsWithProjectNames,
    getFlowGraph,
} from '../web-app/app/adapters/flow-queries.ts';
import { getFlowStats } from
    '../web-app/app/adapters/flow-stats.ts';
import {
    getRecords, getRecordModel, getRecordEntities,
} from '../web-app/app/adapters/records.ts';
import {
    getRecordAttributesByRecord,
    type RecordAttribute,
} from
    '../web-app/app/adapters/record-attributes.ts';
import {
    getRecordInstances, getRecordInstance,
} from
    '../web-app/app/adapters/record-instances.ts';
import {
    getFlowSummariesForRecord,
    getWorkOrdersForRecord,
    getRecordForWorkOrder,
    getRecordForFlow,
} from '../web-app/app/adapters/flow-records.ts';
import {
    getWorkOrders, getWorkOrder,
    getWorkOrderHistories,
    getWorkOrderHistory,
    transitionEventsFromHistory,
    fieldValuesByEventFromHistory,
    activeClaimFromHistory,
} from
    '../web-app/app/adapters/work-orders-queries.ts';
import { getFlowsForCreation } from
    '../web-app/app/adapters/flow-publish.ts';
import {
    getMemberMap, getMembers, fillHumanMemberPii,
} from
    '../web-app/app/adapters/members-union.ts';
import {
    getHumanMember, getHumanMembers,
    getCurrentHumanMember,
} from '../web-app/app/adapters/members.ts';
import { getAIMember, getAIMembers } from
    '../web-app/app/adapters/ai-members.ts';
import {
    getIdentityRoster, getIdentity,
    getMemberPii, getServiceFacet,
    getClientRegistration,
} from '../web-app/app/adapters/identities.ts';
import { getIdentityCredentialState } from
    '../web-app/app/adapters/identity-credentials.ts';
import { getProviderEvents } from
    '../web-app/app/adapters/identity-providers.ts';
import { getTokenChainsFor } from
    '../web-app/app/adapters/identity-tokens.ts';

type BootFn = (
    ctx: RequestContext,
) => Promise<void>;

const MANIFEST: Record<string, BootFn> = {
    dashboard: async (ctx) => {
        await getDashboardGauges(ctx);
        const inputs =
            await getObjectiveScoringInputs(
                ctx,
            );
        await getCurrentObjectiveDefinitions(
            ctx,
            inputs.activeObjectives.map(
                (o) => o.id,
            ),
        );
    },
    organization: async (ctx) => {
        await getOrganization(ctx);
        await getOrganizationStats(ctx);
        const [
            active, all, archivedIds, details,
        ] = await Promise.all([
            getActiveObjectives(ctx),
            getObjectives(ctx),
            getArchivedObjectiveIds(ctx),
            getObjectiveStateDetails(ctx),
        ]);
        void all;
        void archivedIds;
        void details;
        await getCurrentObjectiveDefinitions(
            ctx, active.map((o) => o.id),
        );
        await getSentInvitations(ctx);
    },
    ideas: async (ctx) => {
        await getIdeas(ctx);
    },
    'idea-detail': async (ctx) => {
        const rows = await getIdeas(ctx);
        for (const row of rows) {
            await getIdea(ctx, row.idea.idForLink());
        }
    },
    'idea-create': async () => {},
    'idea-convert': async (ctx) => {
        const rows = await getIdeas(ctx);
        const approved = rows.filter(
            (row) => row.idea.stateValue()
                === 'approved',
        );
        for (const row of approved) {
            await getIdea(ctx, row.idea.idForLink());
        }
        const active =
            await getActiveObjectives(ctx);
        await getCurrentObjectiveDefinitions(
            ctx, active.map((o) => o.id),
        );
    },
    projects: async (ctx) => {
        await getProjects(ctx);
        await getProjectsScoreColumn(ctx);
    },
    'project-detail': async (ctx) => {
        const projects = await getProjects(ctx);
        for (const project of projects) {
            const id = project.idForLink();
            await getProjectEntity(ctx, id);
            await getObjectives(ctx);
            await getProjectScoring(ctx, id);
            await getFlowsByProject(ctx, id);
            const active =
                await getActiveObjectives(ctx);
            await getCurrentObjectiveDefinitions(
                ctx, active.map((o) => o.id),
            );
        }
    },
    records: async (ctx) => {
        await getRecords(ctx);
    },
    'record-create': async () => {},
    'record-detail': async (ctx) => {
        const records = await getRecords(ctx);
        for (const record of records) {
            const id = record.record.idForLink();
            await getRecordModel(ctx, id);
            await getRecordAttributesByRecord(
                ctx, id,
            );
            await getFlowSummariesForRecord(
                ctx, id,
            );
            await getWorkOrdersForRecord(
                ctx, id,
            );
            await getRecordInstances(ctx, id);
        }
    },
    flows: async (ctx) => {
        await getFlowsWithProjectNames(ctx);
    },
    'flow-detail': async (ctx) => {
        const flows =
            await getFlowsWithProjectNames(ctx);
        for (const row of flows) {
            const id = row.summary.id;
            await getFlowGraph(ctx, id);
            await getHumanMembers(ctx);
            await getAIMembers(ctx);
            await getRecordEntities(ctx);
            const bound =
                await getRecordForFlow(ctx, id);
            if (bound) {
                await getRecordAttributesByRecord(
                    ctx, bound,
                );
            }
        }
    },
    'flow-stats': async (ctx) => {
        const flows =
            await getFlowsWithProjectNames(ctx);
        for (const row of flows) {
            await getFlowStats(
                ctx, row.summary.id, Date.now(),
            );
        }
    },
    workbox: async (ctx) => {
        await getWorkOrders(ctx);
        await getWorkOrderHistories(ctx);
        await getMemberMap(ctx);
        await getFlowsForCreation(ctx);
    },
    'workbox-detail': async (ctx) => {
        const currentMemberId =
            (await getCurrentHumanMember(ctx)).id;
        const orders = await getWorkOrders(ctx);
        for (const order of orders) {
            const workOrder = await getWorkOrder(
                ctx, order.id,
            );
            const history =
                await getWorkOrderHistory(
                    ctx, order.id,
                );
            const memberMap =
                await getMemberMap(ctx);
            const recordId =
                await getRecordForWorkOrder(
                    ctx, order.id,
                );
            const transitions =
                transitionEventsFromHistory(
                    order.id, history,
                );
            const fieldValuesByEvent =
                fieldValuesByEventFromHistory(
                    history,
                );
            const activeClaim =
                activeClaimFromHistory(
                    history,
                    workOrder.flowGraph.lockTimeout,
                );
            const bound =
                workOrder.instanceId !== undefined
                && workOrder.recordTypeId
                    !== undefined
                    ? {
                        instanceId:
                            workOrder.instanceId,
                        recordTypeId:
                            workOrder.recordTypeId,
                    }
                    : null;
            const attributesPromise: Promise<
                RecordAttribute[]
            > = recordId === null
                ? Promise.resolve([])
                : getRecordAttributesByRecord(
                    ctx, recordId,
                );
            type InstanceWave = {
                instanceValues:
                    ReadonlyMap<
                        string, string
                    > | null;
                instanceEtag: string | null;
                pickerItems: readonly {
                    readonly id: string;
                    readonly fields: readonly {
                        readonly name: string;
                        readonly value: string;
                    }[];
                }[];
                heldTypeId: string | null;
            };
            const instanceWavePromise: Promise<
                InstanceWave
            > = (async (): Promise<
                InstanceWave
            > => {
                if (bound !== null) {
                    const instance =
                        await getRecordInstance(
                            ctx,
                            bound.recordTypeId,
                            bound.instanceId,
                        );
                    return {
                        instanceValues:
                            instance.values,
                        instanceEtag:
                            instance.etag,
                        pickerItems: [],
                        heldTypeId:
                            bound.recordTypeId,
                    };
                }
                if (recordId !== null) {
                    const attributes =
                        await attributesPromise;
                    const instances =
                        await getRecordInstances(
                            ctx, recordId,
                        );
                    return {
                        instanceValues: null,
                        instanceEtag: null,
                        pickerItems:
                            instanceListItems(
                                instances,
                                attributes,
                            ),
                        heldTypeId: recordId,
                    };
                }
                return {
                    instanceValues: null,
                    instanceEtag: null,
                    pickerItems: [],
                    heldTypeId: recordId,
                };
            })();
            const [attributes, instanceWave] =
                await Promise.all([
                    attributesPromise,
                    instanceWavePromise,
                ]);
            const attributeMap = new Map(
                attributes.map(
                    (a) => [a.id, a] as const,
                ),
            );
            const detail =
                new WorkboxDetailPresenter(
                    workOrder,
                    transitions,
                    fieldValuesByEvent,
                    activeClaim,
                    memberMap,
                    currentMemberId,
                    attributeMap,
                    instanceWave.instanceValues,
                    bound,
                    instanceWave.pickerItems,
                    null,
                );
            detail.buildPage();
        }
    },
    members: async (ctx) => {
        await fillHumanMemberPii(
            ctx, await getMembers(ctx),
        );
    },
    'member-detail': async (ctx) => {
        const members = await getMembers(ctx);
        for (const member of members) {
            const id = member.idForLink();
            try {
                await getHumanMember(ctx, id);
            } catch {
                await getAIMember(ctx, id);
            }
        }
    },
    invitations: async (ctx) => {
        await getInvitations(ctx);
    },
    identities: async (ctx) => {
        await getIdentityRoster(ctx);
    },
    'identity-detail': async (ctx) => {
        const roster =
            await getIdentityRoster(ctx);
        for (const row of roster) {
            const identity =
                await getIdentity(ctx, row.id);
            await getMemberPii(ctx, row.id);
            if (!identity.isService()) continue;
            await getServiceFacet(ctx, row.id);
            await getIdentityCredentialState(
                ctx, row.id,
            );
            await getClientRegistration(
                ctx, row.id,
            );
        }
    },
    'identity-providers': async (ctx) => {
        const roster =
            await getIdentityRoster(ctx);
        for (const row of roster) {
            await getProviderEvents(ctx, row.id);
        }
    },
    'identity-tokens': async (ctx) => {
        const roster =
            await getIdentityRoster(ctx);
        for (const row of roster) {
            await getTokenChainsFor(ctx, row.id);
        }
    },
    billing: async () => {},
};

test('every gated sidebar page is in the belt',
() => {
    const required = Object.entries(
        PAGE_REGISTRY,
    ).filter(([, e]) =>
        e.layout === 'sidebar'
        && e.requiresAuth !== false,
    ).map(([k]) => k).sort();
    assert.deepEqual(
        Object.keys(MANIFEST).sort(),
        required,
    );
});

async function adminCtx(
    section: ParallelSection,
    organization: string,
) {
    const db = memoryDbAdapter();
    const reveal = await postTestPlanSlices(
        db, { hashPassword: testHashPassword },
    );
    const row = reveal.find(
        (r) => r.section === section,
    );
    assert.ok(row, section);
    const token = section === 'AA'
        ? await organizationToken()
        : await claimToken({
            sub: sliceEntityId(
                section.toLowerCase() + '-admin',
            ),
            organization,
            organizations: [organization],
            roles: ['admin:' + organization],
        });
    return {
        ctx: createRequestContext(db, token),
        organization: row.organizationId,
    };
}

for (const section of PARALLEL_SECTIONS) {
    test('slice ' + section + ' pages boot',
    async (t) => {
        const organization = section === 'AA'
            ? 'AjdvjuECVZEgZoFajaIEkg'
            : sliceEntityId(
                section.toLowerCase() + '-org',
            );
        const { ctx } = await adminCtx(
            section, organization,
        );
        for (const [page, boot] of
            Object.entries(MANIFEST)
        ) {
            await t.test(page, async () => {
                await boot(ctx);
            });
        }
    });
}
