import {
    assertRejects, assertStrictEquals,
} from '@std/assert';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { MemoryStorageBackend } from
    '../api/backend-memory.ts';
import { writeSeedPair } from '../api/mock-data.ts';
import { formWriteMessagePair } from
    '../api/message-pair.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';

Deno.test(
    'a refused seed row fails the phase and stores nothing',
    async () => {
        const backend = new MemoryStorageBackend();
        const db = new BackedDbAdapter(
            backend,
            async () => {},
            async () => {},
            () => {},
        );
        await db.ensureTable();
        const pair = await formWriteMessagePair({
            method: 'PUT',
            pathname: '/organizations/' + ORGANIZATION
                + '/ideas/42',
            routePattern: 'organizations/:id/ideas/:id',
            routeSegments: [
                'organizations', ':id', 'ideas', ':id',
            ],
            pathSegments: [
                'organizations', ORGANIZATION, 'ideas', '42',
            ],
            headerFields: [],
            body: { title: 'T' },
            requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
            requestAt: '2026-01-01T00:00:00.000000Z',
            organization: ORGANIZATION,
            responseBody: { title: 'T' },
            operationId: generateIdentifier(),
            requestId: generateIdentifier(),
        });
        backend.refuseNextSuccessions(1);
        await assertRejects(
            () => db.backend.transaction(
                'readwrite',
                (tx) => writeSeedPair(
                    db.openClient(tx), pair,
                ),
            ),
            Error,
            'seed statement returned refused',
        );
        const rows = await db.messagePairs.getAll();
        assertStrictEquals(rows.length, 1);
        assertStrictEquals(rows[0]!.path, '/migrations/');
        assertStrictEquals(
            rows.some((row) => row.id === pair.id),
            false,
        );
    },
);
