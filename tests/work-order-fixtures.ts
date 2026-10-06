import { assert, assertStrictEquals } from '@std/assert';
import type { DbAdapter } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import type { Id, WorkOrderEntity } from '../shared/types.ts';
import { generateIdentifier } from '../shared/identifier.ts';
import { isExpiresAtPassed } from
    '../shared/work-order-claims.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { apiRequest, messageOfResponse } from
    './http-fixtures.ts';

export type WorkOrderSeed = {
    readonly organization: Id,
    readonly id: Id,
    readonly fields: {
        readonly display_id: string,
        readonly flow_graph: Record<string, unknown>,
        readonly position: number,
    },
    readonly flowId: Id,
    // The create node, then the node the work order sits
    // at (spec §1: births[1] is its node).
    readonly births: readonly [string, string],
    readonly at: string,
    readonly token: string,
    // 'released' frees a live birth claim; a claim already
    // lapsed stands, and readers treat it as unclaimed.
    readonly claim: 'kept' | 'released',
};

// A test work order is born the one way a work order is
// born: the live create, three births and its flow join in
// one statement (spec Decision 4). The head it answers is
// the message a later write latches.
export async function seedCreatedWorkOrder(
    db: DbAdapter,
    seed: WorkOrderSeed,
): Promise<HttpMessage<WorkOrderEntity>> {
    const collection = '/organizations/'
        + seed.organization + '/work-orders/';
    const created = await handleRequest(db, apiRequest({
        method: 'POST',
        path: collection,
        token: seed.token,
        body: {
            id: seed.id,
            workOrder: seed.fields,
            flowWorkOrderId: generateIdentifier(),
            flowWorkOrder: {
                flow_id: seed.flowId,
                work_order_id: seed.id,
                at: seed.at,
            },
            stateEventIds: [
                generateIdentifier(),
                generateIdentifier(),
                generateIdentifier(),
            ],
            stateEventAts: [seed.at, seed.at, seed.at],
            states: [...seed.births, 'claimed'],
        },
    }));
    assertStrictEquals(created.status, 201);
    await created.body?.cancel();
    const head = await headOf(db, collection + seed.id, seed);
    if (seed.claim === 'kept') {
        return head;
    }
    const released = await handleRequest(db, apiRequest({
        method: 'DELETE',
        path: collection + seed.id + '/claim',
        token: seed.token,
        headers: {
            'If-Match': head.query('header.etag').toText(),
        },
    }));
    assertStrictEquals(released.status, 200);
    // messageOfResponse takes no type parameter; the body
    // type is the one the route answers.
    const version = await messageOfResponse(
        released,
    ) as HttpMessage<WorkOrderEntity>;
    const claim = version.body().toValue().claim;
    assert(
        claim === undefined || isExpiresAtPassed(claim.expires_at),
        'a live claim remains after the release',
    );
    return version;
}

async function headOf(
    db: DbAdapter,
    path: string,
    seed: WorkOrderSeed,
): Promise<HttpMessage<WorkOrderEntity>> {
    const read = await handleRequest(db, apiRequest({
        method: 'GET', path, token: seed.token,
    }));
    assertStrictEquals(read.status, 200);
    // As above: the route's body type, named here.
    return await messageOfResponse(
        read,
    ) as HttpMessage<WorkOrderEntity>;
}
