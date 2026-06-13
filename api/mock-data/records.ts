import type {
    RecordEntity,
    RecordAttributeEntity,
    Constraint,
} from '../types.ts';
import { jsonArrayField } from '../types.ts';

// The seeded Records and their stable ids. The id consts are
// shared with the record attributes, flow-record bindings, and
// record state events, so they are exported. Fixed data; the
// composition root assigns organization_id at write time.
export const customerProfileRecordId =
    'rec01CustProfRec0rdAB1';
export const projectBriefRecordId =
    'rec02Pr0jBriefRec0rd02';

export function buildRecords():
    Omit<RecordEntity, 'organization_id'>[] {
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
                + ' the Fusion Flow.',
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
            id: '5JZ0LeKdPCa4QMtg1RsF1M',
            record_id: customerProfileRecordId,
            name: 'Company Name',
            attribute_type: 'text',
            sort_order: 1,
            options: jsonArrayField([]),
            constraints: jsonArrayField([]),
        },
        {
            id: 'nplTIh0qXNtAyoWSwRaBYe',
            record_id: customerProfileRecordId,
            name: 'Contact Email',
            attribute_type: 'text',
            sort_order: 2,
            options: jsonArrayField([]),
            constraints: jsonArrayField(
                emailRegexConstraint,
            ),
        },
        {
            id: 'kzHpMw9f1thq79VoBYeIX3',
            record_id: customerProfileRecordId,
            name: 'Contact Phone',
            attribute_type: 'text',
            sort_order: 3,
            options: jsonArrayField([]),
            constraints: jsonArrayField([]),
        },
        {
            id: 'QsmqiOmPtoMLGpSjHOqdHA',
            record_id: customerProfileRecordId,
            name: 'Industry',
            attribute_type: 'select',
            sort_order: 4,
            options: jsonArrayField([
                'Technology',
                'Finance',
                'Healthcare',
                'Retail',
                'Manufacturing',
            ]),
            constraints: jsonArrayField([]),
        },
        {
            id: '0TyjQRcygn3DIyXTe6x1F6',
            record_id: customerProfileRecordId,
            name: 'Annual Revenue',
            attribute_type: 'number',
            sort_order: 5,
            options: jsonArrayField([]),
            constraints: jsonArrayField(
                revenueRangeMinConstraint,
            ),
        },
        {
            id: '8Z62tcRHBpwCRH1kBffx0G',
            record_id: customerProfileRecordId,
            name: 'Number of Employees',
            attribute_type: 'number',
            sort_order: 6,
            options: jsonArrayField([]),
            constraints: jsonArrayField([]),
        },
        {
            id: 'aR8nKpQ9wEzVxL3CmBdYTf',
            record_id: customerProfileRecordId,
            name: 'Founded On',
            attribute_type: 'date',
            sort_order: 7,
            options: jsonArrayField([]),
            constraints: jsonArrayField(
                foundedOnRangeMaxConstraint,
            ),
        },
        {
            id: 'mBrOOvQtZTTKb5TTnXvzXo',
            record_id: customerProfileRecordId,
            name: 'Company Logo',
            attribute_type: 'text',
            sort_order: 8,
            options: jsonArrayField([]),
            constraints: jsonArrayField([]),
        },
        {
            id: 'y9DiJ5QHNB5ho3K1n9myMc',
            record_id: customerProfileRecordId,
            name: 'Supporting Documents',
            attribute_type: 'text',
            sort_order: 9,
            options: jsonArrayField([]),
            constraints: jsonArrayField([]),
        },
        {
            id: 'AdQlKf43JV6yrhQbyskDkR',
            record_id: customerProfileRecordId,
            name: 'Reviewer Notes',
            attribute_type: 'text',
            sort_order: 10,
            options: jsonArrayField([]),
            constraints: jsonArrayField([]),
        },
        {
            id: 'pBA01Pr0j3ctBr13fNm3T1',
            record_id: projectBriefRecordId,
            name: 'Project Name',
            attribute_type: 'text',
            sort_order: 1,
            options: jsonArrayField([]),
            constraints: jsonArrayField([]),
        },
        {
            id: 'pBA02Pr0j3ctBr13fDsc02',
            record_id: projectBriefRecordId,
            name: 'Description',
            attribute_type: 'text',
            sort_order: 2,
            options: jsonArrayField([]),
            constraints: jsonArrayField([]),
        },
        {
            id: 'pBA03Pr0j3ctBr13fPry03',
            record_id: projectBriefRecordId,
            name: 'Priority',
            attribute_type: 'select',
            sort_order: 3,
            options: jsonArrayField([
                'Low',
                'Medium',
                'High',
                'Critical',
            ]),
            constraints: jsonArrayField([]),
        },
        {
            id: 'pBA04Pr0j3ctBr13fApr04',
            record_id: projectBriefRecordId,
            name: 'Approved',
            attribute_type: 'checkbox',
            sort_order: 4,
            options: jsonArrayField([]),
            constraints: jsonArrayField([]),
        },
    ];
}
