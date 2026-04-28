import {
    createLocalStorageAdapter,
} from '../../../api/db-localstorage.ts';
import { initApi, GET } from '../../../api/api.ts';

export async function initAdapter(
): Promise<boolean> {
    const adapter =
        await createLocalStorageAdapter();
    await adapter.initialize();
    initApi(adapter);
    const schema =
        await GET<string | null>(
            'snapshots/schema',
        );
    return schema !== null;
}
