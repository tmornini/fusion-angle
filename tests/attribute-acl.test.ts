import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ValidationError } from '../api/types.ts';
import {
    ApiError,
    HTTP_FORBIDDEN,
} from '../api/http-errors.ts';
import type { AttributeSchemaRow } from
    '../api/record-constraints.ts';
import {
    assertWritableAttributeIds,
    projectReadableValues,
    rolesCanRead,
    rolesCanWrite,
} from '../api/attribute-acl.ts';

// Field-level × role-aware ACL (Task 13).
// Admin bypass on FENCED org roles only; all-or-nothing
// 403 on multi-id writes; no internal defense in projection.

function makeRow(
    overrides: Partial<AttributeSchemaRow> = {},
): AttributeSchemaRow {
    return {
        id: 'UQBiHFcwJeCDSnmkPBoYRA',
        name: 'Field',
        attributeType: 'text',
        options: [],
        constraints: [],
        readRoles: ['member', 'admin'],
        writeRoles: ['member', 'admin'],
        ...overrides,
    };
}

function byId(
    ...rows: AttributeSchemaRow[]
): ReadonlyMap<string, AttributeSchemaRow> {
    return new Map(rows.map(r => [r.id, r]));
}

test(
    'member + read_roles [member, admin] → readable',
    () => {
        const row = makeRow({
            readRoles: ['member', 'admin'],
        });
        assert.equal(
            rolesCanRead(['member'], row),
            true,
        );
    },
);

test(
    'member + read_roles [] → not readable',
    () => {
        const row = makeRow({ readRoles: [] });
        assert.equal(
            rolesCanRead(['member'], row),
            false,
        );
    },
);

test(
    'admin + read_roles [] → readable (bypass)',
    () => {
        const row = makeRow({ readRoles: [] });
        assert.equal(
            rolesCanRead(['admin'], row),
            true,
        );
        assert.equal(
            rolesCanWrite(['admin'], row),
            true,
        );
    },
);

test(
    'member + write w/o read (submit-only)'
    + ' → writable, not readable',
    () => {
        const row = makeRow({
            readRoles: [],
            writeRoles: ['member'],
        });
        assert.equal(
            rolesCanWrite(['member'], row),
            true,
        );
        assert.equal(
            rolesCanRead(['member'], row),
            false,
        );
    },
);

test(
    'unknown attribute id in write set'
    + ' → ValidationError',
    () => {
        const known = makeRow({ id: 'a-known' });
        assert.throws(
            () => assertWritableAttributeIds(
                ['a-known', 'a-missing'],
                byId(known),
                ['member'],
            ),
            (err: unknown) => {
                assert.ok(
                    err instanceof ValidationError,
                );
                assert.match(
                    err.message,
                    /a-missing/,
                );
                return true;
            },
        );
    },
);

test(
    'one unwritable id among writable ones'
    + ' → ApiError 403 all-or-nothing',
    () => {
        const writable = makeRow({
            id: 'a-ok',
            writeRoles: ['member'],
        });
        const blocked = makeRow({
            id: 'a-no',
            writeRoles: ['admin'],
        });
        assert.throws(
            () => assertWritableAttributeIds(
                ['a-ok', 'a-no'],
                byId(writable, blocked),
                ['member'],
            ),
            (err: unknown) => {
                assert.ok(err instanceof ApiError);
                assert.equal(
                    err.status, HTTP_FORBIDDEN,
                );
                assert.equal(
                    err.message,
                    'forbidden: attribute a-no is not'
                    + ' writable with the held roles',
                );
                return true;
            },
        );
    },
);

test(
    "custom role 'auditor' in read_roles"
    + ' + member token → not readable',
    () => {
        const row = makeRow({
            readRoles: ['auditor'],
        });
        assert.equal(
            rolesCanRead(['member'], row),
            false,
        );
    },
);

test(
    'projection of zero readable → []',
    () => {
        const secret = makeRow({
            id: 'a-secret',
            readRoles: ['admin'],
        });
        const out = projectReadableValues(
            [{
                attribute_id: 'a-secret',
                value: 'hidden',
            }],
            byId(secret),
            ['member'],
        );
        assert.deepEqual(out, []);
    },
);

test(
    'projection keeps only readable values'
    + ' in order',
    () => {
        const open = makeRow({
            id: 'a-open',
            readRoles: ['member'],
        });
        const closed = makeRow({
            id: 'a-closed',
            readRoles: [],
        });
        const out = projectReadableValues(
            [
                {
                    attribute_id: 'a-open',
                    value: 'seen',
                },
                {
                    attribute_id: 'a-closed',
                    value: 'hidden',
                },
                {
                    attribute_id: 'a-open',
                    value: 'again',
                },
            ],
            byId(open, closed),
            ['member'],
        );
        assert.deepEqual(out, [
            {
                attribute_id: 'a-open',
                value: 'seen',
            },
            {
                attribute_id: 'a-open',
                value: 'again',
            },
        ]);
    },
);

test(
    'assertWritableAttributeIds passes when'
    + ' every id is writable',
    () => {
        const a = makeRow({
            id: 'UQBiHFcwJeCDSnmkPBoYRA',
            writeRoles: ['member'],
        });
        const b = makeRow({
            id: 'a-2',
            writeRoles: ['member', 'admin'],
        });
        assert.doesNotThrow(
            () => assertWritableAttributeIds(
                ['UQBiHFcwJeCDSnmkPBoYRA', 'a-2'],
                byId(a, b),
                ['member'],
            ),
        );
    },
);

test(
    'admin bypass on write ACL assert',
    () => {
        const row = makeRow({
            id: 'a-locked',
            writeRoles: [],
        });
        assert.doesNotThrow(
            () => assertWritableAttributeIds(
                ['a-locked'],
                byId(row),
                ['admin'],
            ),
        );
    },
);
