import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { TABLE_NAMES } from '../api/db.ts';

// Phase Final Stage B: identity_default_organizations
// table retired — pair-plane pins live elsewhere.
test(
    'TABLE_NAMES drops identity_default_organizations',
    () => {
        assert.ok(
            !TABLE_NAMES.includes(
                'identity_default_organizations',
            ),
            'identity_default_organizations still present',
        );
    },
);
