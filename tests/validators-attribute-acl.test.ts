import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    DEFAULT_ATTRIBUTE_ACL_ROLES,
    ValidationError,
} from '../api/types.ts';
import {
    validateAttributeDocumentCreate,
    validateAttributeDocumentReplace,
} from '../api/validators.ts';

// Nested attribute document body fields — no record_id
// (address parentage), no organization_id (fence stamp).
function coreFields(
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        name: 'Priority',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
        ...overrides,
    };
}

// -- create: ACL optional → stamp defaults -----------------

test('create omits both ACL keys → stamps'
+ ' DEFAULT_ATTRIBUTE_ACL_ROLES on both', () => {
    const out = validateAttributeDocumentCreate(
        coreFields(),
    );
    assert.deepEqual(
        out.read_roles,
        [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    );
    assert.deepEqual(
        out.write_roles,
        [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    );
    assert.equal(out.name, 'Priority');
    assert.equal(out.attribute_type, 'text');
    assert.equal(out.sort_order, 1);
    assert.deepEqual(out.options, []);
    assert.deepEqual(out.constraints, []);
});

test('create accepts read_roles: [] (admins only)',
() => {
    const out = validateAttributeDocumentCreate(
        coreFields({ read_roles: [] }),
    );
    assert.deepEqual(out.read_roles, []);
    assert.deepEqual(
        out.write_roles,
        [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    );
});

test('create rejects read_roles with empty string',
() => {
    assert.throws(
        () => validateAttributeDocumentCreate(
            coreFields({ read_roles: [''] }),
        ),
        (err: unknown) => {
            assert.ok(err instanceof ValidationError);
            assert.match(
                err.message,
                /non-empty/,
            );
            return true;
        },
    );
});

test('create accepts write_roles without read_roles'
+ ' (submit-only field)', () => {
    const out = validateAttributeDocumentCreate(
        coreFields({ write_roles: ['member'] }),
    );
    assert.deepEqual(
        out.read_roles,
        [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    );
    assert.deepEqual(out.write_roles, ['member']);
});

test('create rejects unknown key record_id', () => {
    assert.throws(
        () => validateAttributeDocumentCreate(
            coreFields({ record_id: 'rbfHGatkwQzGZJVXKJEeyw' }),
        ),
        (err: unknown) => {
            assert.ok(err instanceof ValidationError);
            assert.equal(
                err.message,
                'unexpected key "record_id" for'
                + ' AttributeDocumentBody',
            );
            return true;
        },
    );
});

// -- replace: ACL keys required ----------------------------

test('replace rejects missing write_roles', () => {
    assert.throws(
        () => validateAttributeDocumentReplace(
            coreFields({
                read_roles: ['member'],
            }),
        ),
        (err: unknown) => {
            assert.ok(err instanceof ValidationError);
            assert.equal(
                err.message,
                'missing required key "write_roles"'
                + ' for AttributeDocumentBody',
            );
            return true;
        },
    );
});

test('replace accepts both ACL keys verbatim', () => {
    const out = validateAttributeDocumentReplace(
        coreFields({
            read_roles: ['auditor'],
            write_roles: ['admin'],
        }),
    );
    assert.deepEqual(out.read_roles, ['auditor']);
    assert.deepEqual(out.write_roles, ['admin']);
    assert.equal(out.name, 'Priority');
});

// -- shared existing attribute rules -----------------------

test('create rejects select with zero options', () => {
    assert.throws(
        () => validateAttributeDocumentCreate(
            coreFields({
                attribute_type: 'select',
                options: [],
            }),
        ),
        ValidationError,
    );
});

test('create rejects constraint that does not'
+ ' apply to attribute_type', () => {
    assert.throws(
        () => validateAttributeDocumentCreate(
            coreFields({
                attribute_type: 'number',
                constraints: [
                    {
                        kind: 'regex',
                        pattern: '^\\d+$',
                    },
                ],
            }),
        ),
        ValidationError,
    );
});
