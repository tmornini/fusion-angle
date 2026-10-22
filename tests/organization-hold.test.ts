import { assertEquals } from '@std/assert';
import { rosterOrganizationsOf } from
    '../api/organization-hold.ts';
import type { StatementBind } from
    '../shared/ledger-statement.ts';
import { generateIdentifier } from '../shared/identifier.ts';

// Both backends derive a roster write's organizations from
// a row's path, name, and method alone; the rest of a bind
// is bytes the derivation never reads.
function rowAt(
    path: string,
    name: string,
    method: string,
): StatementBind {
    return {
        id: generateIdentifier(),
        operationId: generateIdentifier(),
        path,
        name,
        requesterIdentityId: generateIdentifier(),
        method,
        request: new Uint8Array(0),
        requestSalt: new Uint8Array(16),
        requestSecrets: new Uint8Array(0),
        responsePrefix: new Uint8Array(0),
        responseSuffix: new Uint8Array(0),
        responseSalt: new Uint8Array(16),
        responseSecrets: new Uint8Array(0),
        ifMatch: null,
        notify: '',
    };
}

// A program member's document is roster: the flow law reads
// the ai-agents and services families beside the seats, so a
// row under either names its organization from its path.
for (const family of ['ai-agents', 'services']) {
    for (const method of ['PUT', 'DELETE']) {
        Deno.test('a ' + method + ' row under ' + family
        + '/ names its organization', () => {
            const organization = generateIdentifier();
            const row = rowAt(
                '/organizations/' + organization + '/' + family
                    + '/',
                generateIdentifier(),
                method,
            );
            assertEquals(
                rosterOrganizationsOf([row]), [organization],
            );
        });
    }
}

// A flow is what the law judges, not roster.
Deno.test('a PUT row under flows/ names no organization', () => {
    const row = rowAt(
        '/organizations/' + generateIdentifier() + '/flows/',
        generateIdentifier(),
        'PUT',
    );
    assertEquals(rosterOrganizationsOf([row]), []);
});
