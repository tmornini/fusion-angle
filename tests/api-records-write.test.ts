import {
    assertEquals,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { GET, handleRequest, POST } from '../api/api.ts';
import { apiRequest } from './http-fixtures.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    seedCurrentMember,
} from './member-fixtures.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// ── Create variant ──────

Deno.test(
    'POST nested record-types create writes the'
    + ' record, initial state event, and'
    + ' attributes in one operation',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'create',
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'Quarterly Renewals',
                description: 'Customer pricing',
                position: 1,
            },
            attributes: [
                {
                    id: 'UQBiHFcwJeCDSnmkPBoYRA',
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                    name: 'Monthly Fee',
                    attribute_type: 'number',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
            ],
            initialState: 'active',
        }, DEV_TOKEN);
        const record = await GET<{
            id: string;
            name: string;
        }>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rbfHGatkwQzGZJVXKJEeyw', DEV_TOKEN);
        assertStrictEquals(record.name, 'Quarterly Renewals');
        // bare per-entity current-state alias RETIRED
        // (Phase 15 Task 7); post-write check rides
        // surviving /versions.
        const history = await GET<{
            state: string;
        }[]>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rbfHGatkwQzGZJVXKJEeyw/versions/', DEV_TOKEN);
        assertStrictEquals(history.length, 1);
        assertStrictEquals(history[0]!.state, 'active');
        const attrs = await GET<unknown[]>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rbfHGatkwQzGZJVXKJEeyw/attributes/', DEV_TOKEN,
        );
        assertStrictEquals(attrs.length, 1);
    },
);

Deno.test(
    'POST nested record-types create with empty'
    + ' attributes still writes the record and'
    + ' state event',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'create',
            id: 'rcaSzEaORBkezCxyhLhecA',
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'Empty',
                description: '',
                position: 2,
            },
            attributes: [],
            initialState: 'active',
        }, DEV_TOKEN);
        const record = await GET<{ name: string }>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rcaSzEaORBkezCxyhLhecA', DEV_TOKEN,
        );
        assertStrictEquals(record.name, 'Empty');
        // bare per-entity current-state alias RETIRED
        // (Phase 15 Task 7).
        const history = await GET<{
            state: string;
            member_id: string;
        }[]>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rcaSzEaORBkezCxyhLhecA/versions/', DEV_TOKEN);
        assertStrictEquals(history.length, 1);
        assertStrictEquals(history[0]!.state, 'active');
        assertStrictEquals(typeof history[0]!.member_id, 'string');
        assertNotStrictEquals(history[0]!.member_id, '');
        assertStrictEquals('state_at' in history[0]!, false);
    },
);

// ── Edit variant ──────

Deno.test(
    'POST nested record-types edit updates the'
    + ' record fields without touching state',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'create',
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'Before',
                description: '',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
        }, DEV_TOKEN);
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'edit',
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'After',
                description: 'updated',
                position: 1,
            },
            attributes: [],
            // The edit arm echoes state verbatim; the test pins
            // that an edit does not change it.
            state: 'active',
            removedAttributeIds: [],
        }, DEV_TOKEN);
        const record = await GET<{
            name: string;
            description: string;
        }>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rbfHGatkwQzGZJVXKJEeyw', DEV_TOKEN);
        assertStrictEquals(record.name, 'After');
        assertStrictEquals(
            record.description, 'updated',
        );
        const after = await GET<{ state: string }>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rbfHGatkwQzGZJVXKJEeyw', DEV_TOKEN,
        );
        assertStrictEquals(
            after.state, 'active',
            'edit must not change state',
        );
    },
);

Deno.test(
    'POST nested record-types edit with an'
    + ' unchanged record stores nothing',
    async () => {
        const db = await freshDb();
        const oldAttrId = generateIdentifier();
        const newAttrId = generateIdentifier();
        await seedCurrentMember(db);
        const collection =
            '/organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/record-types/';
        const recordId = 'rbfHGatkwQzGZJVXKJEeyw';
        await POST(db, collection.slice(1), {
            kind: 'create',
            id: recordId,
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'R',
                description: '',
                position: 1,
            },
            attributes: [
                {
                    id: oldAttrId,
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    record_id: recordId,
                    name: 'Old',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
            ],
            initialState: 'active',
        }, DEV_TOKEN);
        // The record body is the head. The new attribute
        // and the removal are siblings of that match.
        const before =
            (await db.messagePairs.getAll()).length;
        const edit = await handleRequest(db, apiRequest({
            method: 'POST',
            path: collection,
            token: DEV_TOKEN,
            body: {
                kind: 'edit',
                id: recordId,
                record: {
                    organization_id:
                        'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R',
                    description: '',
                    position: 1,
                },
                attributes: [
                    {
                        id: newAttrId,
                        organization_id:
                            'AjdvjuECVZEgZoFajaIEkg',
                        record_id: recordId,
                        name: 'New',
                        attribute_type: 'text',
                        sort_order: 0,
                        options: [],
                        constraints: [],
                    },
                ],
                state: 'active',
                removedAttributeIds: [oldAttrId],
            },
        }));
        assertStrictEquals(edit.status, 200);
        const answered: unknown = await edit.json();
        assertStrictEquals(
            (await db.messagePairs.getAll()).length,
            before,
        );
        const head = await handleRequest(db, apiRequest({
            method: 'GET',
            path: collection + recordId,
            token: DEV_TOKEN,
        }));
        assertStrictEquals(head.status, 200);
        assertEquals(answered, await head.json());
        const all = await GET<{
            id: string;
            name: string;
        }[]>(
            db,
            collection.slice(1) + recordId + '/attributes/',
            DEV_TOKEN,
        );
        assertStrictEquals(all.length, 1);
        assertStrictEquals(all[0]!.id, oldAttrId);
        assertStrictEquals(all[0]!.name, 'Old');
    },
);

