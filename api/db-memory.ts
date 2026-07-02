import { BackedDbAdapter } from './db-backed.ts';
import { MemoryStorageBackend }
    from './backend-memory.ts';

// In-memory adapter for tests and the automated suite: a
// synchronous backend, no latency, and no connection to
// open. A construction preset over BackedDbAdapter.
export class MemoryDbAdapter extends BackedDbAdapter {
    constructor() {
        super(
            new MemoryStorageBackend(),
            async () => {},
            async () => {},
            () => {},
        );
    }
}
