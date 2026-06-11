import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

// The canonical admin-session bootstrap: a fresh in-memory
// db carrying schema + root admin, and a request context
// bearing the dev token. One home for the idiom the adapter
// suites repeat — seed further rows on `db` after the call.
export async function adminContext(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    const ctx = createRequestContext(
        db, await devToken(),
    );
    return { db, ctx };
}
