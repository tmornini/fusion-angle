import { assert } from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    postBootstrap,
} from '../api/mock-data.ts';
import { membershipsOfIdentity } from
    '../api/memberships.ts';
import { seededMockDb } from './mock-seed.ts';

// Privilege is membership type:"admin" — claim roles bake
// from that type at mint. No role-grants family.

Deno.test('bootstrap seeds current as admin', async () => {
    const db = memoryDbAdapter();
    await postBootstrap(db);
    const rows = await membershipsOfIdentity(
        db, 'XXZruirZyAOoRpNxaDnpSA',
    );
    assert(
        rows.some(
            m => m.organization_id === 'AjdvjuECVZEgZoFajaIEkg'
                && m.type === 'admin',
        ),
    );
});

Deno.test('mock data seeds current as admin', async () => {
    const db = await seededMockDb();
    const rows = await membershipsOfIdentity(
        db, 'XXZruirZyAOoRpNxaDnpSA',
    );
    assert(
        rows.some(
            m => m.organization_id === 'AjdvjuECVZEgZoFajaIEkg'
                && m.type === 'admin',
        ),
    );
});
