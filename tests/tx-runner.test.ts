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
        await backend.ensureTable();
        const run = backendRunner(backend);
        await run('readwrite',
            tx => tx.append<Row>({ id: 'a', n: 1 }),
        );
        const got = await run('readonly',
            tx => tx.getById<Row>('a'),
        );
        assertStrictEquals(got!.n, 1);
    },
);

Deno.test(
    'ambientRunner joins the open tx, ignoring its mode',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTable();
        await backend.transaction('readwrite',
            async (outer) => {
                const join = ambientRunner(outer);
                // The declared 'readonly' mode is ignored:
                // the outer tx is readwrite, so the put
                // succeeds against the very same handle.
                await join('readonly',
                    (inner) => {
                        assertStrictEquals(inner, outer);
                        return inner.append<Row>({
                            id: 'a', n: 9,
                        });
                    },
                );
            },
        );
        const got = await backend.transaction('readonly',
            tx => tx.getById<Row>('a'),
        );
        assertStrictEquals(got!.n, 9);
    },
);
