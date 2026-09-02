import {
    assertInstanceOf, assertMatch, assertThrows,
} from '@std/assert';
import type {
    AttributeType,
    Constraint,
} from '../api/types.ts';
import { ValidationError } from '../api/types.ts';
import {
    type AttributeSchemaRow,
    validateInstanceValues,
} from '../api/record-constraints.ts';

// Server gate for instance set[] values: type conformance
// (reconciliation 9 / G9) then the constraint engine.
// Message shape:
//   value for attribute "<name>" <violation text>
// Empty string is never a legal value (absence is clear).

function makeRow(
    attributeType: AttributeType,
    overrides: Partial<AttributeSchemaRow> = {},
    constraints: readonly Constraint[] = [],
): AttributeSchemaRow {
    return {
        id: 'UQBiHFcwJeCDSnmkPBoYRA',
        name: 'Field',
        attributeType,
        options: [],
        constraints,
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

function assertValidationThrows(
    set: readonly {
        attribute_id: string;
        value: string;
    }[],
    attributesById: ReadonlyMap<
        string, AttributeSchemaRow
    >,
    messagePattern: RegExp,
): void {
    const err = assertThrows(
        () => validateInstanceValues(
            set, attributesById,
        ),
    ) as Error;
    assertInstanceOf(err, ValidationError);
    assertMatch(err.message, messagePattern);
}

Deno.test(
    'number non-numeric → ValidationError names'
    + ' attribute and type',
    () => {
        const row = makeRow('number', {
            name: 'Amount',
        });
        assertValidationThrows(
            [{ attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA', value: 'abc' }],
            byId(row),
            /value for attribute "Amount"/,
        );
        assertValidationThrows(
            [{ attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA', value: 'abc' }],
            byId(row),
            /number/i,
        );
    },
);

Deno.test('number finite string passes', () => {
    const row = makeRow('number');
    validateInstanceValues(
        [{ attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA', value: '42' }],
        byId(row),
    );
});

Deno.test(
    'number below range_min → ValidationError via'
    + ' constraint engine',
    () => {
        const row = makeRow(
            'number',
            { name: 'Count' },
            [{ kind: 'range_min', min: '50' }],
        );
        assertValidationThrows(
            [{ attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA', value: '42' }],
            byId(row),
            /value for attribute "Count"/,
        );
        assertValidationThrows(
            [{ attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA', value: '42' }],
            byId(row),
            /at least 50/,
        );
    },
);

Deno.test(
    'date non-ISO calendar day fails; valid ISO'
    + ' date passes',
    () => {
        const row = makeRow('date', {
            name: 'Due',
        });
        assertValidationThrows(
            [{
                attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA',
                value: '2026-13-99',
            }],
            byId(row),
            /value for attribute "Due"/,
        );
        validateInstanceValues(
            [{
                attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA',
                value: '2026-08-05',
            }],
            byId(row),
        );
    },
);

Deno.test(
    'select value outside options fails; inside'
    + ' passes',
    () => {
        const row = makeRow('select', {
            name: 'Priority',
            options: ['low', 'high'],
        });
        assertValidationThrows(
            [{
                attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA',
                value: 'medium',
            }],
            byId(row),
            /value for attribute "Priority"/,
        );
        validateInstanceValues(
            [{
                attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA',
                value: 'high',
            }],
            byId(row),
        );
    },
);

Deno.test(
    'checkbox rejects non-boolean strings;'
    + ' true and false pass',
    () => {
        const row = makeRow('checkbox', {
            name: 'Done',
        });
        assertValidationThrows(
            [{ attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA', value: 'yes' }],
            byId(row),
            /value for attribute "Done"/,
        );
        validateInstanceValues(
            [{
                attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA',
                value: 'true',
            }],
            byId(row),
        );
        validateInstanceValues(
            [{
                attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA',
                value: 'false',
            }],
            byId(row),
        );
    },
);

Deno.test('text any non-empty string passes', () => {
    const row = makeRow('text');
    validateInstanceValues(
        [{
            attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA',
            value: 'hello world',
        }],
        byId(row),
    );
    validateInstanceValues(
        [{
            attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA',
            value: '42',
        }],
        byId(row),
    );
});

Deno.test(
    'empty-string value → ValidationError always',
    () => {
        const row = makeRow('text', {
            name: 'Title',
        });
        assertValidationThrows(
            [{ attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA', value: '' }],
            byId(row),
            /value for attribute "Title"/,
        );
    },
);

Deno.test(
    'radio value outside options fails; inside'
    + ' passes',
    () => {
        const row = makeRow('radio', {
            name: 'Choice',
            options: ['a', 'b'],
        });
        assertValidationThrows(
            [{ attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA', value: 'c' }],
            byId(row),
            /value for attribute "Choice"/,
        );
        validateInstanceValues(
            [{
                attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA',
                value: 'a',
            }],
            byId(row),
        );
    },
);
