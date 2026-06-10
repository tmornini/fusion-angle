import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    validateRecordEntity,
    validateRecordAttributeEntity,
    validateFlowRecordEntity,
    validateRecordMultiPutBody,
} from '../api/validators.ts';
import {
    jsonArrayField,
} from '../api/types.ts';

// validateRecordEntity

test(
    'validateRecordEntity accepts a valid payload',
    () => {
        const out = validateRecordEntity({
            organization_id: '1',
            name: 'Customer',
            description: 'Customer record',
            position: 1,
        });
        assert.equal(out.name, 'Customer');
        assert.equal(
            out.description, 'Customer record',
        );
        assert.equal(out.position, 1);
    },
);

test(
    'validateRecordEntity rejects an empty name',
    () => {
        assert.throws(
            () => validateRecordEntity({
                organization_id: '1',
                name: '',
                description: 'x',
                position: 1,
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
    'validateRecordEntity rejects a missing position',
    () => {
        assert.throws(
            () => validateRecordEntity({
                name: 'C',
                description: 'd',
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
                position: 1,
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
                organization_id: '1',
                name: 7,
                description: 'd',
                position: 1,
            } as never),
        );
    },
);

test(
    'validateRecordEntity rejects non-number'
    + ' position',
    () => {
        assert.throws(
            () => validateRecordEntity({
                organization_id: '1',
                name: 'C',
                description: 'd',
                position: 'first',
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
            organization_id: '1',
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
                organization_id: '1',
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
                organization_id: '1',
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
                organization_id: '1',
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
                organization_id: '1',
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
            organization_id: '1',
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
            at: '2026-05-01T00:00:00.000000Z',
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

// validateRecordMultiPutBody — create variant

test(
    'validateRecordMultiPutBody accepts a valid'
    + ' create body',
    () => {
        const out = validateRecordMultiPutBody({
            kind: 'create',
            id: 'rec-1',
            record: {
                organization_id: '1',
                name: 'R',
                description: 'd',
                position: 1,
            },
            attributes: [
                {
                    id: 'a-1',
                    organization_id: '1',
                    record_id: 'rec-1',
                    name: 'X',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: jsonArrayField([]),
                    constraints: jsonArrayField(
                        [],
                    ),
                },
            ],
            initialState: 'active',
            initialStateEventId: 'ev-1',
        });
        assert.equal(out.kind, 'create');
        assert.equal(out.id, 'rec-1');
        if (out.kind === 'create') {
            assert.equal(
                out.initialState, 'active',
            );
            assert.equal(
                out.initialStateEventId, 'ev-1',
            );
        }
    },
);

test(
    'validateRecordMultiPutBody rejects an'
    + ' attribute whose record_id does not match'
    + ' the top-level id',
    () => {
        assert.throws(
            () => validateRecordMultiPutBody({
                kind: 'create',
                id: 'rec-1',
                record: {
                    organization_id: '1',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [
                    {
                        id: 'a-1',
                        organization_id: '1',
                        record_id: 'rec-other',
                        name: 'X',
                        attribute_type: 'text',
                        sort_order: 0,
                        options: jsonArrayField(
                            [],
                        ),
                        constraints: jsonArrayField(
                            [],
                        ),
                    },
                ],
                initialState: 'active',
                initialStateEventId: 'ev-1',
            }),
            /record_id must match top-level id/,
        );
    },
);

test(
    'validateRecordMultiPutBody rejects an'
    + ' invalid initialState value',
    () => {
        assert.throws(
            () => validateRecordMultiPutBody({
                kind: 'create',
                id: 'rec-1',
                record: {
                    organization_id: '1',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
                initialState: 'in-progress',
                initialStateEventId: 'ev-1',
            }),
            /expected RecordState/,
        );
    },
);

test(
    'validateRecordMultiPutBody create rejects a'
    + ' missing initialStateEventId',
    () => {
        assert.throws(
            () => validateRecordMultiPutBody({
                kind: 'create',
                id: 'rec-1',
                record: {
                    organization_id: '1',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
                initialState: 'active',
            } as never),
            /missing required key/,
        );
    },
);

// validateRecordMultiPutBody — edit variant

test(
    'validateRecordMultiPutBody accepts a valid'
    + ' edit body',
    () => {
        const out = validateRecordMultiPutBody({
            kind: 'edit',
            id: 'rec-1',
            record: {
                organization_id: '1',
                name: 'R',
                description: '',
                position: 1,
            },
            attributes: [],
            removedAttributeIds: ['old-1'],
        });
        assert.equal(out.kind, 'edit');
        if (out.kind === 'edit') {
            assert.deepEqual(
                out.removedAttributeIds,
                ['old-1'],
            );
        }
    },
);

test(
    'validateRecordMultiPutBody edit rejects a'
    + ' body that carries initialState (kind'
    + ' discriminator vs key set)',
    () => {
        assert.throws(
            () => validateRecordMultiPutBody({
                kind: 'edit',
                id: 'rec-1',
                record: {
                    organization_id: '1',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
                removedAttributeIds: [],
                initialState: 'active',
            } as never),
            /unexpected key/,
        );
    },
);

// validateRecordMultiPutBody — discriminator

test(
    'validateRecordMultiPutBody rejects an'
    + ' unknown kind discriminator',
    () => {
        assert.throws(
            () => validateRecordMultiPutBody({
                kind: 'destroy',
                id: 'rec-1',
                record: {
                    organization_id: '1',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
            } as never),
            /RecordMultiPutBody kind/,
        );
    },
);

test(
    'validateRecordMultiPutBody rejects a body'
    + ' missing the kind field',
    () => {
        assert.throws(
            () => validateRecordMultiPutBody({
                id: 'rec-1',
                record: {
                    organization_id: '1',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
            } as never),
        );
    },
);
