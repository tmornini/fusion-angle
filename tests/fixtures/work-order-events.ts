import { assertStrictEquals } from '@std/assert';
import type { DbAdapter } from '../../api/db.ts';
import { handleRequest } from '../../api/api.ts';
import { workOrderEventsOf } from
    '../../client/work-orders-queries.ts';
import type {
    Id, WorkOrderEntity, WorkOrderEventEntity,
} from '../../shared/types.ts';
import { apiRequest, partsOf } from '../http-fixtures.ts';

// A work order's history, as the product reads it (spec
// §3): its versions' events, in chain order.
export async function getWorkOrderEvents(
    db: DbAdapter,
    token: string,
    organization: Id,
    workOrderId: Id,
): Promise<WorkOrderEventEntity[]> {
    const res = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/organizations/' + organization
            + '/work-orders/' + workOrderId + '/versions/',
        token,
    }));
    assertStrictEquals(
        res.status, 200,
        'versions of ' + organization + '/' + workOrderId,
    );
    return workOrderEventsOf(
        await partsOf<WorkOrderEntity>(res),
    );
}
