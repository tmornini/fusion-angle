import { BackedDbAdapter } from './db-backed.ts';
import { IndexedDbBackend } from './backend-indexeddb.ts';
import type { GuardedDbAdapter } from './db.ts';
import type { LatencySimulation } from './latency.ts';
import {
    simulateNetworkLatency,
    DEFAULT_LATENCY_CONFIG,
} from './latency.ts';

// The IndexedDB-backed adapter — the persistence tier. The
// tier is a composition, not a lineage: backend, latency
// shim, and open hook are the constructor arguments
// BackedDbAdapter already accepts, so a factory expresses
// the preset without subclassing. Store wiring is
// synchronous, so getDbAdapter() stays sync; the IDB
// connection opens in initialize(), which boot awaits before
// any store op. `post` is the cross-tab hook: the backend
// calls it with the touched tables after a readwrite commit
// so other tabs can refresh.
export function indexedDbAdapter(
    post: (tables: readonly string[]) => void,
): GuardedDbAdapter & LatencySimulation {
    const backend = new IndexedDbBackend(post);
    return new BackedDbAdapter(
        backend,
        () => simulateNetworkLatency(
            DEFAULT_LATENCY_CONFIG,
        ),
        () => backend.open(),
    );
}
