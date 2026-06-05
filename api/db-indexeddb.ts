import { BackedDbAdapter } from './db-backed.ts';
import { IndexedDbBackend } from './backend-indexeddb.ts';
import {
    simulateNetworkLatency,
    DEFAULT_LATENCY_CONFIG,
} from './latency.ts';

// The IndexedDB-backed adapter — the persistence tier. Store
// wiring is synchronous (the constructor), so getDbAdapter()
// stays sync; the IDB connection opens in initialize(), which
// boot awaits before any store op. `post` is the cross-tab
// hook: the backend calls it with the touched tables after a
// readwrite commit so other tabs can refresh.
export class IndexedDbDbAdapter extends BackedDbAdapter {
    constructor(
        post?: (tables: readonly string[]) => void,
    ) {
        const backend = new IndexedDbBackend(post);
        super(
            backend,
            () => simulateNetworkLatency(
                DEFAULT_LATENCY_CONFIG,
            ),
            () => backend.open(),
        );
    }
}
