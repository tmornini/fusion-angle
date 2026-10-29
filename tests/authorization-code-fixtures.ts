import type { DbAdapter } from '../api/db.ts';
import {
    attemptFor,
    formAuthMessagePair,
    formWriteMessagePair,
    runWrite,
} from '../api/message-pair.ts';
import type { AuthMessagePairSeed } from '../api/message-pair.ts';
import { sha256Hex } from '../shared/digest.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { nowUtc } from '../shared/types.ts';

// The authorize pair and the code document a grant reads.
// requestAt is nowUtc: a code expires after 10 minutes.
export async function seedAuthorizationCodeMessagePair(
    db: DbAdapter,
    code: string,
    identityId: string,
    clientId: string,
    extras: { code_challenge?: string } = {},
): Promise<void> {
    const seed: AuthMessagePairSeed = {
        requestAt: nowUtc(),
        headerFields: [],
        method: 'POST',
        pathname: '/authentication/authorize',
        routePattern: 'authentication/authorize',
        routeSegments: ['authentication', 'authorize'],
        pathSegments: ['authentication', 'authorize'],
        bodyBytes: new Uint8Array(),
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    };
    const requestBody: Record<string, unknown> = {
        method: 'password', username: 'seed@example.com',
        password: 'seed-password', client_id: clientId,
    };
    if (extras.code_challenge !== undefined) {
        requestBody.code_challenge = extras.code_challenge;
    }
    const messagePair = await formAuthMessagePair(
        {
            ...seed,
            bodyBytes: new TextEncoder().encode(
                JSON.stringify(requestBody),
            ),
        },
        requestBody, identityId, undefined,
        seed.operationId, seed.requestId,
        [{
            name: 'authentication-info',
            value: 'code="' + code + '"',
        }],
    );
    const codeName = await sha256Hex(code);
    const codeBody: Record<string, unknown> = {
        client_id: clientId,
    };
    if (extras.code_challenge !== undefined) {
        codeBody.code_challenge = extras.code_challenge;
    }
    const codePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/authentication/authorization-codes/'
            + codeName,
        routePattern:
            'authentication/authorization-codes/:hash',
        routeSegments: [
            'authentication',
            'authorization-codes',
            ':hash',
        ],
        pathSegments: [
            'authentication',
            'authorization-codes',
            codeName,
        ],
        headerFields: [],
        body: undefined,
        requesterIdentityId: identityId,
        requestAt: seed.requestAt,
        organization: undefined,
        responseBody: codeBody,
        operationId: seed.operationId,
        requestId: seed.requestId,
        genesis: 'handler',
        emptyRequest: true,
    });
    await runWrite(
        db,
        attemptFor([codePair, messagePair]),
        [codePair, messagePair],
    );
}
