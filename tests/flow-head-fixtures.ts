import { assert } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import type { DbAdapter } from '../api/db.ts';
import {
    apiRequest,
    pairIdOf,
} from './http-fixtures.ts';

const STARK = 'AjdvjuECVZEgZoFajaIEkg';

// Create's operation pair is not the document head.
// The synthesized document pair, appended after, is.
// A save echoes this id, read fresh by GET.
export async function headResponseId(
    db: DbAdapter,
    token: string,
    flowId: string,
): Promise<string> {
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/organizations/' + STARK + '/flows/'
            + flowId,
        token,
    }));
    const id = pairIdOf(got);
    assert(id
        , 'no Response-ID on GET /organizations/'
        + STARK + '/flows/'
        + '' + flowId);
    return id!;
}
