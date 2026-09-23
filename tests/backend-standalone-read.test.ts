import {
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { MemoryStorageBackend }
    from '../api/backend-memory.ts';
import { MissingTableError } from '../api/db.ts';
import { NIL_IDENTIFIER } from
    '../shared/identifier.ts';

interface Row { id: string; n: number }

Deno.test(
    'read before ensureTable throws',
    async () => {
        const backend = new MemoryStorageBackend();
        await assertRejects(
            () => backend.read(
                tx => tx.getAll<Row>(),
            ),
            MissingTableError,
        );
    },
);

Deno.test(
    'read rejects a put',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTable();
        await assertRejects(
            () => backend.read(
                tx => tx.append<Row>(
                    { id: 'a', n: 1 },
                ),
            ),
            Error,
            'readonly',
        );
    },
);

Deno.test(
    'standalone read during an open write sees'
        + ' committed rows, not the buffer',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTable();
        await backend.transaction(
            'readwrite',
            tx => tx.append<Row>(
                { id: 'c', n: 1 },
            ),
        );
        const started = Promise.withResolvers<void>();
        const hold = Promise.withResolvers<void>();
        const write = backend.transaction(
            'readwrite',
            async (tx) => {
                await tx.append<Row>(
                    { id: 'u', n: 2 },
                );
                started.resolve();
                await hold.promise;
            },
        );
        await started.promise;
        const seen = await backend.read(
            tx => tx.getAll<Row>(),
        );
        assertEquals(
            seen.map(r => r.id).sort(),
            [NIL_IDENTIFIER, 'c'],
        );
        hold.resolve();
        await write;
        const after = await backend.read(
            tx => tx.getAll<Row>(),
        );
        assertEquals(
            after.map(r => r.id).sort(),
            [NIL_IDENTIFIER, 'c', 'u'],
        );
    },
);

Deno.test(
    'read handle has no lock methods',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTable();
        await backend.read(async (tx) => {
            assertStrictEquals(
                tx.lockRequest, undefined,
            );
            assertStrictEquals(
                tx.lockDocument, undefined,
            );
            assertStrictEquals(
                tx.lockHead, undefined,
            );
            assertStrictEquals(
                tx.notify, undefined,
            );
        });
    },
);
