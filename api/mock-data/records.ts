import type {
    RecordEntity,
    RecordAttributeEntity,
    Constraint,
} from '../types.ts';

// The seeded Records and their stable ids. The id consts are
// shared with the record attributes, flow-record bindings, and
// record state events, so they are exported. Fixed data; the
// composition root assigns organization_id at write time.
export const customerProfileRecordId =
    'sJxkGGTrPegHqFbQAkXnjw';
export const projectBriefRecordId =
    'sOAGoeswzdrwFqfFFQdxQg';

export function buildRecords():
    Omit<
        RecordEntity,
        | 'organization_id'
        | 'state'
        | 'state_at'
        | 'state_event_id'
    >[] {
    return [
        {
            id: customerProfileRecordId,
            name: 'Customer Profile',
            description:
                'Company-side facts captured during'
                + ' onboarding and sales pursuits.',
            position: 1,
        },
        {
            id: projectBriefRecordId,
            name: 'Project Brief',
            description:
                'Lightweight scoping shape used by'
                + ' the Fusion Angle Flow.',
            position: 2,
        },
    ];
}

// Constraint payloads. Three kinds in the toy:
// 'regex' on text attributes, 'range_min' /
// 'range_max' on number or date attributes.
// Applicability is asserted at the row writer
// (validators.ts) per defense-in-depth.
const emailRegexConstraint: Constraint[] = [{
    kind: 'regex',
    pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
}];
const revenueRangeMinConstraint:
    Constraint[] = [{
    kind: 'range_min',
    min: '0',
}];
const foundedOnRangeMaxConstraint:
    Constraint[] = [{
    kind: 'range_max',
    max: '2099-12-31',
}];

export function buildRecordAttributes():
    Omit<RecordAttributeEntity, 'organization_id'>[] {
    return [
        {
            id: 'CPJmMPXRaBIiNdGBofUPVg',
            record_id: customerProfileRecordId,
            name: 'Company Name',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
        },
        {
            id: 'oeqelDVElwxHYWkWRVTCYw',
            record_id: customerProfileRecordId,
            name: 'Contact Email',
            attribute_type: 'text',
            sort_order: 2,
            options: [],
            constraints: emailRegexConstraint,
        },
        {
            id: 'kxbdVhmkaEzkJvghWKFzkw',
            record_id: customerProfileRecordId,
            name: 'Contact Phone',
            attribute_type: 'text',
            sort_order: 3,
            options: [],
            constraints: [],
        },
        {
            id: 'QHzHnEAmqGSgiEfkXoWMTw',
            record_id: customerProfileRecordId,
            name: 'Industry',
            attribute_type: 'select',
            sort_order: 4,
            options: [
                'Technology',
                'Finance',
                'Healthcare',
                'Retail',
                'Manufacturing',
            ],
            constraints: [],
        },
        {
            id: 'AXxvHyKNpNYXYKOorywqRQ',
            record_id: customerProfileRecordId,
            name: 'Annual Revenue',
            attribute_type: 'number',
            sort_order: 5,
            options: [],
            constraints: revenueRangeMinConstraint,
        },
        {
            id: 'DfkwfBiyfyCyRHvsHnDiqQ',
            record_id: customerProfileRecordId,
            name: 'Number of Employees',
            attribute_type: 'number',
            sort_order: 6,
            options: [],
            constraints: [],
        },
        {
            id: 'UflxQeBtbrxfofrceJgVaA',
            record_id: customerProfileRecordId,
            name: 'Founded On',
            attribute_type: 'date',
            sort_order: 7,
            options: [],
            constraints: foundedOnRangeMaxConstraint,
        },
        {
            id: 'nHzjBAeemLwpexXjdPBZHQ',
            record_id: customerProfileRecordId,
            name: 'Company Logo',
            attribute_type: 'text',
            sort_order: 8,
            options: [],
            constraints: [],
        },
        {
            id: 'zCttybnQPmYzJGmvOxWwBQ',
            record_id: customerProfileRecordId,
            name: 'Supporting Documents',
            attribute_type: 'text',
            sort_order: 9,
            options: [],
            constraints: [],
        },
        {
            id: 'ElVKgkCreTEHQXJZPBJDKw',
            record_id: customerProfileRecordId,
            name: 'Reviewer Notes',
            attribute_type: 'text',
            sort_order: 10,
            options: [],
            constraints: [],
        },
        {
            id: 'ptlpsUrQssxuTLkouUAnNw',
            record_id: projectBriefRecordId,
            name: 'Project Name',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
        },
        {
            id: 'pwQZmLdIOBjDnVpDmmujbw',
            record_id: projectBriefRecordId,
            name: 'Description',
            attribute_type: 'text',
            sort_order: 2,
            options: [],
            constraints: [],
        },
        {
            id: 'pwjGSoPQMbsjmEJLDAgbaA',
            record_id: projectBriefRecordId,
            name: 'Priority',
            attribute_type: 'select',
            sort_order: 3,
            options: [
                'Low',
                'Medium',
                'High',
                'Critical',
            ],
            constraints: [],
        },
        {
            id: 'qDgLYtdgNBjEEoPqCoMATg',
            record_id: projectBriefRecordId,
            name: 'Approved',
            attribute_type: 'checkbox',
            sort_order: 4,
            options: [],
            constraints: [],
        },
    ];
}
