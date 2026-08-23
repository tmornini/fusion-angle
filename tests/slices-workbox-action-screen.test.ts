import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import {
    postTestPlanSlices, sliceEntityId,
} from '../api/test-plan-slices.ts';
import { testHashPassword } from
    './mock-seed.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { claimToken } from
    './token-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    WorkboxDetailPresenter,
} from '../web-app/app/presenters/index.ts';
import {
    instanceListItems,
} from
    '../web-app/app/presenters/record-detail.ts';
import {
    getWorkOrder,
    getWorkOrderHistory,
    transitionEventsFromHistory,
    fieldValuesByEventFromHistory,
    activeClaimFromHistory,
    getMemberMap,
    getCurrentHumanMember,
    getRecordForWorkOrder,
    getRecordAttributesByRecord,
    getRecordInstance,
    getRecordInstances,
    postWorkOrderCreation,
    type RecordAttribute,
} from '../web-app/app/adapters/index.ts';

test('F2 Capture action screen binds two attributes',
async () => {
    const db = memoryDbAdapter();
    const reveal = await postTestPlanSlices(
        db, { hashPassword: testHashPassword },
    );
    const row = reveal.find(
        (r) => r.section === 'F2',
    );
    assert.ok(row);
    assert.ok(row.flowId);
    const organization = row.organizationId;
    const ctx = createRequestContext(
        db,
        await claimToken({
            sub: sliceEntityId('f2-admin'),
            organization,
            organizations: [organization],
            roles: ['admin:' + organization],
        }),
    );
    const workOrderId = generateIdentifier();
    await postWorkOrderCreation(ctx, {
        workOrderId,
        flowLinkId: generateIdentifier(),
        flowId: row.flowId,
    });
    const currentMemberIdPromise =
        getCurrentHumanMember(ctx).then(
            (m) => m.id,
        );
    const [
        workOrder, history, memberMap, recordId,
        currentMemberId,
    ] = await Promise.all([
        getWorkOrder(ctx, workOrderId),
        getWorkOrderHistory(ctx, workOrderId),
        getMemberMap(ctx),
        getRecordForWorkOrder(ctx, workOrderId),
        currentMemberIdPromise,
    ]);
    const transitions = transitionEventsFromHistory(
        workOrderId, history,
    );
    const fieldValuesByEvent =
        fieldValuesByEventFromHistory(history);
    const activeClaim = activeClaimFromHistory(
        history, workOrder.flowGraph.lockTimeout,
    );
    const bound =
        workOrder.instanceId !== undefined
        && workOrder.recordTypeId !== undefined
            ? {
                instanceId: workOrder.instanceId,
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
            ReadonlyMap<string, string> | null;
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
    > = (async (): Promise<InstanceWave> => {
        if (bound !== null) {
            const instance =
                await getRecordInstance(
                    ctx,
                    bound.recordTypeId,
                    bound.instanceId,
                );
            return {
                instanceValues: instance.values,
                instanceEtag: instance.etag,
                pickerItems: [],
                heldTypeId: bound.recordTypeId,
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
                pickerItems: instanceListItems(
                    instances, attributes,
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
    const presenter = new WorkboxDetailPresenter(
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
    assert.equal(
        presenter.renderableAttributes().length,
        2,
    );
    const page = presenter.buildPage();
    assert.notEqual(recordId, null);
    assert.match(page.toString(), /<select/);
    assert.equal(presenter.isBound(), false);
    assert.equal(
        instanceWave.pickerItems.length, 1,
    );
});
