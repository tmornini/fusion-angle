import {
    assertEquals,
    assertInstanceOf,
    assertMatch,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
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

Deno.test('create omits both ACL keys → stamps'
+ ' DEFAULT_ATTRIBUTE_ACL_ROLES on both', () => {
    const out = validateAttributeDocumentCreate(
        coreFields(),
    );
    assertEquals(
        out.read_roles,
        [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    );
    assertEquals(
        out.write_roles,
        [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    );
    assertStrictEquals(out.name, 'Priority');
    assertStrictEquals(out.attribute_type, 'text');
    assertStrictEquals(out.sort_order, 1);
    assertEquals(out.options, []);
    assertEquals(out.constraints, []);
});

Deno.test('create accepts read_roles: [] (admins only)',
() => {
    const out = validateAttributeDocumentCreate(
        coreFields({ read_roles: [] }),
    );
    assertEquals(out.read_roles, []);
    assertEquals(
        out.write_roles,
        [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    );
});

Deno.test('create rejects read_roles with empty string',
() => {
    const err = assertThrows(
        () => validateAttributeDocumentCreate(
            coreFields({ read_roles: [''] }),
        ),
    ) as Error;
    assertInstanceOf(err, ValidationError);
    assertMatch(err.message, /non-empty/);
});

Deno.test('create accepts write_roles without read_roles'
+ ' (submit-only field)', () => {
    const out = validateAttributeDocumentCreate(
        coreFields({ write_roles: ['member'] }),
    );
    assertEquals(
        out.read_roles,
        [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    );
    assertEquals(out.write_roles, ['member']);
});

Deno.test('create rejects unknown key record_id', () => {
    const err = assertThrows(
        () => validateAttributeDocumentCreate(
            coreFields({ record_id: 'rbfHGatkwQzGZJVXKJEeyw' }),
        ),
    ) as Error;
    assertInstanceOf(err, ValidationError);
    assertStrictEquals(
        err.message,
        'unexpected key "record_id" for'
        + ' AttributeDocumentBody',
    );
});

// -- replace: ACL keys required ----------------------------

Deno.test('replace rejects missing write_roles', () => {
    const err = assertThrows(
        () => validateAttributeDocumentReplace(
            coreFields({
                read_roles: ['member'],
            }),
        ),
    ) as Error;
    assertInstanceOf(err, ValidationError);
    assertStrictEquals(
        err.message,
        'missing required key "write_roles"'
        + ' for AttributeDocumentBody',
    );
});

Deno.test('replace accepts both ACL keys verbatim', () => {
    const out = validateAttributeDocumentReplace(
        coreFields({
            read_roles: ['auditor'],
            write_roles: ['admin'],
        }),
    );
    assertEquals(out.read_roles, ['auditor']);
    assertEquals(out.write_roles, ['admin']);
    assertStrictEquals(out.name, 'Priority');
});

// -- shared existing attribute rules -----------------------

Deno.test('create rejects select with zero options', () => {
    assertThrows(
        () => validateAttributeDocumentCreate(
            coreFields({
                attribute_type: 'select',
                options: [],
            }),
        ),
        ValidationError,
    );
});

Deno.test('create rejects constraint that does not'
+ ' apply to attribute_type', () => {
    assertThrows(
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
