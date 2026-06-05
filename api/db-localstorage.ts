import { BackedDbAdapter } from './db-backed.ts';
import { LocalStorageBackend }
    from './backend-localstorage.ts';
import {
    simulateNetworkLatency,
    DEFAULT_LATENCY_CONFIG,
} from './latency.ts';

// localStorage-backed adapter — the demo persistence tier
// before IndexedDB. A real network-latency shim; no async
// connection to open. A construction preset over
// BackedDbAdapter.
export class LocalStorageDbAdapter extends BackedDbAdapter {
    constructor() {
        super(
            new LocalStorageBackend(),
            () => simulateNetworkLatency(
                DEFAULT_LATENCY_CONFIG,
            ),
            async () => {},
        );
    }
}
