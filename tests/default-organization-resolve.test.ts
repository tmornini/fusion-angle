import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    currentDefaultOrganizationFor,
} from '../api/authorization.ts';
import type {
    IdentityDefaultOrganizationEntity,
} from '../api/types.ts';

const AT1 = '2026-01-01T00:00:00.000000Z';
const AT2 = '2026-02-01T00:00:00.000000Z';

function ev(
    id: string,
    identityId: string,
    organizationId: string,
    at: string,
): IdentityDefaultOrganizationEntity {
    return {
        id,
        identity_id: identityId,
        organization_id: organizationId,
        at,
    };
}

test(
    'currentDefaultOrganizationFor is null with no event for the identity',
    () => {
        const rows = [ev('d1', 'other', '1', AT1)];
        assert.equal(currentDefaultOrganizationFor(rows, 'me'), null);
    },
);

test(
    'currentDefaultOrganizationFor returns the latest event org',
    () => {
        const rows = [
            ev('d1', 'me', '1', AT1),
            ev('d2', 'me', '2', AT2),
        ];
        assert.equal(currentDefaultOrganizationFor(rows, 'me'), '2');
    },
);

test(
    'currentDefaultOrganizationFor breaks an at-tie toward later row',
    () => {
        const rows = [
            ev('d1', 'me', '1', AT1),
            ev('d2', 'me', '3', AT1),
        ];
        assert.equal(currentDefaultOrganizationFor(rows, 'me'), '3');
    },
);

test(
    'currentDefaultOrganizationFor ignores other identities',
    () => {
        const rows = [
            ev('d1', 'me', '1', AT1),
            ev('d2', 'other', '2', AT2),
        ];
        assert.equal(currentDefaultOrganizationFor(rows, 'me'), '1');
    },
);
