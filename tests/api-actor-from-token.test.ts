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
        await seedHumanMember(db, 'alice', 'Alice');
        await seedOrganizationMember(db, 'alice');
        const token = await devToken('alice');
        const { principalFromToken } = await import(
            '../shared/access-token-decode.ts'
        );
        assertStrictEquals(
            principalFromToken(token).id, 'alice',
        );
        const seats = (await GETCollection<{ id: string }>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/', token,
            operationIdHeader())).map((part) => part.body().toValue());
        assert(seats.some(s => s.id === 'alice'));
    },
);
