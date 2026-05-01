import {
    createLocalStorageAdapter,
} from '../../../api/db-localstorage.ts';
import type { DbAdapter } from '../../../api/db.ts';
import { GET } from '../../../api/api.ts';

let adapter: DbAdapter | undefined;

export async function initAdapter(
): Promise<boolean> {
    adapter =
        await createLocalStorageAdapter();
    await adapter.initialize();
    const schema =
        await GET<string | null>(
            adapter, 'snapshots/schema',
        );
    return schema !== null;
}

export function getDbAdapter(): DbAdapter {
    if (!adapter) {
        throw new Error(
            'initAdapter() not called.',
        );
    }
    return adapter;
}
