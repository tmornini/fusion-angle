import { assert } from '@std/assert';
import { TABLE_NAMES } from '../api/db.ts';

// Phase Final Stage B: identity_default_organizations
// table retired — message-plane pins live elsewhere.
Deno.test(
    'TABLE_NAMES drops identity_default_organizations',
    () => {
        assert(
            !TABLE_NAMES.includes(
                'identity_default_organizations',
            ),
            'identity_default_organizations still present',
        );
    },
);
