import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import './in-page-facade.ts';
import {
    type RequestContext,
} from '../client/shared.ts';
import { inPageContext } from './in-page-facade.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

// The canonical admin-session bootstrap: a fresh in-memory
// db carrying schema + root admin, and a request context
// bearing an org-scoped token. One home for the idiom the adapter
// suites repeat — seed further rows on `db` after the call.
export async function adminContext(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const ctx = inPageContext(
        db, await organizationToken(),
    );
    return { db, ctx };
}
