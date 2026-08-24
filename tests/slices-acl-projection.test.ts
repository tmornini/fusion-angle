import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import {
    postTestPlanSlices, sliceEntityId,
} from '../api/test-plan-slices.ts';
import { testHashPassword } from './mock-seed.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { claimToken } from './token-fixtures.ts';
import { getRecordAttributesByRecord } from
    '../web-app/app/adapters/record-attributes.ts';
import { getRecord } from
    '../web-app/app/adapters/records.ts';
import { deriveMembershipsForIdentity } from
    '../api/derive-memberships.ts';
import { projectInstanceFields } from
    '../web-app/app/presenters/record-detail.ts';
import { projectClaimRolesForOrganization } from
    '../api/authorization.ts';

test(
    'the R seed gives R21 its member seat and its'
    + ' ACL subject',
    async () => {
        const db = memoryDbAdapter();
        await postTestPlanSlices(
            db, { hashPassword: testHashPassword },
        );
        const organization = sliceEntityId('r-org');
        const memberId = sliceEntityId('r-member');
        const seats =
            await deriveMembershipsForIdentity(
                db, memberId,
            );
        assert.equal(seats.length, 1);
        assert.equal(seats[0]!.type, 'member');
        assert.equal(
            seats[0]!.organization_id, organization,
        );
        const memberRoles = [
            'member:' + organization,
        ];
        const ctx = createRequestContext(
            db,
            await claimToken({
                sub: memberId,
                organization,
                organizations: [organization],
                roles: memberRoles,
            }),
        );
        const recordId =
            sliceEntityId('r-record-review');
        const attributes =
            await getRecordAttributesByRecord(
                ctx, recordId,
            );
        assert.deepEqual(
            attributes.map((a) => a.id),
            [
                sliceEntityId('r-attr-review-notes'),
                sliceEntityId('r-attr-review-limit'),
            ],
        );
        // TEST-PLAN R21 navigates by these names —
        // a rename would pass ./validate and fail
        // only mid-browser-run.
        const record = await getRecord(ctx, recordId);
        assert.equal(record.name, 'Account Review');
        assert.deepEqual(
            attributes.map((a) => a.name),
            ['Owner Notes', 'Credit Limit'],
        );
        const memberFields = projectInstanceFields(
            attributes,
            new Map(),
            projectClaimRolesForOrganization(
                memberRoles, organization,
            ),
        );
        assert.deepEqual(
            memberFields.map((f) => ({
                attributeId: f.attributeId,
                access: f.access,
            })),
            [{
                attributeId: sliceEntityId(
                    'r-attr-review-notes',
                ),
                access: 'readonly',
            }],
        );
        const adminFields = projectInstanceFields(
            attributes,
            new Map(),
            projectClaimRolesForOrganization(
                ['admin:' + organization],
                organization,
            ),
        );
        assert.deepEqual(
            adminFields.map((f) => f.access),
            ['writable', 'writable'],
        );
    },
);
