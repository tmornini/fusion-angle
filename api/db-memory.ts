import { BackedDbAdapter } from './db-backed.ts';
import { MemoryStorageBackend }
    from './backend-memory.ts';

// In-memory adapter for tests and the automated suite: a
// synchronous backend, no latency, and no connection to
// open. A construction preset over BackedDbAdapter — a
// factory, not a subclass.
//
// The return type is the class, not
// `GuardedDbAdapter & LatencySimulation`: the class
// declares `messagePairs` concrete, so a test holding one
// keeps `getAll()` as its whole-plane oracle. Every face
// the product passes around still hides it.
export function memoryDbAdapter(): BackedDbAdapter {
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
