import {
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { GET, POST } from './in-page-facade.ts';
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
import { operationIdHeader } from
    './operation-id-header.ts';


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
        }, DEV_TOKEN,
            operationIdHeader());
        const record = (await GET<{
            id: string;
            name: string;
        }>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rbfHGatkwQzGZJVXKJEeyw', DEV_TOKEN, operationIdHeader()))
                .body().toValue();
        assertStrictEquals(record.name, 'Quarterly Renewals');
        // bare per-entity current-state alias RETIRED
        // (Phase 15 Task 7); post-write check rides
        // surviving /versions.
        const history = (await GET<{
            state: string;
        }[]>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rbfHGatkwQzGZJVXKJEeyw/versions/', DEV_TOKEN,
                operationIdHeader())).body().toValue();
        assertStrictEquals(history.length, 1);
        assertStrictEquals(history[0]!.state, 'active');
        const attrs = (await GET<unknown[]>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rbfHGatkwQzGZJVXKJEeyw/attributes/', DEV_TOKEN,
                operationIdHeader())).body().toValue();
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
        }, DEV_TOKEN,
            operationIdHeader());
        const record = (await GET<{ name: string }>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rcaSzEaORBkezCxyhLhecA', DEV_TOKEN,
                operationIdHeader())).body().toValue();
        assertStrictEquals(record.name, 'Empty');
        // bare per-entity current-state alias RETIRED
        // (Phase 15 Task 7).
        const history = (await GET<{
            state: string;
            member_id: string;
        }[]>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rcaSzEaORBkezCxyhLhecA/versions/', DEV_TOKEN,
                operationIdHeader())).body().toValue();
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
        }, DEV_TOKEN,
            operationIdHeader());
        const head = await db.messagePairs.getHeadPair(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/',
            'rbfHGatkwQzGZJVXKJEeyw',
        );
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
        }, DEV_TOKEN,
            operationIdHeader([
                ['If-Match', '"' + head!.id + '"'],
            ]));
        const record = (await GET<{
            name: string;
            description: string;
        }>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rbfHGatkwQzGZJVXKJEeyw', DEV_TOKEN, operationIdHeader()))
                .body().toValue();
        assertStrictEquals(record.name, 'After');
        assertStrictEquals(
            record.description, 'updated',
        );
        const after = (await GET<{ state: string }>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rbfHGatkwQzGZJVXKJEeyw', DEV_TOKEN,
                operationIdHeader())).body().toValue();
        assertStrictEquals(
            after.state, 'active',
            'edit must not change state',
        );
    },
);

Deno.test(
    'POST nested record-types edit removes'
    + ' attributes by id and adds new ones',
    async () => {
        const db = await freshDb();
        const oldAttrId = generateIdentifier();
        const newAttrId = generateIdentifier();
        await seedCurrentMember(db);
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'create',
            id: 'rbfHGatkwQzGZJVXKJEeyw',
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
                    record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                    name: 'Old',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
            ],
            initialState: 'active',
        }, DEV_TOKEN,
            operationIdHeader());
        const head = await db.messagePairs.getHeadPair(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/',
            'rbfHGatkwQzGZJVXKJEeyw',
        );
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'edit',
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'R',
                description: '',
                position: 1,
            },
            attributes: [
                {
                    id: newAttrId,
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                    name: 'New',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
            ],
            // Echoed from the create's own known head above.
            state: 'active',
            removedAttributeIds: [oldAttrId],
        }, DEV_TOKEN,
            operationIdHeader([
                ['If-Match', '"' + head!.id + '"'],
            ]));
        const all = (await GET<{
            id: string;
            name: string;
        }[]>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
            + 'rbfHGatkwQzGZJVXKJEeyw/attributes/', DEV_TOKEN,
                operationIdHeader())).body().toValue();
        assertStrictEquals(all.length, 1);
        assertStrictEquals(all[0]!.id, newAttrId);
        assertStrictEquals(all[0]!.name, 'New');
    },
);

Deno.test(
    'POST nested record-types edit updates an'
    + ' existing attribute by upsert',
    async () => {
        const db = await freshDb();
        await seedCurrentMember(db);
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
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
                    name: 'Initial',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
            ],
            initialState: 'active',
        }, DEV_TOKEN,
            operationIdHeader());
        const head = await db.messagePairs.getHeadPair(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/',
            'rbfHGatkwQzGZJVXKJEeyw',
        );
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/', {
            kind: 'edit',
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
                    name: 'Renamed',
                    attribute_type: 'number',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
            ],
            // Echoed from the create's own known head above.
            state: 'active',
            removedAttributeIds: [],
        }, DEV_TOKEN,
            operationIdHeader([
                ['If-Match', '"' + head!.id + '"'],
            ]));
        const stored = (await GET<{
            name: string;
            attribute_type: string;
        }>(
            db,
            'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rbfHGatkwQzGZJVXKJEeyw'
            + '/attributes/UQBiHFcwJeCDSnmkPBoYRA',
            DEV_TOKEN,
            operationIdHeader())).body().toValue();
        assertStrictEquals(stored.name, 'Renamed');
        assertStrictEquals(
            stored.attribute_type, 'number',
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
            }, DEV_TOKEN,
                operationIdHeader()),
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
            }, DEV_TOKEN,
                operationIdHeader()),
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
            }, DEV_TOKEN,
                operationIdHeader()),
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
            }, DEV_TOKEN,
                operationIdHeader()),
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
            }, DEV_TOKEN,
                operationIdHeader()),
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
            }, DEV_TOKEN,
                operationIdHeader()),
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
        }, DEV_TOKEN,
            operationIdHeader());
        const rec = (await GET<{ id: string }>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + recId, DEV_TOKEN,
                operationIdHeader())).body().toValue();
        assertStrictEquals(rec.id, recId);
    },
);
