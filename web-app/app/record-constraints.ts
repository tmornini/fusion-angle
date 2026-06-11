import type {
    AttributeType,
    RecordAttributeId,
} from '../../api/types.ts';
import type {
    RecordAttribute,
} from './adapters/record-attributes.ts';

export type ConstraintViolation =
    | {
        kind: 'required';
        attributeId: RecordAttributeId;
        attributeName: string;
    }
    | {
        kind: 'regex';
        attributeId: RecordAttributeId;
        attributeName: string;
        pattern: string;
    }
    | {
        kind: 'range_min';
        attributeId: RecordAttributeId;
        attributeName: string;
        min: string;
    }
    | {
        kind: 'range_max';
        attributeId: RecordAttributeId;
        attributeName: string;
        max: string;
    };

function parseNumericByType(
    value: string,
    attributeType: AttributeType,
): number | string {
    if (attributeType === 'number') {
        return parseFloat(value);
    }
    return value;
}

function compareGte(
    value: string,
    bound: string,
    attributeType: AttributeType,
): boolean {
    const v = parseNumericByType(
        value, attributeType,
    );
    const b = parseNumericByType(
        bound, attributeType,
    );
    return v >= b;
}

function compareLte(
    value: string,
    bound: string,
    attributeType: AttributeType,
): boolean {
    const v = parseNumericByType(
        value, attributeType,
    );
    const b = parseNumericByType(
        bound, attributeType,
    );
    return v <= b;
}

export function validateAttributeValue(
    attribute: RecordAttribute,
    value: string | null,
): ConstraintViolation[] {
    if (value === null || value === '') {
        return [];
    }
    const out: ConstraintViolation[] = [];
    for (const c of attribute.constraints) {
        if (c.kind === 'regex') {
            const re = new RegExp(c.pattern);
            if (!re.test(value)) {
                out.push({
                    kind: 'regex',
                    attributeId: attribute.id,
                    attributeName: attribute.name,
                    pattern: c.pattern,
                });
            }
            continue;
        }
        if (c.kind === 'range_min') {
            if (
                !compareGte(
                    value, c.min,
                    attribute.attributeType,
                )
            ) {
                out.push({
                    kind: 'range_min',
                    attributeId: attribute.id,
                    attributeName: attribute.name,
                    min: c.min,
                });
            }
            continue;
        }
        if (
            !compareLte(
                value, c.max,
                attribute.attributeType,
            )
        ) {
            out.push({
                kind: 'range_max',
                attributeId: attribute.id,
                attributeName: attribute.name,
                max: c.max,
            });
        }
    }
    return out;
}

export function formatViolation(
    v: ConstraintViolation,
    attribute: RecordAttribute,
): string {
    if (v.kind === 'required') {
        return v.attributeName + ' is required';
    }
    if (v.kind === 'regex') {
        return v.attributeName
            + ' does not match pattern '
            + v.pattern;
    }
    if (v.kind === 'range_min') {
        if (attribute.attributeType === 'date') {
            return v.attributeName
                + ' must be on or after '
                + v.min;
        }
        return v.attributeName
            + ' must be at least ' + v.min;
    }
    if (attribute.attributeType === 'date') {
        return v.attributeName
            + ' must be on or before '
            + v.max;
    }
    return v.attributeName
        + ' must be at most ' + v.max;
}
