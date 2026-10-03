import { assert, assertStrictEquals } from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { deriveIdentityPiiRows } from
    '../api/derive-identity-spine.ts';
import { seededMockDb } from './mock-seed.ts';

// Phase 15 gate 6 parity pins: the re-homes that close
// Author gate 6 for the exit census.
//
// 1. grantInvitation email resolution —
//    deriveIdentityPiiRows email match ≡ identityPii.getAll
// grantClientCredentials client lookup — RETIRED with
// the clients table (rawReadRow + clients store gone;
// registration facet is the sole oracle).

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

// Phase Final Task 2: invitations ROW half stripped — the
// row-plane oracle is retired. pendingInvitationFor is the
// sole pending discovery path (message plane).

Deno.test('deriveIdentityPiiRows resolves grantInvitation email'
+ ' (Phase Final Task 2: identity_pii ROW half stripped —'
+ ' message plane is sole oracle)',
async () => {
    const db = await seededDb();
    const email = 'sarah.chen@company.com';
    const fromPairs = (await deriveIdentityPiiRows(db))
        .find(p => p.email === email);
    assert(fromPairs !== undefined);
    assertStrictEquals(fromPairs!.email, email);
    // Phase Final Stage B: identity spine tables retired.

    // Unknown email: message plane misses.
    const missing = 'nobody@example.invalid';
    assertStrictEquals(
        (await deriveIdentityPiiRows(db))
            .find(p => p.email === missing),
        undefined,
    );
});
