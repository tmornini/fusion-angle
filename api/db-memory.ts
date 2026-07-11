import { BackedDbAdapter } from './db-backed.ts';
import { MemoryStorageBackend }
    from './backend-memory.ts';
import type { GuardedDbAdapter } from './db.ts';
import type { LatencySimulation } from './latency.ts';

// In-memory adapter for tests and the automated suite: a
// synchronous backend, no latency, and no connection to
// open. A construction preset over BackedDbAdapter — a
// factory, not a subclass (matches indexedDbAdapter).
export function memoryDbAdapter(
): GuardedDbAdapter & LatencySimulation {
    return new BackedDbAdapter(
        new MemoryStorageBackend(),
        async () => {},
        async () => {},
        () => {},
    );
}

// Call-site type for the factory return. Kept under the
// former class name so type annotations stay stable while
// construction moves to composition.
export type MemoryDbAdapter =
    ReturnType<typeof memoryDbAdapter>;
