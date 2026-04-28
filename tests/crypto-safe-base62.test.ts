import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    generateCryptoSafeBase62,
} from '../web-app/app/adapters/crypto-safe-base62.ts';

const ALPHABET =
    '0123456789abcdefghijklmnopqrstuvwxyz'
    + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALPHABET_SET = new Set(ALPHABET);

test('generateCryptoSafeBase62 returns a 22-char string', () => {
    const id = generateCryptoSafeBase62();
    assert.equal(typeof id, 'string');
    assert.equal(id.length, 22);
});

test(
    'generateCryptoSafeBase62 chars all live in the Base62 alphabet',
    () => {
        for (let i = 0; i < 1000; i++) {
            const id = generateCryptoSafeBase62();
            for (const ch of id) {
                assert.ok(
                    ALPHABET_SET.has(ch),
                    `Char "${ch}" not in alphabet`,
                );
            }
        }
    },
);

test(
    'generateCryptoSafeBase62 yields 10,000 distinct values',
    () => {
        const seen = new Set<string>();
        for (let i = 0; i < 10000; i++) {
            seen.add(generateCryptoSafeBase62());
        }
        assert.equal(seen.size, 10000);
    },
);

test(
    'generateCryptoSafeBase62 distribution is uniform across alphabet',
    () => {
        // 100,000 IDs × 22 chars = 2,200,000 sample chars.
        // Uniform expectation per alphabet position: 35,484.
        // Simple-modulo bias (without rejection sampling)
        // would give first 8 chars ~42,969 (+21%). A 4%
        // tolerance catches that bug while leaving an
        // overwhelming margin for the unbiased distribution
        // (~7.5σ ≈ 3 × 10⁻¹⁴ per-char false-positive rate).
        const counts = new Map<string, number>();
        for (const ch of ALPHABET) counts.set(ch, 0);
        for (let i = 0; i < 100000; i++) {
            const id = generateCryptoSafeBase62();
            for (const ch of id) {
                counts.set(ch, counts.get(ch)! + 1);
            }
        }
        const expected = 2200000 / 62;
        const tolerance = expected * 0.04;
        for (const ch of ALPHABET) {
            const count = counts.get(ch)!;
            assert.ok(
                Math.abs(count - expected) < tolerance,
                `Char "${ch}" appeared ${count} times,`
                + ` expected ~${expected.toFixed(0)}`,
            );
        }
    },
);
