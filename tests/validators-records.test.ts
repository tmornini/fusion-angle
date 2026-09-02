import {
    assertEquals,
    assertMatch,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import {
    validateRecordEntity,
    validateRecordAttributeEntity,
    validateFlowRecordEntity,
    validateRecordWriteBody,
} from '../api/validators.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// validateRecordEntity

Deno.test(
    'validateRecordEntity accepts a valid payload',
    () => {
        const out = validateRecordEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            name: 'Customer',
            description: 'Customer record',
            position: 1,
        });
        assertStrictEquals(out.name, 'Customer');
        assertStrictEquals(
            out.description, 'Customer record',
        );
        assertStrictEquals(out.position, 1);
    },
);

Deno.test(
    'validateRecordEntity rejects an empty name',
    () => {
        const err = assertThrows(
            () => validateRecordEntity({
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: '',
                description: 'x',
                position: 1,
            }),
        ) as Error;
        assertMatch(err.message, /name must be/i);
    },
);

Deno.test(
    'validateRecordEntity rejects a missing key',
    () => {
        assertThrows(
            () => validateRecordEntity({
                name: 'C',
            } as never),
            Error, 'missing required key',
        );
    },
);

Deno.test(
    'validateRecordEntity rejects a missing position',
    () => {
        assertThrows(
            () => validateRecordEntity({
                name: 'C',
                description: 'd',
            } as never),
            Error, 'missing required key',
        );
    },
);

Deno.test(
    'validateRecordEntity rejects an extra key',
    () => {
        assertThrows(
            () => validateRecordEntity({
                name: 'C',
                description: 'd',
                position: 1,
                extra: 1,
            } as never),
            Error, 'unexpected key',
        );
    },
);

Deno.test(
    'validateRecordEntity rejects non-string name',
    () => {
        assertThrows(
            () => validateRecordEntity({
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 7,
                description: 'd',
                position: 1,
            } as never),
        );
    },
);

Deno.test(
    'validateRecordEntity rejects non-number'
    + ' position',
    () => {
        assertThrows(
            () => validateRecordEntity({
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'C',
                description: 'd',
                position: 'first',
            } as never),
        );
    },
);

// validateRecordAttributeEntity

Deno.test(
    'validateRecordAttributeEntity accepts a'
    + ' valid payload',
    () => {
        const out = validateRecordAttributeEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            record_id: 'rbfHGatkwQzGZJVXKJEeyw',
            name: 'Email',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
        });
        assertStrictEquals(out.record_id, 'rbfHGatkwQzGZJVXKJEeyw');
        assertStrictEquals(out.name, 'Email');
        assertStrictEquals(out.attribute_type, 'text');
    },
);

Deno.test(
    'validateRecordAttributeEntity rejects an'
    + ' empty name',
    () => {
        const err = assertThrows(
            () => validateRecordAttributeEntity({
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                name: '',
                attribute_type: 'text',
                sort_order: 1,
                options: [],
                constraints: [],
            }),
        ) as Error;
        assertMatch(err.message, /name/i);
    },
);

Deno.test(
    'validateRecordAttributeEntity rejects an'
    + ' invalid attribute_type',
    () => {
        assertThrows(
            () => validateRecordAttributeEntity({
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                name: 'X',
                attribute_type: 'multi_select',
                sort_order: 1,
                options: [],
                constraints: [],
            }),
            Error, 'AttributeType',
        );
    },
);

Deno.test(
    'validateRecordAttributeEntity rejects a'
    + ' missing required key',
    () => {
        assertThrows(
            () => validateRecordAttributeEntity({
                record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                name: 'X',
                attribute_type: 'text',
                sort_order: 1,
                options: [],
            } as never),
            Error, 'missing required key',
        );
    },
);

Deno.test(
    'validateRecordAttributeEntity rejects an'
    + ' extra key',
    () => {
        assertThrows(
            () => validateRecordAttributeEntity({
                record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                name: 'X',
                attribute_type: 'text',
                sort_order: 1,
                options: [],
                constraints: [],
                extra: 'no',
            } as never),
            Error, 'unexpected key',
        );
    },
);

