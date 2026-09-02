import {
    assert,
    assertMatch,
    assertNotMatch,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import { fromFileUrl, join } from '@std/path';
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

Deno.test(
    '13 hex digits fit signed bigint without the sign bit',
    async () => {
        assertStrictEquals(ADVISORY_KEY_HEX_DIGITS, 13);
        const max13 = 16n ** BigInt(ADVISORY_KEY_HEX_DIGITS)
            - 1n;
        assert(max13 < SIGN_BIT_FLOOR);
        assertStrictEquals(max13, SIGN_BIT_FLOOR - 1n);
        assert(16n ** 14n - 1n >= SIGN_BIT_FLOOR);

        const labels = [
            'fusion.dedup.' + 'a'.repeat(64),
            'fusion.address./organizations/AjdvjuECVZEgZoFajaIEkg/ideas/42',
        ];
        for (const label of labels) {
            const key = await advisoryKey(label);
            assert(key >= 0n);
            assert(key < SIGN_BIT_FLOOR);
        }
    },
);

Deno.test('advisoryKey is the first 13 hex of sha256Hex',
async () => {
    const label = 'fusion.dedup.x';
    const hex = (await sha256Hex(label))
        .slice(0, ADVISORY_KEY_HEX_DIGITS);
    assertStrictEquals(
        await advisoryKey(label),
        BigInt('0x' + hex),
    );
});

Deno.test('advisoryKey hashes UTF-8 label text, not Latin-1',
async () => {
    const label = '€';
    const fromText = await sha256Hex(label);
    const fromBytes = await sha256HexOfBytes(
        Octets.fromLatin1(label).asBytes(),
    );
    assertNotStrictEquals(fromText, fromBytes);
    const key = await advisoryKey(label);
    assertStrictEquals(
        key,
        BigInt(
            '0x'
            + fromText.slice(0, ADVISORY_KEY_HEX_DIGITS),
        ),
    );
    assertNotStrictEquals(
        key,
        BigInt(
            '0x'
            + fromBytes.slice(0, ADVISORY_KEY_HEX_DIGITS),
        ),
    );
});

Deno.test('lock and notify constants stay named', () => {
    assertStrictEquals(FUSION_EVENTS_CHANNEL, 'fusion_events');
    assertStrictEquals(PG_NOTIFY_PAYLOAD_MAX_BYTES, 8000);
    assertStrictEquals(POOL_MAX, 10);
});

Deno.test('notifyPayload emits full when over 8000 bytes',
() => {
    const small = {
        kind: 'scoped' as const,
        organizationIds: ['AjdvjuECVZEgZoFajaIEkg'],
        identityIds: ['XXZruirZyAOoRpNxaDnpSA'],
    };
    assertStrictEquals(
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
    assert(
        new TextEncoder().encode(JSON.stringify(large))
            .length > PG_NOTIFY_PAYLOAD_MAX_BYTES,
    );
    assertStrictEquals(notifyPayload(large), '{"kind":"full"}');
});

const repoRoot = fromFileUrl(
    new URL('..', import.meta.url),
);

Deno.test('postgres notify is issued; server never LISTENs',
() => {
    const postgresPath = join(
        repoRoot, 'api/backend-postgres.ts',
    );
    const postgres = Deno.readTextFileSync(postgresPath);
    assertMatch(postgres, /pg_notify/);
    assertNotMatch(postgres, /\bLISTEN\b/);
    const serverDir = join(repoRoot, 'server');
    const files: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of Deno.readDirSync(dir)) {
            const path = join(dir, entry.name);
            if (entry.isDirectory) {
                walk(path);
            } else if (entry.name.endsWith('.ts')) {
                files.push(path);
            }
        }
    };
    walk(serverDir);
    assert(files.length >= 8);
    for (const path of files) {
        const src = Deno.readTextFileSync(path);
        assertNotMatch(
            src,
            /\bLISTEN\b/,
            path + ' contains LISTEN',
        );
    }
});
