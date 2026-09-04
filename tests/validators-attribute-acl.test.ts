import {
    assertEquals,
    assertInstanceOf,
    assertMatch,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import {
    ValidationError,
} from '../api/types.ts';
import {
    validateAttributeDocument,
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

// -- both ACL keys are required -------------------------

Deno.test('omitting both ACL keys is rejected', () => {
    const err = assertThrows(
        () => validateAttributeDocument(coreFields()),
    ) as Error;
    assertInstanceOf(err, ValidationError);
    assertStrictEquals(
        err.message,
        'missing required key "read_roles"'
        + ' for AttributeDocumentBody',
    );
});

Deno.test('read_roles: [] with write_roles given is'
+ ' admins-only on read', () => {
    const out = validateAttributeDocument(
        coreFields({ read_roles: [], write_roles: ['member'] }),
    );
    assertEquals(out.read_roles, []);
    assertEquals(out.write_roles, ['member']);
});

Deno.test('rejects read_roles with an empty string', () => {
    const err = assertThrows(
        () => validateAttributeDocument(
            coreFields({
                read_roles: [''],
                write_roles: ['member'],
            }),
        ),
    ) as Error;
    assertInstanceOf(err, ValidationError);
    assertMatch(err.message, /non-empty/);
});

Deno.test('write_roles without read_roles is rejected',
() => {
    const err = assertThrows(
        () => validateAttributeDocument(
            coreFields({ write_roles: ['member'] }),
        ),
    ) as Error;
    assertInstanceOf(err, ValidationError);
    assertStrictEquals(
        err.message,
        'missing required key "read_roles"'
        + ' for AttributeDocumentBody',
    );
});

Deno.test('create rejects unknown key record_id', () => {
    const err = assertThrows(
        () => validateAttributeDocument(
            coreFields({
                record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                read_roles: ['member'],
                write_roles: ['member'],
            }),
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
        () => validateAttributeDocument(
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
    const out = validateAttributeDocument(
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
        () => validateAttributeDocument(
            coreFields({
                attribute_type: 'select',
                options: [],
                read_roles: ['member'],
                write_roles: ['member'],
            }),
        ),
        ValidationError,
    );
});

Deno.test('create rejects constraint that does not'
+ ' apply to attribute_type', () => {
    assertThrows(
        () => validateAttributeDocument(
            coreFields({
                attribute_type: 'number',
                constraints: [
                    {
                        kind: 'regex',
                        pattern: '^\\d+$',
                    },
                ],
                read_roles: ['member'],
                write_roles: ['member'],
            }),
        ),
        ValidationError,
    );
});
