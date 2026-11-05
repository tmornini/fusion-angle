import type { DbAdapter } from './db.ts';
import type { Id } from '../shared/types.ts';
import type { Route } from './routes.ts';
import {
    requireOrganization,
    withoutId,
} from './document-family.ts';
import { canonicalPath } from './message-pair.ts';
import {
    pickString,
    validateFlowWorkOrderEntity,
    validateWorkOrderVersion,
} from './validators.ts';
import {
    isDeletedHead,
    matchingCollection,
    selectHeadsAtPath,
    type HeadSelection,
} from './head-reads.ts';
import { servedBodyOf, type Reader } from './served-response.ts';
import { flowWorkOrdersUriPrefix } from
    './derive-flow-work-orders.ts';
import {
    instancesUriPrefix,
    revisionValuesOf,
} from './derive-record-instances.ts';
import { recordTypesUriPrefix } from './derive-record-types.ts';
import type { WorkOrderVersion } from './work-order-version.ts';
import { asWorkOrderFlowGraph } from
    '../shared/flow-graph-body.ts';
import { isExpiresAtPassed } from
    '../shared/work-order-claims.ts';
import { memberNamesOf } from './member-names.ts';

type EventValuesReader = Extract<Reader, { sees: 'event-values' }>;

type Collection = Extract<HeadSelection, { kind: 'collection' }>;

type FlowNaming = { readonly id: Id, readonly name: string };

// What a work order joins to, each under the rule of the
// GET that serves it to this caller.
type WorkOrderJoins = {
    readonly memberNames: ReadonlyMap<Id, string>,
    // By work order id: the live flow it was created from.
    readonly flows: ReadonlyMap<Id, FlowNaming>,
    // By work order id: the values the instance GET serves
    // of its bound, live instance.
    readonly boundValues: ReadonlyMap<Id, readonly string[]>,
};

// The work-orders QUERY: the collection's own GET select,
// so its reader is the GET's, then each work order matched
// on what it and its joins serve this caller.
export function withWorkOrderSearch(route: Route): Route {
    const select = route.select;
    if (select === undefined) {
        throw new Error('a work-order search route has no select');
    }
    return {
        ...route,
        selectMatching: async (
            db, params, actor, organization, roles, query, text,
        ) => {
            const organizationId = requireOrganization(
                organization,
            );
            const [selection, memberNames, flows] =
                await Promise.all([
                    select(
                        db, params, actor, organization, roles,
                        query,
                    ),
                    memberNamesOf(db, organizationId),
                    flowsByWorkOrderOf(db, organizationId),
                ]);
            const boundValues = await boundValuesOf(
                db, organizationId, selection,
            );
            const joins = { memberNames, flows, boundValues };
            return matchingCollection(selection, text, (body) =>
                workOrderFieldsOf(
                    validateWorkOrderVersion(body), joins,
                ));
        },
    };
}

// The organization's own id is not a field: every work
// order carries it, so it would match the whole collection.
function workOrderFieldsOf(
    order: WorkOrderVersion,
    joins: WorkOrderJoins,
): string[] {
    const graph = asWorkOrderFlowGraph(
        order.flow_graph, 'work_orders.flow_graph',
    );
    const node = graph.nodes.find((each) => each.id === order.state);
    const flow = joins.flows.get(order.id);
    const claim = order.claim;
    const bound = joins.boundValues.get(order.id);
    return [
        order.id,
        order.display_id,
        graph.name,
        ...(flow === undefined ? [] : [flow.id, flow.name]),
        order.state,
        ...(node === undefined
            ? []
            : [node.name, node.taskInstructions]),
        ...memberFieldsOf(
            order.transition.member_id, joins.memberNames,
        ),
        ...(claim === undefined || isExpiresAtPassed(claim.expires_at)
            ? []
            : memberFieldsOf(claim.member_id, joins.memberNames)),
        ...(order.instance_id === undefined
            || order.record_type_id === undefined
            ? []
            : [order.record_type_id, order.instance_id]),
        ...(bound === undefined ? [] : bound),
        ...order.events.flatMap((event) =>
            event.field_values.flatMap((entry) =>
                'cleared' in entry ? [] : [entry.value])),
    ];
}

