import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateIdentityEntity,
    validateIdentityPiiEntity,
} from '../api/validators.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { PUT, GET, DELETE } from '../api/api.ts';

test('validateIdentityEntity accepts person/service', () => {
    assert.deepEqual(
        validateIdentityEntity({ kind: 'person' }),
        { kind: 'person' },
    );
    assert.deepEqual(
        validateIdentityEntity({ kind: 'service' }),
        { kind: 'service' },
    );
});

test('validateIdentityEntity rejects bad kind', () => {
    assert.throws(() =>
        validateIdentityEntity({ kind: 'robot' }));
});

test('validateIdentityEntity rejects extra keys', () => {
    assert.throws(() =>
        validateIdentityEntity({ kind: 'person', name: 'x' }));
});

test('validateIdentityPiiEntity requires four fields', () => {
    assert.deepEqual(
        validateIdentityPiiEntity({
            name: 'Tony Stark',
            email: 'demo@example.com',
            phone: '+1 (555) 123-4567',
            bio: 'Builder.',
        }),
        {
            name: 'Tony Stark',
            email: 'demo@example.com',
            phone: '+1 (555) 123-4567',
            bio: 'Builder.',
        },
    );
});

test('validateIdentityPiiEntity rejects missing field', () => {
    assert.throws(() =>
        validateIdentityPiiEntity({
            name: 'x', email: 'y', phone: 'z',
        }));
});

async function freshDb() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    return db;
}

test('PUT then GET an identity round-trips', async () => {
    const db = await freshDb();
    await PUT(db, 'identities/abc', { kind: 'person' });
    const got = await GET<{ id: string; kind: string }>(
        db, 'identities/abc',
    );
    assert.deepEqual(got, { id: 'abc', kind: 'person' });
});

test('DELETE identity-pii splices only the pii row',
async () => {
    const db = await freshDb();
    await PUT(db, 'identities/abc', { kind: 'person' });
    await PUT(db, 'identity-pii/abc', {
        name: 'A', email: 'a@x.io', phone: 'p', bio: 'b',
    });
    await DELETE(db, 'identity-pii/abc');
    await assert.rejects(
        () => GET(db, 'identity-pii/abc'));
    const id = await GET<{ id: string }>(db, 'identities/abc');
    assert.equal(id.id, 'abc');
});

test('bootstrap seeds an identity per member, id-equal',
async () => {
    const db = await freshDb();
    const { populateBootstrapData } =
        await import('../api/mock-data.ts');
    await populateBootstrapData(db);
    const sys = await GET<{ kind: string }>(
        db, 'identities/system');
    assert.equal(sys.kind, 'service');
    const cur = await GET<{ kind: string }>(
        db, 'identities/current');
    assert.equal(cur.kind, 'person');
});
