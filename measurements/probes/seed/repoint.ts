// A default-organization PUT to a second organization. The
// route stores a 204 with no body, so the statement's
// sameness test sees the head's empty body and answers
// matched: the default never moves.
import { memoryDbAdapter } from '../../../api/db-memory.ts';
import { handleRequest } from '../../../api/api.ts';
import { devToken } from '../../../tests/token-fixtures.ts';
import { seedOrganizationDocument } from
    '../../../tests/test-fixtures.ts';
import { seedSeat } from '../../../tests/root-admin-fixture.ts';
import { generateIdentifier } from '../../../shared/identifier.ts';

const BASE = 'http://localhost';
const AT = '2026-06-04T00:00:00.000000Z';
const IDENTITY = 'XXZruirZyAOoRpNxaDnpSA';
const FIRST = 'AjdvjuECVZEgZoFajaIEkg';
const SECOND = 'BBjWJsjYIDkTRKIIPrzWRw';

const db = memoryDbAdapter();
await db.postSchemaCreation();
for (const organization of [FIRST, SECOND]) {
    await seedOrganizationDocument(db, organization, organization);
    await seedSeat(db, organization, IDENTITY, 'member', AT);
}
const token = await devToken();
const target = BASE + '/identities/' + IDENTITY
    + '/default-organization';
const put = (organization: string) => handleRequest(db, new Request(
    target, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
            'operation-id': generateIdentifier(),
        },
        body: JSON.stringify({ organization_id: organization }),
    }));
const first = await put(FIRST);
console.log('PUT first', first.status, await first.text());
const second = await put(SECOND);
console.log('PUT second', second.status, await second.text());
const read = await handleRequest(db, new Request(target, {
    headers: {
        Authorization: 'Bearer ' + token,
        'operation-id': generateIdentifier(),
    },
}));
console.log('GET', read.status, await read.text());
