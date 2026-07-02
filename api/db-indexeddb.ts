import { BackedDbAdapter } from './db-backed.ts';
import { IndexedDbBackend } from './backend-indexeddb.ts';
import type { GuardedDbAdapter } from './db.ts';
import type { LatencySimulation } from './latency.ts';
import type { NotificationPost } from './notifications.ts';
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
// any store op. `notify` is the Decision 5 cross-tab hook —
// the gate calls it after a write commits so other tabs can
// refresh.
export function indexedDbAdapter(
    notify: NotificationPost,
): GuardedDbAdapter & LatencySimulation {
    const backend = new IndexedDbBackend();
    return new BackedDbAdapter(
        backend,
        () => simulateNetworkLatency(
            DEFAULT_LATENCY_CONFIG,
        ),
        () => backend.open(),
        notify,
    );
}
