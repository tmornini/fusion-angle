import { assertEquals, assertMatch, assertStrictEquals } from '@std/assert';
import type {
    AttributeType,
    Constraint,
} from '../api/types.ts';
import {
    type AttributeSchemaRow,
    validateAttributeValue,
    formatViolation,
} from '../api/record-constraints.ts';

function makeAttribute(
    attributeType: AttributeType,
    constraints: Constraint[] = [],
    overrides: Partial<AttributeSchemaRow> = {},
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

Deno.test(
    'validateAttributeValue returns no'
    + ' violations for a null value',
    () => {
        const attribute = makeAttribute('text', [
            { kind: 'regex', pattern: '^abc$' },
        ]);
        assertEquals(
            validateAttributeValue(
                attribute, null,
            ),
            [],
        );
    },
);

Deno.test(
    'validateAttributeValue returns no'
    + ' violations for an empty string value',
    () => {
        const attribute = makeAttribute('text', [
            { kind: 'regex', pattern: '^abc$' },
        ]);
        assertEquals(
            validateAttributeValue(
                attribute, '',
            ),
            [],
        );
    },
);

Deno.test(
    'validateAttributeValue returns a regex'
    + ' violation when the value does not match',
    () => {
        const attribute = makeAttribute('text', [
            { kind: 'regex', pattern: '^abc$' },
        ], { id: 'a-x', name: 'Code' });
        const out = validateAttributeValue(
            attribute, 'xyz',
        );
        assertStrictEquals(out.length, 1);
        assertStrictEquals(out[0]!.kind, 'regex');
        if (out[0]!.kind !== 'regex') return;
        assertStrictEquals(out[0]!.attributeId, 'a-x');
        assertStrictEquals(out[0]!.attributeName, 'Code');
        assertStrictEquals(out[0]!.pattern, '^abc$');
    },
);

Deno.test(
    'validateAttributeValue passes when the'
    + ' regex matches',
    () => {
        const attribute = makeAttribute('text', [
            { kind: 'regex', pattern: '^abc$' },
        ]);
        assertEquals(
            validateAttributeValue(
                attribute, 'abc',
            ),
            [],
        );
    },
);

Deno.test(
    'validateAttributeValue returns a range_min'
    + ' violation for a number below the bound',
    () => {
        const attribute = makeAttribute('number', [
            { kind: 'range_min', min: '10' },
        ]);
        const out = validateAttributeValue(
            attribute, '5',
        );
        assertStrictEquals(out.length, 1);
        assertStrictEquals(out[0]!.kind, 'range_min');
        if (out[0]!.kind !== 'range_min') return;
        assertStrictEquals(out[0]!.min, '10');
    },
);

Deno.test(
    'validateAttributeValue passes when number is'
    + ' on the range_min boundary',
    () => {
        const attribute = makeAttribute('number', [
            { kind: 'range_min', min: '10' },
        ]);
        assertEquals(
            validateAttributeValue(
                attribute, '10',
            ),
            [],
        );
    },
);

Deno.test(
    'validateAttributeValue returns a range_max'
    + ' violation for a number above the bound',
    () => {
        const attribute = makeAttribute('number', [
            { kind: 'range_max', max: '100' },
        ]);
        const out = validateAttributeValue(
            attribute, '150',
        );
        assertStrictEquals(out.length, 1);
        assertStrictEquals(out[0]!.kind, 'range_max');
        if (out[0]!.kind !== 'range_max') return;
        assertStrictEquals(out[0]!.max, '100');
    },
);

Deno.test(
    'validateAttributeValue returns a range_min'
    + ' violation for a date before the bound'
    + ' (lexicographic compare)',
    () => {
        const attribute = makeAttribute('date', [
            { kind: 'range_min', min: '2026-01-01' },
        ]);
        const out = validateAttributeValue(
            attribute, '2025-06-15',
        );
        assertStrictEquals(out.length, 1);
        assertStrictEquals(out[0]!.kind, 'range_min');
    },
);

Deno.test(
    'validateAttributeValue passes when date is'
    + ' on or after range_min bound',
    () => {
        const attribute = makeAttribute('date', [
            { kind: 'range_min', min: '2026-01-01' },
        ]);
        assertEquals(
            validateAttributeValue(
                attribute, '2026-01-01',
            ),
            [],
        );
        assertEquals(
            validateAttributeValue(
                attribute, '2027-12-31',
            ),
            [],
        );
    },
);

Deno.test(
    'validateAttributeValue returns a range_max'
    + ' violation for a date after the bound',
    () => {
        const attribute = makeAttribute('date', [
            { kind: 'range_max', max: '2099-12-31' },
        ]);
        const out = validateAttributeValue(
            attribute, '2100-01-01',
        );
        assertStrictEquals(out.length, 1);
        assertStrictEquals(out[0]!.kind, 'range_max');
        if (out[0]!.kind !== 'range_max') return;
        assertStrictEquals(out[0]!.max, '2099-12-31');
    },
);

Deno.test(
    'validateAttributeValue collects multiple'
    + ' violations when an attribute has both'
    + ' range_min and range_max constraints',
    () => {
        const attribute = makeAttribute('number', [
            { kind: 'range_min', min: '10' },
            { kind: 'range_max', max: '50' },
        ]);
        const tooLow = validateAttributeValue(
            attribute, '5',
        );
        assertStrictEquals(tooLow.length, 1);
        assertStrictEquals(
            tooLow[0]!.kind, 'range_min',
        );
        const tooHigh = validateAttributeValue(
            attribute, '100',
        );
        assertStrictEquals(tooHigh.length, 1);
        assertStrictEquals(
            tooHigh[0]!.kind, 'range_max',
        );
        const ok = validateAttributeValue(
            attribute, '25',
        );
        assertEquals(ok, []);
    },
);

Deno.test(
    'formatViolation formats date range_min using'
    + ' an idiomatic date phrase',
    () => {
        const attribute = makeAttribute('date', [
            { kind: 'range_min', min: '2026-01-01' },
        ], { name: 'Start Date' });
        const out = formatViolation(
            {
                kind: 'range_min',
                attributeId: attribute.id,
                attributeName: attribute.name,
                min: '2026-01-01',
            },
            attribute,
        );
        assertMatch(out, /Start Date/);
        assertMatch(out, /on or after/);
        assertMatch(out, /2026-01-01/);
    },
);

Deno.test(
    'formatViolation formats date range_max using'
    + ' an idiomatic date phrase',
    () => {
        const attribute = makeAttribute('date', [
            { kind: 'range_max', max: '2099-12-31' },
        ], { name: 'End Date' });
        const out = formatViolation(
            {
                kind: 'range_max',
                attributeId: attribute.id,
                attributeName: attribute.name,
                max: '2099-12-31',
            },
            attribute,
        );
        assertMatch(out, /End Date/);
        assertMatch(out, /on or before/);
        assertMatch(out, /2099-12-31/);
    },
);

Deno.test(
    'formatViolation formats number range_min'
    + ' using at-least phrasing',
    () => {
        const attribute = makeAttribute('number', [
            { kind: 'range_min', min: '10' },
        ], { name: 'Count' });
        const out = formatViolation(
            {
                kind: 'range_min',
                attributeId: attribute.id,
                attributeName: attribute.name,
                min: '10',
            },
            attribute,
        );
        assertMatch(out, /Count/);
        assertMatch(out, /at least/);
        assertMatch(out, /10/);
    },
);

Deno.test(
    'formatViolation formats regex violation',
    () => {
        const attribute = makeAttribute('text', [
            { kind: 'regex', pattern: '^x$' },
        ], { name: 'Code' });
        const out = formatViolation(
            {
                kind: 'regex',
                attributeId: attribute.id,
                attributeName: attribute.name,
                pattern: '^x$',
            },
            attribute,
        );
        assertMatch(out, /Code/);
        assertMatch(out, /pattern/);
        assertMatch(out, /\^x\$/);
    },
);

Deno.test(
    'formatViolation formats required violation',
    () => {
        const attribute = makeAttribute('text', [], {
            name: 'Title',
        });
        const out = formatViolation(
            {
                kind: 'required',
                attributeId: attribute.id,
                attributeName: attribute.name,
            },
            attribute,
        );
        assertMatch(out, /Title/);
        assertMatch(out, /required/);
    },
);