Deno.test(
    'validateRecordAttributeEntity rejects a regex'
    + ' constraint on a number attribute_type',
    () => {
        assertThrows(
            () => validateRecordAttributeEntity({
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                name: 'Count',
                attribute_type: 'number',
                sort_order: 1,
                options: [],
                constraints: [
                    { kind: 'regex',
                        pattern: '^\\d+$' },
                ],
            }),
            Error, 'regex',
        );
    },
);

Deno.test(
    'validateRecordAttributeEntity rejects a'
    + ' range_min constraint on a text'
    + ' attribute_type',
    () => {
        assertThrows(
            () => validateRecordAttributeEntity({
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                name: 'X',
                attribute_type: 'text',
                sort_order: 1,
                options: [],
                constraints: [
                    { kind: 'range_min', min: '0' },
                ],
            }),
        );
    },
);

Deno.test(
    'validateRecordAttributeEntity accepts a'
    + ' range_max constraint on a date'
    + ' attribute_type',
    () => {
        const out = validateRecordAttributeEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            record_id: 'rbfHGatkwQzGZJVXKJEeyw',
            name: 'When',
            attribute_type: 'date',
            sort_order: 1,
            options: [],
            constraints: [
                { kind: 'range_max',
                    max: '2099-12-31' },
            ],
        });
        assertStrictEquals(out.attribute_type, 'date');
    },
);

// validateFlowRecordEntity

Deno.test(
    'validateFlowRecordEntity accepts a valid'
    + ' payload',
    () => {
        const out = validateFlowRecordEntity({
            flow_id: 'aEsGMmBEFaVdWihhHXwCbw',
            record_id: 'rbfHGatkwQzGZJVXKJEeyw',
            at: '2026-05-01T00:00:00.000000Z',
        });
        assertStrictEquals(out.flow_id, 'aEsGMmBEFaVdWihhHXwCbw');
        assertStrictEquals(out.record_id, 'rbfHGatkwQzGZJVXKJEeyw');
    },
);

Deno.test(
    'validateFlowRecordEntity rejects a missing'
    + ' required key',
    () => {
        assertThrows(
            () => validateFlowRecordEntity({
                flow_id: 'f',
                record_id: 'r',
            } as never),
            Error, 'missing required key',
        );
    },
);

Deno.test(
    'validateFlowRecordEntity rejects an extra key',
    () => {
        assertThrows(
            () => validateFlowRecordEntity({
                flow_id: 'f',
                record_id: 'r',
                at: 'now',
                extra: 1,
            } as never),
            Error, 'unexpected key',
        );
    },
);

Deno.test(
    'validateFlowRecordEntity rejects a non-string'
    + ' record_id',
    () => {
        assertThrows(
            () => validateFlowRecordEntity({
                flow_id: 'f',
                record_id: 7,
                at: 'now',
            } as never),
        );
    },
);

// validateRecordWriteBody — create variant

Deno.test(
    'validateRecordWriteBody accepts a valid'
    + ' create body',
    () => {
        const eventId = generateIdentifier();
        const out = validateRecordWriteBody({
            kind: 'create',
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'R',
                description: 'd',
                position: 1,
            },
            attributes: [
                {
                    id: 'UQBiHFcwJeCDSnmkPBoYRA',
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                    name: 'X',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
            ],
            initialState: 'active',
            initialStateEventId: eventId,
            initialStateAt:
                '2025-01-01T00:00:00.000000Z',
        });
        assertStrictEquals(out.kind, 'create');
        assertStrictEquals(out.id, 'rbfHGatkwQzGZJVXKJEeyw');
        if (out.kind === 'create') {
            assertStrictEquals(
                out.initialState, 'active',
            );
            assertStrictEquals(
                out.initialStateEventId, eventId,
            );
            assertStrictEquals(
                out.initialStateAt,
                '2025-01-01T00:00:00.000000Z',
            );
        }
    },
);

