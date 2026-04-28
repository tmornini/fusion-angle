import {
    createLocalStorageAdapter,
} from '../../../api/db-localstorage.ts';
import { initApi, GET } from '../../../api/api.ts';

const IMPORTING_SENTINEL_KEY =
    'fusion-ai:_importing';

export async function initAdapter(
): Promise<boolean> {
    const adapter =
        await createLocalStorageAdapter();
    await adapter.initialize();
    initApi(adapter);
    // If a previous snapshot import wedged
    // mid-rollback, the sentinel stays set
    // and the database is in indeterminate
    // state. Treat as no-schema so the
    // bootstrap redirects to snapshots and
    // the user can recover.
    if (typeof localStorage !== 'undefined'
        && localStorage.getItem(
            IMPORTING_SENTINEL_KEY,
        ) !== null
    ) {
        return false;
    }
    const schema =
        await GET<string | null>(
            'snapshots/schema',
        );
    return schema !== null;
}
