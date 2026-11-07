import { assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import type { DbAdapter } from '../api/db.ts';
import { IF_NONE_MATCH_HEADER } from
    '../api/message-pair.ts';
import { apiRequest } from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';

// The member seat the transition suites bind work
// under. The organization and the clock match both
// files' own constants.
export async function seedMember1(
    db: DbAdapter,
): Promise<void> {
    const memBody = {
        organization_id: ORGANIZATION,
        identity_id: 'nkgaOHZISTQrILTfPThWCA',
        type: 'member',
        at: AT,
    };
    await seedSeat(
        db,
        String(memBody['organization_id']
            ?? memBody.organization_id),
        String(memBody['identity_id']
            ?? memBody.identity_id),
        (memBody['type'] ?? memBody.type) as
            'admin' | 'member',
        String(memBody['at'] ?? memBody.at),
    );
}

// An instance head at path. The caller passes the set:
// one suite starts empty, the other starts with Title.
export async function seedInstance(
    db: DbAdapter,
    token: string,
    path: string,
    set: readonly {
        attribute_id: string;
        value: string;
    }[],
): Promise<string> {
    const put = await handleRequest(db, apiRequest({
        method: 'PATCH',
        path,
        token,
        body: { set: [...set] },
        headers: { [IF_NONE_MATCH_HEADER]: '*' },
    }));
    assertStrictEquals(put.status, 201);
    return put.headers.get('ETag')!;
}
