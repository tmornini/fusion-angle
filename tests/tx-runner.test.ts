import { assertStrictEquals } from '@std/assert';
import {
    MemoryStorageBackend,
} from '../api/backend-memory.ts';
import { backendRunner, ambientRunner } from '../api/db.ts';

interface Row { id: string; n: number }

Deno.test(
    'backendRunner opens a real backend transaction',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        const run = backendRunner(backend);
        await run(
            ['t'], 'readwrite',
            tx => tx.put<Row>('t', { id: 'a', n: 1 }),
        );
        const got = await run(
            ['t'], 'readonly',
            tx => tx.get<Row>('t', 'a'),
        );
        assertStrictEquals(got!.n, 1);
    },
);

Deno.test(
    'ambientRunner joins the open tx, ignoring its args',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTables(['t']);
        await backend.transaction(
            ['t'], 'readwrite',
            async (outer) => {
                const join = ambientRunner(outer);
                // The declared 'readonly' mode is ignored:
                // the outer tx is readwrite, so the put
                // succeeds against the very same handle.
                await join(
                    ['ignored'], 'readonly',
                    (inner) => {
                        assertStrictEquals(inner, outer);
                        return inner.put<Row>('t', {
                            id: 'a', n: 9,
                        });
                    },
                );
            },
        );
        const got = await backend.transaction(
            ['t'], 'readonly',
            tx => tx.get<Row>('t', 'a'),
        );
        assertStrictEquals(got!.n, 9);
    },
);
