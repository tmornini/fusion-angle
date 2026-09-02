import { assert, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    postBootstrap,
} from '../api/mock-data.ts';
import { identityDefaultOrganization } from '../api/authentication.ts';
import { deriveDefaultOrganization } from
    '../api/derive-default-organization.ts';
import { deriveMembershipsForIdentity } from
    '../api/derive-memberships.ts';
import { buildMembers } from '../api/mock-data/members.ts';
import { seededMockDb } from './mock-seed.ts';

async function mockSeeded(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

// Phase Final Task 2: identity + membership +
// default-organization ROW halves stripped — message-plane
// oracles only.

Deno.test('every membership-bearing person has a'
+ ' default-organization document',
async () => {
    const db = await mockSeeded();
    const persons = buildMembers().map(m => m.id);
    for (const id of persons) {
        const memberships =
            await deriveMembershipsForIdentity(db, id);
        if (memberships.length === 0) continue;
        const defaults = await deriveDefaultOrganization(
            db, id,
        );
        assert(
            defaults.length > 0,
            'person ' + id
                + ' lacks a default-organization document');
    }
});

Deno.test("the seeded 'XXZruirZyAOoRpNxaDnpSA' default resolves to org 1",
async () => {
    const db = await mockSeeded();
    assertStrictEquals(
        await identityDefaultOrganization(db, 'XXZruirZyAOoRpNxaDnpSA')
            , 'AjdvjuECVZEgZoFajaIEkg');
});

Deno.test("bootstrap seeds 'XXZruirZyAOoRpNxaDnpSA' a default-organization"
+ ' document for organization 1',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await postBootstrap(db);
    const defaults = await deriveDefaultOrganization(
        db, 'XXZruirZyAOoRpNxaDnpSA',
    );
    assert(
        defaults.some(d => d.organization_id === 'AjdvjuECVZEgZoFajaIEkg'),
        "current has no default-organization document"
            + ' for organization 1');
});
