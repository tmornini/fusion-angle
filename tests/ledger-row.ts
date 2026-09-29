// Hand-built rows. Digests come from the pair-root
// twin so a fixture cannot store a decorative hash.

import type { MessagePairEntity } from '../shared/types.ts';
import { Octets } from
    '../shared/http-message/octets.ts';
import {
    isIdentifier,
    NIL_IDENTIFIER,
    uuidTextOfIdentifier,
} from '../shared/identifier.ts';
import {
    leafHashHex,
    pairRootHex,
    secretsHashHex,
} from '../shared/pair-root.ts';

const ZERO_SALT = '00'.repeat(16);

export type LedgerSeed = {
    readonly id: string,
    readonly path: string,
    readonly name: string,
    readonly requester_identity_id: string,
    readonly method: string,
    readonly response_at: string,
    readonly request: string,
    readonly response: string,
    readonly operation_id: string,
    readonly supersedes?: string,
    readonly request_secrets?: string,
    readonly response_secrets?: string,
};

function bytesOf(text: string): Uint8Array {
    return Octets.fromLatin1(text).asBytes();
}

function bytesOfHex(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = Number.parseInt(
            hex.slice(i * 2, i * 2 + 2), 16,
        );
    }
    return out;
}

function rootText(id: string): string {
    return isIdentifier(id)
        ? uuidTextOfIdentifier(id)
        : id;
}

export async function requestHashOfStored(row: {
    readonly request: string,
    readonly request_salt: string,
}): Promise<string> {
    return leafHashHex(
        bytesOfHex(row.request_salt),
        bytesOf(row.request),
    );
}

export async function ledgerFields(
    seed: LedgerSeed,
): Promise<Omit<MessagePairEntity, 'id'>> {
    const supersedes = seed.supersedes
        ?? NIL_IDENTIFIER;
    const requestSecrets = seed.request_secrets ?? '';
    const responseSecrets = seed.response_secrets ?? '';
    const requestSalt = ZERO_SALT;
    const responseSalt = ZERO_SALT;
    const requestHash = await leafHashHex(
        bytesOfHex(requestSalt),
        bytesOf(seed.request),
    );
    const requestSecretsHash = await secretsHashHex(
        bytesOf(requestSecrets),
    );
    const responseHash = await leafHashHex(
        bytesOfHex(responseSalt),
        bytesOf(seed.response),
    );
    const responseSecretsHash = await secretsHashHex(
        bytesOf(responseSecrets),
    );
    const pairHash = await pairRootHex({
        id: rootText(seed.id),
        operationId: uuidTextOfIdentifier(
            seed.operation_id,
        ),
        path: seed.path,
        name: seed.name,
        supersedes: uuidTextOfIdentifier(supersedes),
        requesterIdentityId: seed.requester_identity_id,
        method: seed.method,
        responseAt: seed.response_at,
        requestHashHex: requestHash,
        requestSecretsHashHex: requestSecretsHash,
        responseHashHex: responseHash,
        responseSecretsHashHex: responseSecretsHash,
    });
    return {
        operation_id: seed.operation_id,
        path: seed.path,
        name: seed.name,
        supersedes,
        requester_identity_id: seed.requester_identity_id,
        method: seed.method,
        response_at: seed.response_at,
        request: seed.request,
        request_salt: requestSalt,
        request_hash: requestHash,
        request_secrets: requestSecrets,
        request_secrets_hash: requestSecretsHash,
        response: seed.response,
        response_salt: responseSalt,
        response_hash: responseHash,
        response_secrets: responseSecrets,
        response_secrets_hash: responseSecretsHash,
        pair_hash: pairHash,
    };
}