Deno.test(
    'POST nested record-types edit that resends'
    + ' the record stores nothing',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        const collection =
            '/organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/record-types/';
        const recordId = 'rbfHGatkwQzGZJVXKJEeyw';
        const attrId = 'UQBiHFcwJeCDSnmkPBoYRA';
        await POST(db, collection.slice(1), {
            kind: 'create',
            id: recordId,
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'R', description: '',
                position: 1,
            },
            attributes: [
                {
                    id: attrId,
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    record_id: recordId,
                    name: 'Initial',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
            ],
            initialState: 'active',
        }, DEV_TOKEN);
        // The record body is the head. The renamed
        // attribute is a sibling of that match.
        const before =
            (await db.messagePairs.getAll()).length;
        const edit = await handleRequest(db, apiRequest({
            method: 'POST',
            path: collection,
            token: DEV_TOKEN,
            body: {
                kind: 'edit',
                id: recordId,
                record: {
                    organization_id:
                        'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [
                    {
                        id: attrId,
                        organization_id:
                            'AjdvjuECVZEgZoFajaIEkg',
                        record_id: recordId,
                        name: 'Renamed',
                        attribute_type: 'number',
                        sort_order: 0,
                        options: [],
                        constraints: [],
                    },
                ],
                state: 'active',
                removedAttributeIds: [],
            },
        }));
        assertStrictEquals(edit.status, 200);
        const answered: unknown = await edit.json();
        assertStrictEquals(
            (await db.messagePairs.getAll()).length,
            before,
        );
        const head = await handleRequest(db, apiRequest({
            method: 'GET',
            path: collection + recordId,
            token: DEV_TOKEN,
        }));
        assertStrictEquals(head.status, 200);
        assertEquals(answered, await head.json());
        const stored = await GET<{
            name: string;
            attribute_type: string;
        }>(
            db,
            collection.slice(1) + recordId
                + '/attributes/' + attrId,
            DEV_TOKEN,
        );
        assertStrictEquals(stored.name, 'Initial');
        assertStrictEquals(
            stored.attribute_type, 'text',
        );
    },
);

// ── Failure modes ──────

Deno.test(
    'POST nested record-types rejects an empty'
    + ' attribute name',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assertRejects(
            () => POST(db
                , 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
                kind: 'create',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [
                    {
                        id: 'UQBiHFcwJeCDSnmkPBoYRA',
                        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                        record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                        name: '',
                        attribute_type: 'text',
                        sort_order: 0,
                        options: [],
                        constraints: [],
                    },
                ],
                initialState: 'active',
            }, DEV_TOKEN),
            Error,
            'must be non-empty',
        );
    },
);

Deno.test(
    'POST nested record-types rejects an'
    + ' attribute whose record_id does not'
    + ' match the top-level id',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assertRejects(
            () => POST(db
                , 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
                kind: 'create',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [
                    {
                        id: 'UQBiHFcwJeCDSnmkPBoYRA',
                        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                        record_id: generateIdentifier(),
                        name: 'X',
                        attribute_type: 'text',
                        sort_order: 0,
                        options: [],
                        constraints: [],
                    },
                ],
                initialState: 'active',
            }, DEV_TOKEN),
            Error,
            'record_id must match top-level id',
        );
    },
);

Deno.test(
    'POST nested record-types rejects an unknown'
    + ' kind discriminator',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assertRejects(
            () => POST(db
                , 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
                kind: 'destroy',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
            }, DEV_TOKEN),
            Error,
            'RecordWriteBody kind',
        );
    },
);

Deno.test(
    'POST nested record-types rejects an invalid'
    + ' initialState',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assertRejects(
            () => POST(db
                , 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
                kind: 'create',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
                initialState: 'pending',
            }, DEV_TOKEN),
            Error,
            'expected RecordState',
        );
    },
);

Deno.test(
    'POST nested record-types rejects a body with'
    + ' an unexpected key',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assertRejects(
            () => POST(db
                , 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
                kind: 'create',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
                initialState: 'active',
                extra: 'forbidden',
            }, DEV_TOKEN),
            Error,
            'unexpected key',
        );
    },
);

Deno.test(
    'POST nested record-types rejects a body with'
    + ' a missing required key',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await assertRejects(
            () => POST(db
                , 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
                kind: 'edit',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
            }, DEV_TOKEN),
            Error,
            'missing required key',
        );
    },
);

Deno.test(
    'POST nested record-types create ignores a raw colliding states'
    + ' row (states ROW half stripped)',
    async () => {
        const db = await freshDb();
        // Phase Final Task 2: states ROW half stripped —
        // a raw colliding states row no longer aborts the
        // message-plane create.
    // Phase Final Stage B: states table retired.
        const recId = generateIdentifier();
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'create',
            id: recId,
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'Survives', description: '',
                position: 1,
            },
            attributes: [],
            initialState: 'active',
        }, DEV_TOKEN);
        const rec = await GET<{ id: string }>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + recId, DEV_TOKEN,
        );
        assertStrictEquals(rec.id, recId);
    },
);
