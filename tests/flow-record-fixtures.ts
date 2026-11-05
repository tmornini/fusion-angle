import { assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import type { DbAdapter } from '../api/db.ts';
import { apiRequest } from './http-fixtures.ts';

const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const AT = '2026-01-01T00:00:00.000000Z';

// The flow-record join that binds a flow to a record
// type. The ids are the caller's.
export async function seedFlowTypeJoin(
    db: DbAdapter,
    token: string,
    flowId: string,
    typeId: string,
    joinId: string,
): Promise<void> {
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/' + STARK + '/flows/'
            + flowId + '/records/' + '' + joinId,
        token,
        body: {
            id: joinId,
            flow_id: flowId,
            record_id: typeId,
            at: AT,
        },
    }));
    assertStrictEquals(put.status, 201);
}
