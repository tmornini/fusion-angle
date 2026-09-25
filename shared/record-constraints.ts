import type {
    AttributeType,
    Constraint,
    RecordAttributeId,
} from './types.ts';
import { ValidationError } from './types.ts';

// Schema-side attribute row for the value engine and
// attribute ACL (Task 13). Structural twin of nested
// attribute document bodies above the storage seam.
export interface AttributeSchemaRow {
    readonly id: string;
    readonly name: string;
    readonly attributeType: AttributeType;
    readonly options: readonly string[];
    readonly constraints: readonly Constraint[];
    readonly readRoles: readonly string[];
    readonly writeRoles: readonly string[];
}

// Fields the constraint engine needs. AttributeSchemaRow
// and the web-app RecordAttribute domain twin both satisfy
// this Pick (roles / org / sortOrder are unused here).
type ConstraintAttribute = Pick<
    AttributeSchemaRow,
    'id' | 'name' | 'attributeType' | 'constraints'
>;

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
    attribute: ConstraintAttribute,
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
    attribute: Pick<
        AttributeSchemaRow, 'attributeType'
    >,
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

// Reconciliation 9 / G9: ISO calendar date (YYYY-MM-DD).
// Regex alone admits 2026-13-99; reject non-calendar days
// so range comparators stay lexicographic on real dates.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoCalendarDate(value: string): boolean {
    if (!ISO_DATE_RE.test(value)) {
        return false;
    }
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(5, 7));
    const d = Number(value.slice(8, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y
        && dt.getUTCMonth() === m - 1
        && dt.getUTCDate() === d;
}

function typeConformanceFailure(
    attribute: AttributeSchemaRow,
    value: string,
): string | null {
    switch (attribute.attributeType) {
        case 'text':
            return null;
        case 'number': {
            if (!Number.isFinite(Number(value))) {
                return 'must be a finite number';
            }
            return null;
        }
        case 'date':
            if (!isIsoCalendarDate(value)) {
                return 'must be an ISO date'
                    + ' (YYYY-MM-DD)';
            }
            return null;
        case 'select':
        case 'radio':
            if (!attribute.options.includes(value)) {
                return 'must be one of the allowed'
                    + ' options';
            }
            return null;
        case 'checkbox':
            if (
                value !== 'true'
                && value !== 'false'
            ) {
                return 'must be "true" or "false"';
            }
            return null;
    }
}

function valueError(
    attributeName: string,
    violationText: string,
): ValidationError {
    return new ValidationError(
        'value for attribute "'
        + attributeName
        + '" '
        + violationText,
    );
}

// Gate for instance set[] entries. Type conformance first
// (reconciliation 9), then the existing constraint engine.
// Empty string is never legal — absence is clear/omission.
export function validateInstanceValues(
    set: readonly {
        attribute_id: string;
        value: string;
    }[],
    attributesById: ReadonlyMap<
        string, AttributeSchemaRow
    >,
): void {
    for (const entry of set) {
        const attribute = attributesById.get(
            entry.attribute_id,
        );
        if (attribute === undefined) {
            throw new ValidationError(
                'value for attribute "'
                + entry.attribute_id
                + '" references unknown attribute',
            );
        }
        if (entry.value === '') {
            throw valueError(
                attribute.name,
                'must not be empty',
            );
        }
        const typeFail = typeConformanceFailure(
            attribute, entry.value,
        );
        if (typeFail !== null) {
            throw valueError(
                attribute.name, typeFail,
            );
        }
        const violations = validateAttributeValue(
            attribute, entry.value,
        );
        if (violations.length > 0) {
            throw valueError(
                attribute.name,
                formatViolation(
                    violations[0]!, attribute,
                ),
            );
        }
    }
}
