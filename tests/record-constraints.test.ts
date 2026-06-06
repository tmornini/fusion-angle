import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type {
    RecordAttribute,
    AttributeType,
    Constraint,
} from '../api/types.ts';
import {
    validateAttributeValue,
    formatViolation,
} from '../web-app/app/record-constraints.ts';

function makeAttribute(
    attributeType: AttributeType,
    constraints: Constraint[] = [],
    overrides: Partial<RecordAttribute> = {},
): RecordAttribute {
    return {
        id: 'a-1',
        record_id: 'rec-1',
        name: 'Field',
        attribute_type: attributeType,
        sort_order: 0,
        options: [],
        constraints,
        ...overrides,
    };
}

test(
    'validateAttributeValue returns no'
    + ' violations for a null value',
    () => {
        const attribute = makeAttribute('text', [
            { kind: 'regex', pattern: '^abc$' },
        ]);
        assert.deepEqual(
            validateAttributeValue(
                attribute, null,
            ),
            [],
        );
    },
);

test(
    'validateAttributeValue returns no'
    + ' violations for an empty string value',
    () => {
        const attribute = makeAttribute('text', [
            { kind: 'regex', pattern: '^abc$' },
        ]);
        assert.deepEqual(
            validateAttributeValue(
                attribute, '',
            ),
            [],
        );
    },
);

test(
    'validateAttributeValue returns a regex'
    + ' violation when the value does not match',
    () => {
        const attribute = makeAttribute('text', [
            { kind: 'regex', pattern: '^abc$' },
        ], { id: 'a-x', name: 'Code' });
        const out = validateAttributeValue(
            attribute, 'xyz',
        );
        assert.equal(out.length, 1);
        assert.equal(out[0]!.kind, 'regex');
        if (out[0]!.kind !== 'regex') return;
        assert.equal(out[0]!.attributeId, 'a-x');
        assert.equal(out[0]!.attributeName, 'Code');
        assert.equal(out[0]!.pattern, '^abc$');
    },
);

test(
    'validateAttributeValue passes when the'
    + ' regex matches',
    () => {
        const attribute = makeAttribute('text', [
            { kind: 'regex', pattern: '^abc$' },
        ]);
        assert.deepEqual(
            validateAttributeValue(
                attribute, 'abc',
            ),
            [],
        );
    },
);

test(
    'validateAttributeValue returns a range_min'
    + ' violation for a number below the bound',
    () => {
        const attribute = makeAttribute('number', [
            { kind: 'range_min', min: '10' },
        ]);
        const out = validateAttributeValue(
            attribute, '5',
        );
        assert.equal(out.length, 1);
        assert.equal(out[0]!.kind, 'range_min');
        if (out[0]!.kind !== 'range_min') return;
        assert.equal(out[0]!.min, '10');
    },
);

test(
    'validateAttributeValue passes when number is'
    + ' on the range_min boundary',
    () => {
        const attribute = makeAttribute('number', [
            { kind: 'range_min', min: '10' },
        ]);
        assert.deepEqual(
            validateAttributeValue(
                attribute, '10',
            ),
            [],
        );
    },
);

test(
    'validateAttributeValue returns a range_max'
    + ' violation for a number above the bound',
    () => {
        const attribute = makeAttribute('number', [
            { kind: 'range_max', max: '100' },
        ]);
        const out = validateAttributeValue(
            attribute, '150',
        );
        assert.equal(out.length, 1);
        assert.equal(out[0]!.kind, 'range_max');
        if (out[0]!.kind !== 'range_max') return;
        assert.equal(out[0]!.max, '100');
    },
);

test(
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
        assert.equal(out.length, 1);
        assert.equal(out[0]!.kind, 'range_min');
    },
);

test(
    'validateAttributeValue passes when date is'
    + ' on or after range_min bound',
    () => {
        const attribute = makeAttribute('date', [
            { kind: 'range_min', min: '2026-01-01' },
        ]);
        assert.deepEqual(
            validateAttributeValue(
                attribute, '2026-01-01',
            ),
            [],
        );
        assert.deepEqual(
            validateAttributeValue(
                attribute, '2027-12-31',
            ),
            [],
        );
    },
);

test(
    'validateAttributeValue returns a range_max'
    + ' violation for a date after the bound',
    () => {
        const attribute = makeAttribute('date', [
            { kind: 'range_max', max: '2099-12-31' },
        ]);
        const out = validateAttributeValue(
            attribute, '2100-01-01',
        );
        assert.equal(out.length, 1);
        assert.equal(out[0]!.kind, 'range_max');
        if (out[0]!.kind !== 'range_max') return;
        assert.equal(out[0]!.max, '2099-12-31');
    },
);

test(
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
        assert.equal(tooLow.length, 1);
        assert.equal(
            tooLow[0]!.kind, 'range_min',
        );
        const tooHigh = validateAttributeValue(
            attribute, '100',
        );
        assert.equal(tooHigh.length, 1);
        assert.equal(
            tooHigh[0]!.kind, 'range_max',
        );
        const ok = validateAttributeValue(
            attribute, '25',
        );
        assert.deepEqual(ok, []);
    },
);

test(
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
        assert.match(out, /Start Date/);
        assert.match(out, /on or after/);
        assert.match(out, /2026-01-01/);
    },
);

test(
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
        assert.match(out, /End Date/);
        assert.match(out, /on or before/);
        assert.match(out, /2099-12-31/);
    },
);

test(
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
        assert.match(out, /Count/);
        assert.match(out, /at least/);
        assert.match(out, /10/);
    },
);

test(
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
        assert.match(out, /Code/);
        assert.match(out, /pattern/);
        assert.match(out, /\^x\$/);
    },
);

test(
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
        assert.match(out, /Title/);
        assert.match(out, /required/);
    },
);
