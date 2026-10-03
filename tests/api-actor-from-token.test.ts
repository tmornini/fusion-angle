import { assert, assertStrictEquals } from '@std/assert';
import { GETCollection, PUT } from './in-page-facade.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { seedOrganizationMember } from
    './root-admin-fixture.ts';
import { operationIdHeader } from
    './operation-id-header.ts';
import { identifierOfUuidText } from
    '../shared/identifier.ts';

// 6f0b9c1e-4a27-4d5b-8e31-7c9a2f10b6d4. A membership
// read accepts this identifier. The short name is not one.
const ALICE = identifierOfUuidText(
    '6f0b9c1e-4a27-4d5b-8e31-7c9a2f10b6d4',
);

Deno.test(
    'a person identity write is authored by the token',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo');
        await PUT(db, 'identities/XXZruirZyAOoRpNxaDnpSA', {
            kind: 'person',
            title: 'Admin',
            department: 'Product',
            strengths: [],
            team_dimensions: {},
        }, DEV_TOKEN,
            operationIdHeader());
        const requests = await db.messagePairs.getAll();
        const row = requests.find(r =>
            r.path === '/identities/'
            && r.name === 'XXZruirZyAOoRpNxaDnpSA'
            && r.requester_identity_id === 'XXZruirZyAOoRpNxaDnpSA',
        );
        assert(row, 'identity PUT pair missing');
    },
);

Deno.test(
    'the token sub is the caller identity',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await seedHumanMember(db, ALICE, 'Alice');
        await seedOrganizationMember(db, ALICE);
        const token = await devToken(ALICE);
        const { principalFromToken } = await import(
            '../shared/access-token-decode.ts'
        );
        assertStrictEquals(
            principalFromToken(token).id, ALICE,
        );
        const seats = (await GETCollection<{
            identity_id: string;
        }>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg'
                + '/invitations/?state=accepted',
            token, operationIdHeader()))
            .map((part) => part.body().toValue());
        assert(seats.some(s => s.identity_id === ALICE));
    },
);
