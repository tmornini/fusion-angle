import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, PUT } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { seedOrganizationMember } from
    './root-admin-fixture.ts';

test(
    'a person identity write is authored by the token',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo');
        await PUT(db, 'identities/current', {
            kind: 'person',
            title: 'Admin',
            department: 'Product',
            strengths: [],
            team_dimensions: {},
        }, DEV_TOKEN);
        const requests = await db.pairs.getAll();
        const row = requests.find(r =>
            r.uri_collection === '/identities/'
            && r.uri_id === 'current'
            && r.requester_identity_id === 'current',
        );
        assert.ok(row, 'identity PUT pair missing');
    },
);

test(
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
        assert.equal(
            principalFromToken(token).id, 'alice',
        );
        const seats = await GET<{ id: string }[]>(
            db, 'organizations/1/members/', token,
        );
        assert.ok(seats.some(s => s.id === 'alice'));
    },
);
