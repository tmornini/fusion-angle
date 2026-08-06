import { test } from 'node:test';
import { strict as assert } from 'node:assert';
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
        id: 'a-1',
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

function assertRejects(
    set: readonly {
        attribute_id: string;
        value: string;
    }[],
    attributesById: ReadonlyMap<
        string, AttributeSchemaRow
    >,
    messagePattern: RegExp,
): void {
    assert.throws(
        () => validateInstanceValues(
            set, attributesById,
        ),
        (err: unknown) => {
            assert.ok(
                err instanceof ValidationError,
            );
            assert.match(err.message, messagePattern);
            return true;
        },
    );
}

test(
    'number non-numeric → ValidationError names'
    + ' attribute and type',
    () => {
        const row = makeRow('number', {
            name: 'Amount',
        });
        assertRejects(
            [{ attribute_id: 'a-1', value: 'abc' }],
            byId(row),
            /value for attribute "Amount"/,
        );
        assertRejects(
            [{ attribute_id: 'a-1', value: 'abc' }],
            byId(row),
            /number/i,
        );
    },
);

test('number finite string passes', () => {
    const row = makeRow('number');
    assert.doesNotThrow(() => {
        validateInstanceValues(
            [{ attribute_id: 'a-1', value: '42' }],
            byId(row),
        );
    });
});

test(
    'number below range_min → ValidationError via'
    + ' constraint engine',
    () => {
        const row = makeRow(
            'number',
            { name: 'Count' },
            [{ kind: 'range_min', min: '50' }],
        );
        assertRejects(
            [{ attribute_id: 'a-1', value: '42' }],
            byId(row),
            /value for attribute "Count"/,
        );
        assertRejects(
            [{ attribute_id: 'a-1', value: '42' }],
            byId(row),
            /at least 50/,
        );
    },
);

test(
    'date non-ISO calendar day fails; valid ISO'
    + ' date passes',
    () => {
        const row = makeRow('date', {
            name: 'Due',
        });
        assertRejects(
            [{
                attribute_id: 'a-1',
                value: '2026-13-99',
            }],
            byId(row),
            /value for attribute "Due"/,
        );
        assert.doesNotThrow(() => {
            validateInstanceValues(
                [{
                    attribute_id: 'a-1',
                    value: '2026-08-05',
                }],
                byId(row),
            );
        });
    },
);

test(
    'select value outside options fails; inside'
    + ' passes',
    () => {
        const row = makeRow('select', {
            name: 'Priority',
            options: ['low', 'high'],
        });
        assertRejects(
            [{
                attribute_id: 'a-1',
                value: 'medium',
            }],
            byId(row),
            /value for attribute "Priority"/,
        );
        assert.doesNotThrow(() => {
            validateInstanceValues(
                [{
                    attribute_id: 'a-1',
                    value: 'high',
                }],
                byId(row),
            );
        });
    },
);

test(
    'checkbox rejects non-boolean strings;'
    + ' true and false pass',
    () => {
        const row = makeRow('checkbox', {
            name: 'Done',
        });
        assertRejects(
            [{ attribute_id: 'a-1', value: 'yes' }],
            byId(row),
            /value for attribute "Done"/,
        );
        assert.doesNotThrow(() => {
            validateInstanceValues(
                [{
                    attribute_id: 'a-1',
                    value: 'true',
                }],
                byId(row),
            );
            validateInstanceValues(
                [{
                    attribute_id: 'a-1',
                    value: 'false',
                }],
                byId(row),
            );
        });
    },
);

test('text any non-empty string passes', () => {
    const row = makeRow('text');
    assert.doesNotThrow(() => {
        validateInstanceValues(
            [{
                attribute_id: 'a-1',
                value: 'hello world',
            }],
            byId(row),
        );
        validateInstanceValues(
            [{
                attribute_id: 'a-1',
                value: '42',
            }],
            byId(row),
        );
    });
});

test(
    'empty-string value → ValidationError always',
    () => {
        const row = makeRow('text', {
            name: 'Title',
        });
        assertRejects(
            [{ attribute_id: 'a-1', value: '' }],
            byId(row),
            /value for attribute "Title"/,
        );
    },
);

test(
    'radio value outside options fails; inside'
    + ' passes',
    () => {
        const row = makeRow('radio', {
            name: 'Choice',
            options: ['a', 'b'],
        });
        assertRejects(
            [{ attribute_id: 'a-1', value: 'c' }],
            byId(row),
            /value for attribute "Choice"/,
        );
        assert.doesNotThrow(() => {
            validateInstanceValues(
                [{
                    attribute_id: 'a-1',
                    value: 'a',
                }],
                byId(row),
            );
        });
    },
);
