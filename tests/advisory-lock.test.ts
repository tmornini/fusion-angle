import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    readdirSync,
    readFileSync,
    statSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    sha256Hex,
    sha256HexOfBytes,
} from '../shared/digest.ts';
import { Octets } from
    '../shared/http-message/octets.ts';
import {
    ADVISORY_KEY_HEX_DIGITS,
    FUSION_EVENTS_CHANNEL,
    PG_NOTIFY_PAYLOAD_MAX_BYTES,
    POOL_MAX,
    advisoryKey,
    notifyPayload,
} from '../api/advisory-lock.ts';

const SIGN_BIT_FLOOR = 2n ** 52n;

test(
    '13 hex digits fit signed bigint without the sign bit',
    async () => {
        assert.equal(ADVISORY_KEY_HEX_DIGITS, 13);
        const max13 = 16n ** BigInt(ADVISORY_KEY_HEX_DIGITS)
            - 1n;
        assert.ok(max13 < SIGN_BIT_FLOOR);
        assert.equal(max13, SIGN_BIT_FLOOR - 1n);
        assert.ok(16n ** 14n - 1n >= SIGN_BIT_FLOOR);

        const labels = [
            'fusion.dedup.' + 'a'.repeat(64),
            'fusion.address./organizations/AjdvjuECVZEgZoFajaIEkg/ideas/42',
        ];
        for (const label of labels) {
            const key = await advisoryKey(label);
            assert.ok(key >= 0n);
            assert.ok(key < SIGN_BIT_FLOOR);
        }
    },
);

test('advisoryKey is the first 13 hex of sha256Hex',
async () => {
    const label = 'fusion.dedup.x';
    const hex = (await sha256Hex(label))
        .slice(0, ADVISORY_KEY_HEX_DIGITS);
    assert.equal(
        await advisoryKey(label),
        BigInt('0x' + hex),
    );
});

test('advisoryKey hashes UTF-8 label text, not Latin-1',
async () => {
    const label = '€';
    const fromText = await sha256Hex(label);
    const fromBytes = await sha256HexOfBytes(
        Octets.fromLatin1(label).asBytes(),
    );
    assert.notEqual(fromText, fromBytes);
    const key = await advisoryKey(label);
    assert.equal(
        key,
        BigInt(
            '0x'
            + fromText.slice(0, ADVISORY_KEY_HEX_DIGITS),
        ),
    );
    assert.notEqual(
        key,
        BigInt(
            '0x'
            + fromBytes.slice(0, ADVISORY_KEY_HEX_DIGITS),
        ),
    );
});

test('lock and notify constants stay named', () => {
    assert.equal(FUSION_EVENTS_CHANNEL, 'fusion_events');
    assert.equal(PG_NOTIFY_PAYLOAD_MAX_BYTES, 8000);
    assert.equal(POOL_MAX, 10);
});

test('notifyPayload emits full when over 8000 bytes',
() => {
    const small = {
        kind: 'scoped' as const,
        organizationIds: ['AjdvjuECVZEgZoFajaIEkg'],
        identityIds: ['XXZruirZyAOoRpNxaDnpSA'],
    };
    assert.equal(
        notifyPayload(small),
        JSON.stringify(small),
    );
    const ids = [];
    for (let i = 0; i < 400; i++) {
        ids.push('organization-' + String(i).padStart(8, '0'));
    }
    const large = {
        kind: 'scoped' as const,
        organizationIds: ids,
        identityIds: [],
    };
    assert.ok(
        new TextEncoder().encode(JSON.stringify(large))
            .length > PG_NOTIFY_PAYLOAD_MAX_BYTES,
    );
    assert.equal(notifyPayload(large), '{"kind":"full"}');
});

const repoRoot = fileURLToPath(
    new URL('..', import.meta.url),
);

test('postgres notify is issued; server never LISTENs',
() => {
    const postgresPath = join(
        repoRoot, 'api/backend-postgres.ts',
    );
    const postgres = readFileSync(postgresPath, 'utf8');
    assert.match(postgres, /pg_notify/);
    assert.doesNotMatch(postgres, /\bLISTEN\b/);
    const serverDir = join(repoRoot, 'server');
    const files: string[] = [];
    const walk = (dir: string): void => {
        for (const name of readdirSync(dir)) {
            const path = join(dir, name);
            if (statSync(path).isDirectory()) {
                walk(path);
            } else if (name.endsWith('.ts')) {
                files.push(path);
            }
        }
    };
    walk(serverDir);
    assert.ok(files.length >= 8);
    for (const path of files) {
        const src = readFileSync(path, 'utf8');
        assert.doesNotMatch(
            src,
            /\bLISTEN\b/,
            path + ' contains LISTEN',
        );
    }
});