Deno.test(
    'validateRecordWriteBody rejects an'
    + ' attribute whose record_id does not match'
    + ' the top-level id',
    () => {
        assertThrows(
            () => validateRecordWriteBody({
                kind: 'create',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [
                    {
                        id: 'UQBiHFcwJeCDSnmkPBoYRA',
                        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                        record_id: generateIdentifier(),
                        name: 'X',
                        attribute_type: 'text',
                        sort_order: 0,
                        options: [],
                        constraints: [],
                    },
                ],
                initialState: 'active',
                initialStateEventId: generateIdentifier(),
                initialStateAt:
                    '2025-01-01T00:00:00.000000Z',
            }),
            Error, 'record_id must match top-level id',
        );
    },
);

Deno.test(
    'validateRecordWriteBody rejects an'
    + ' invalid initialState value',
    () => {
        assertThrows(
            () => validateRecordWriteBody({
                kind: 'create',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
                initialState: 'in-progress',
                initialStateEventId: generateIdentifier(),
                initialStateAt:
                    '2025-01-01T00:00:00.000000Z',
            }),
            Error, 'expected RecordState',
        );
    },
);

Deno.test(
    'validateRecordWriteBody create rejects a'
    + ' missing initialStateEventId',
    () => {
        assertThrows(
            () => validateRecordWriteBody({
                kind: 'create',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
                initialState: 'active',
            } as never),
            Error, 'missing required key',
        );
    },
);

// validateRecordWriteBody — edit variant

Deno.test(
    'validateRecordWriteBody accepts a valid'
    + ' edit body',
    () => {
        const out = validateRecordWriteBody({
            kind: 'edit',
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            record: {
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                name: 'R',
                description: '',
                position: 1,
            },
            attributes: [],
            state: 'active',
            removedAttributeIds: ['old-1'],
        });
        assertStrictEquals(out.kind, 'edit');
        if (out.kind === 'edit') {
            assertEquals(
                out.removedAttributeIds,
                ['old-1'],
            );
            assertStrictEquals(out.state, 'active');
        }
    },
);

Deno.test(
    'validateRecordWriteBody edit rejects a'
    + ' body that carries initialState (kind'
    + ' discriminator vs key set)',
    () => {
        assertThrows(
            () => validateRecordWriteBody({
                kind: 'edit',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
                removedAttributeIds: [],
                initialState: 'active',
            } as never),
            Error, 'unexpected key',
        );
    },
);

// validateRecordWriteBody — discriminator

Deno.test(
    'validateRecordWriteBody rejects an'
    + ' unknown kind discriminator',
    () => {
        assertThrows(
            () => validateRecordWriteBody({
                kind: 'destroy',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
            } as never),
            Error, 'RecordWriteBody kind',
        );
    },
);

Deno.test(
    'validateRecordWriteBody rejects a body'
    + ' missing the kind field',
    () => {
        assertThrows(
            () => validateRecordWriteBody({
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
            } as never),
        );
    },
);

Deno.test(
    'validateRecordAttributeEntity accepts native'
    + ' options and constraints',
    () => {
        const entity =
            validateRecordAttributeEntity({
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                name: 'Severity',
                attribute_type: 'select',
                sort_order: 0,
                options: ['low', 'high'],
                constraints: [],
            });
        assertEquals(
            entity.options, ['low', 'high'],
        );
        assertEquals(entity.constraints, []);
    },
);

Deno.test(
    'validateRecordAttributeEntity rejects'
    + ' JSON-encoded options',
    () => {
        assertThrows(
            () => validateRecordAttributeEntity({
                organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                record_id: 'rbfHGatkwQzGZJVXKJEeyw',
                name: 'Severity',
                attribute_type: 'select',
                sort_order: 0,
                options: '["low"]',
                constraints: [],
            }),
            Error, 'expected array for options',
        );
    },
);
