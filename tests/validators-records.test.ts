import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    validateRecordEntity,
    validateRecordAttributeEntity,
    validateFlowRecordEntity,
} from '../api/validators.ts';
import { jsonArrayField } from '../api/types.ts';

// validateRecordEntity

test(
    'validateRecordEntity accepts a valid payload',
    () => {
        const out = validateRecordEntity({
            name: 'Customer',
            description: 'Customer record',
        });
        assert.equal(out.name, 'Customer');
        assert.equal(
            out.description, 'Customer record',
        );
    },
);

test(
    'validateRecordEntity rejects an empty name',
    () => {
        assert.throws(
            () => validateRecordEntity({
                name: '',
                description: 'x',
            }),
            /name must be/i,
        );
    },
);

test(
    'validateRecordEntity rejects a missing key',
    () => {
        assert.throws(
            () => validateRecordEntity({
                name: 'C',
            } as never),
            /missing required key/,
        );
    },
);

test(
    'validateRecordEntity rejects an extra key',
    () => {
        assert.throws(
            () => validateRecordEntity({
                name: 'C',
                description: 'd',
                extra: 1,
            } as never),
            /unexpected key/,
        );
    },
);

test(
    'validateRecordEntity rejects non-string name',
    () => {
        assert.throws(
            () => validateRecordEntity({
                name: 7,
                description: 'd',
            } as never),
        );
    },
);

// validateRecordAttributeEntity

test(
    'validateRecordAttributeEntity accepts a'
    + ' valid payload',
    () => {
        const out = validateRecordAttributeEntity({
            record_id: 'rec-1',
            name: 'Email',
            attribute_type: 'text',
            sort_order: 1,
            options: jsonArrayField([]),
            constraints: jsonArrayField([]),
        });
        assert.equal(out.record_id, 'rec-1');
        assert.equal(out.name, 'Email');
        assert.equal(out.attribute_type, 'text');
    },
);

test(
    'validateRecordAttributeEntity rejects an'
    + ' empty name',
    () => {
        assert.throws(
            () => validateRecordAttributeEntity({
                record_id: 'rec-1',
                name: '',
                attribute_type: 'text',
                sort_order: 1,
                options: jsonArrayField([]),
                constraints: jsonArrayField([]),
            }),
            /name/i,
        );
    },
);

test(
    'validateRecordAttributeEntity rejects an'
    + ' invalid attribute_type',
    () => {
        assert.throws(
            () => validateRecordAttributeEntity({
                record_id: 'rec-1',
                name: 'X',
                attribute_type: 'multi_select',
                sort_order: 1,
                options: jsonArrayField([]),
                constraints: jsonArrayField([]),
            }),
            /AttributeType/,
        );
    },
);

test(
    'validateRecordAttributeEntity rejects a'
    + ' missing required key',
    () => {
        assert.throws(
            () => validateRecordAttributeEntity({
                record_id: 'rec-1',
                name: 'X',
                attribute_type: 'text',
                sort_order: 1,
                options: jsonArrayField([]),
            } as never),
            /missing required key/,
        );
    },
);

test(
    'validateRecordAttributeEntity rejects an'
    + ' extra key',
    () => {
        assert.throws(
            () => validateRecordAttributeEntity({
                record_id: 'rec-1',
                name: 'X',
                attribute_type: 'text',
                sort_order: 1,
                options: jsonArrayField([]),
                constraints: jsonArrayField([]),
                extra: 'no',
            } as never),
            /unexpected key/,
        );
    },
);

test(
    'validateRecordAttributeEntity rejects a regex'
    + ' constraint on a number attribute_type',
    () => {
        assert.throws(
            () => validateRecordAttributeEntity({
                record_id: 'rec-1',
                name: 'Count',
                attribute_type: 'number',
                sort_order: 1,
                options: jsonArrayField([]),
                constraints: jsonArrayField([
                    { kind: 'regex',
                        pattern: '^\\d+$' },
                ]),
            }),
            /regex/,
        );
    },
);

test(
    'validateRecordAttributeEntity rejects a'
    + ' range_min constraint on a text'
    + ' attribute_type',
    () => {
        assert.throws(
            () => validateRecordAttributeEntity({
                record_id: 'rec-1',
                name: 'X',
                attribute_type: 'text',
                sort_order: 1,
                options: jsonArrayField([]),
                constraints: jsonArrayField([
                    { kind: 'range_min', min: '0' },
                ]),
            }),
        );
    },
);

test(
    'validateRecordAttributeEntity accepts a'
    + ' range_max constraint on a date'
    + ' attribute_type',
    () => {
        const out = validateRecordAttributeEntity({
            record_id: 'rec-1',
            name: 'When',
            attribute_type: 'date',
            sort_order: 1,
            options: jsonArrayField([]),
            constraints: jsonArrayField([
                { kind: 'range_max',
                    max: '2099-12-31' },
            ]),
        });
        assert.equal(out.attribute_type, 'date');
    },
);

// validateFlowRecordEntity

test(
    'validateFlowRecordEntity accepts a valid'
    + ' payload',
    () => {
        const out = validateFlowRecordEntity({
            flow_id: 'flow-1',
            record_id: 'rec-1',
            at: '2026-05-01T00:00:00.000Z',
        });
        assert.equal(out.flow_id, 'flow-1');
        assert.equal(out.record_id, 'rec-1');
    },
);

test(
    'validateFlowRecordEntity rejects a missing'
    + ' required key',
    () => {
        assert.throws(
            () => validateFlowRecordEntity({
                flow_id: 'f',
                record_id: 'r',
            } as never),
            /missing required key/,
        );
    },
);

test(
    'validateFlowRecordEntity rejects an extra key',
    () => {
        assert.throws(
            () => validateFlowRecordEntity({
                flow_id: 'f',
                record_id: 'r',
                at: 'now',
                extra: 1,
            } as never),
            /unexpected key/,
        );
    },
);

test(
    'validateFlowRecordEntity rejects a non-string'
    + ' record_id',
    () => {
        assert.throws(
            () => validateFlowRecordEntity({
                flow_id: 'f',
                record_id: 7,
                at: 'now',
            } as never),
        );
    },
);