function memberFieldsOf(
    memberId: Id,
    memberNames: ReadonlyMap<Id, string>,
): string[] {
    const name = memberNames.get(memberId);
    return name === undefined ? [memberId] : [memberId, name];
}

function eventValuesReaderOf(
    selection: Collection,
): EventValuesReader {
    const reader = selection.reader;
    if (reader.sees !== 'event-values') {
        throw new Error(
            'a work-order selection reads event values, not '
                + reader.sees,
        );
    }
    return reader;
}

function collectionOf(selection: HeadSelection): Collection {
    if (selection.kind !== 'collection') {
        throw new Error(
            'a work-order search reads a collection, not a '
                + selection.kind,
        );
    }
    return selection;
}

// Each live flow's work-order joins, read in one snapshot.
// A deleted flow joins nothing: its GET is Gone.
async function flowsByWorkOrderOf(
    db: DbAdapter,
    organization: Id,
): Promise<ReadonlyMap<Id, FlowNaming>> {
    const flows = await selectHeadsAtPath(
        db, canonicalPath(organization, '/flows/'), 'state',
    );
    const live = flows.heads.filter((head) =>
        !isDeletedHead(head, flows.lifecycle));
    const joins = await db.messagePairs.getCollectionHeadPairsBatch(
        live.map((head) => ({
            path: flowWorkOrdersUriPrefix(organization, head.name),
        })),
    );
    return new Map(live.flatMap((head, at) => {
        const naming = {
            id: head.name,
            name: pickString(
                servedBodyOf(head, flows.reader), 'name',
            ),
        };
        return joins[at]!.map((join) => [
            validateFlowWorkOrderEntity(withoutId(
                servedBodyOf(join, { sees: 'whole' }),
            )).work_order_id,
            naming,
        ] as const);
    }));
}

// The record types whose instances the instance GET
// serves: a tombstoned type's are refused.
async function liveRecordTypesOf(
    db: DbAdapter,
    organization: Id,
): Promise<ReadonlySet<Id>> {
    const types = await selectHeadsAtPath(
        db, recordTypesUriPrefix(organization), 'state',
    );
    return new Set(types.heads
        .filter((head) => !isDeletedHead(head, types.lifecycle))
        .map((head) => head.name));
}

// A bound work order's instance, as the instance GET
// serves it to this caller: the values the record type's
// attribute rule lets their roles read. An instance whose
// type or head is gone contributes nothing.
async function boundValuesOf(
    db: DbAdapter,
    organization: Id,
    selection: HeadSelection,
): Promise<ReadonlyMap<Id, readonly string[]>> {
    const collection = collectionOf(selection);
    const reader = eventValuesReaderOf(collection);
    const liveTypes = await liveRecordTypesOf(db, organization);
    const live = collection.heads.filter((head) =>
        !isDeletedHead(head, collection.lifecycle));
    const bound = await Promise.all(
        live.map(async (head) => {
            const order = validateWorkOrderVersion(
                servedBodyOf(head, reader),
            );
            const values = await instanceValuesOf(
                db, organization, order, reader, liveTypes,
            );
            return values === undefined
                ? []
                : [[order.id, values] as const];
        }),
    );
    return new Map(bound.flat());
}

async function instanceValuesOf(
    db: DbAdapter,
    organization: Id,
    order: WorkOrderVersion,
    reader: EventValuesReader,
    liveTypes: ReadonlySet<Id>,
): Promise<readonly string[] | undefined> {
    if (
        order.instance_id === undefined
        || order.record_type_id === undefined
        || !liveTypes.has(order.record_type_id)
    ) {
        return undefined;
    }
    const attributesById = reader.boundSchemas.get(
        order.record_type_id,
    );
    if (attributesById === undefined) return undefined;
    const head = await db.messagePairs.getHeadPair(
        instancesUriPrefix(organization, order.record_type_id),
        order.instance_id,
    );
    if (head === null || isDeletedHead(head, 'stateless')) {
        return undefined;
    }
    return revisionValuesOf(servedBodyOf(head, {
        sees: 'values', attributesById, roles: reader.roles,
    })).map((entry) => entry.value);
}
