import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    currentDefaultOrgFor,
} from '../api/authorization.ts';
import type {
    IdentityDefaultOrgEntity,
} from '../api/types.ts';

const AT1 = '2026-01-01T00:00:00.000Z';
const AT2 = '2026-02-01T00:00:00.000Z';

function ev(
    id: string,
    identityId: string,
    organizationId: string,
    at: string,
): IdentityDefaultOrgEntity {
    return {
        id,
        identity_id: identityId,
        organization_id: organizationId,
        at,
    };
}

test(
    'currentDefaultOrgFor is null with no event for the identity',
    () => {
        const rows = [ev('d1', 'other', '1', AT1)];
        assert.equal(currentDefaultOrgFor(rows, 'me'), null);
    },
);

test(
    'currentDefaultOrgFor returns the latest event org',
    () => {
        const rows = [
            ev('d1', 'me', '1', AT1),
            ev('d2', 'me', '2', AT2),
        ];
        assert.equal(currentDefaultOrgFor(rows, 'me'), '2');
    },
);

test(
    'currentDefaultOrgFor breaks an at-tie toward later row',
    () => {
        const rows = [
            ev('d1', 'me', '1', AT1),
            ev('d2', 'me', '3', AT1),
        ];
        assert.equal(currentDefaultOrgFor(rows, 'me'), '3');
    },
);

test(
    'currentDefaultOrgFor ignores other identities',
    () => {
        const rows = [
            ev('d1', 'me', '1', AT1),
            ev('d2', 'other', '2', AT2),
        ];
        assert.equal(currentDefaultOrgFor(rows, 'me'), '1');
    },
);
