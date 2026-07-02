import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { identityDefaultOrganization } from '../api/authentication.ts';

const T1 = '2026-01-01T00:00:00.000000Z';
const T2 = '2026-02-01T00:00:00.000000Z';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

test(
    'identityDefaultOrganization returns the set default when present',
    async () => {
        const db = await freshDb();
        await db.memberships.put('m1', {
            organization_id: '1', identity_id: 'me', at: T1,
        });
        await db.memberships.put('m2', {
            organization_id: '2', identity_id: 'me', at: T2,
        });
        await db.identityDefaultOrganizations.put('d1', {
            identity_id: 'me', organization_id: '2', at: T2,
        });
        assert.equal(await identityDefaultOrganization(db, 'me'), '2');
    },
);

test(
    'identityDefaultOrganization falls back to earliest membership',
    async () => {
        const db = await freshDb();
        await db.memberships.put('m1', {
            organization_id: '2', identity_id: 'me', at: T2,
        });
        await db.memberships.put('m2', {
            organization_id: '3', identity_id: 'me', at: T1,
        });
        assert.equal(await identityDefaultOrganization(db, 'me'), '3');
    },
);

test(
    'identityDefaultOrganization tie-breaks equal-at by lowest org id',
    async () => {
        const db = await freshDb();
        await db.memberships.put('m1', {
            organization_id: '3', identity_id: 'me', at: T1,
        });
        await db.memberships.put('m2', {
            organization_id: '2', identity_id: 'me', at: T1,
        });
        assert.equal(await identityDefaultOrganization(db, 'me'), '2');
    },
);

test(
    'identityDefaultOrganization is null with no default and no member',
    async () => {
        const db = await freshDb();
        assert.equal(await identityDefaultOrganization(db, 'me'), null);
    },
);
