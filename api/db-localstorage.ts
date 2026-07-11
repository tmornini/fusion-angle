import { BackedDbAdapter } from './db-backed.ts';
import { LocalStorageBackend }
    from './backend-localstorage.ts';
import type { GuardedDbAdapter } from './db.ts';
import type { LatencySimulation } from './latency.ts';
import {
    simulateNetworkLatency,
    DEFAULT_LATENCY_CONFIG,
} from './latency.ts';

// localStorage-backed adapter — the demo persistence tier
// before IndexedDB. A real network-latency shim; no async
// connection to open. A construction preset over
// BackedDbAdapter — a factory, not a subclass (matches
// indexedDbAdapter).
export function localStorageDbAdapter(
): GuardedDbAdapter & LatencySimulation {
    return new BackedDbAdapter(
        new LocalStorageBackend(),
        () => simulateNetworkLatency(
            DEFAULT_LATENCY_CONFIG,
        ),
        async () => {},
        () => {},
    );
}

// Call-site type for the factory return. Kept under the
// former class name so type annotations stay stable while
// construction moves to composition.
export type LocalStorageDbAdapter =
    ReturnType<typeof localStorageDbAdapter>;
