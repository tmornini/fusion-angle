// The seed beneath the adapter: rehearse the live ops on
// scratch memory, plan the recorded rows by depth, and
// land them in one transaction.

import {
    LEADING_PARAMETERS,
    PARAMETERS_PER_ROW,
} from './ledger-statement-sql.ts';

// The bind limit Postgres allows one statement.
export const POSTGRES_BIND_LIMIT = 65535;

// Half the binds the attempt class leaves, so the seed
// can grow (Decision 1). The ceiling is refused.
export const SEED_ROWS_PER_STATEMENT = Math.floor(
    (POSTGRES_BIND_LIMIT - LEADING_PARAMETERS)
        / 2 / PARAMETERS_PER_ROW,
);
