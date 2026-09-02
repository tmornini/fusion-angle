import {
    assertMatch, assertNotMatch,
    assertStrictEquals,
} from '@std/assert';
import { USAGE, dispatch } from '../server/main.ts';

const SITE = new URL('file:///nowhere/site/');

Deno.test('usage names the three verbs', () => {
    assertMatch(USAGE, /serve/);
    assertMatch(USAGE, /seed/);
    assertMatch(USAGE, /wipe/);
});

Deno.test('no verb is exit 2', async () => {
    assertStrictEquals(await dispatch(SITE, []), 2);
});

Deno.test('an unknown verb is exit 2', async () => {
    assertStrictEquals(await dispatch(SITE, ['migrate']), 2);
});

// A boot fault is recorded and exits 1; it no longer
// rejects out of dispatch. Swap Deno.stderr's writeSync
// for one body to read the record back — the writer is
// the sink boot.ts holds, so no fixture can stand in.
async function stderrText(
    body: () => Promise<number>,
): Promise<{ code: number; text: string }> {
    const original = Deno.stderr.writeSync;
    const chunks: string[] = [];
    const install = (writeSync: unknown) => {
        Object.defineProperty(Deno.stderr, 'writeSync', {
            value: writeSync,
            configurable: true,
            writable: true,
        });
    };
    install((bytes: Uint8Array) => {
        chunks.push(new TextDecoder().decode(bytes));
        return bytes.length;
    });
    try {
        return { code: await body(), text: chunks.join('') };
    } finally {
        install(original);
    }
}

Deno.test('serve refuses any option with exit 1',
async () => {
    const result = await stderrText(
        () => dispatch(SITE, ['serve', '--port', '80']),
    );
    assertStrictEquals(result.code, 1);
    assertMatch(result.text, /no arguments/i);
});

// A boot fault whose raw message carries POSTGRES_URL
// whole: postgres.js parses the URL with `new URL`, and
// the TypeError names the string it was handed. The child
// runs ./build's generated entry shape, so this pins the
// compiled binary's path and not a test-only one.
const LEAKY_SECRET = 'never-reaches-the-logs';
const LEAKY_URL =
    `postgres://fusion:${LEAKY_SECRET}@@@bad host/db`;

Deno.test('a failed serve boot redacts POSTGRES_URL',
async () => {
    const program = 'import { dispatch } from '
        + `'${import.meta.resolve('../server/main.ts')}';\n`
        + 'Deno.exit(await dispatch('
        + `new URL('${SITE.href}'), Deno.args));\n`;
    // signal only bounds the async output() — the sync
    // outputSync() ignores it and blocks regardless.
    const result = await new Deno.Command('deno', {
        args: [
            'eval', '--frozen', '--config', 'deno.json',
            '--allow-env', '--allow-net', '--allow-read',
            program, 'serve',
        ],
        signal: AbortSignal.timeout(60_000),
        env: {
            POSTGRES_URL: LEAKY_URL,
            JWT_HMAC_SIGNING_KEY: 'k',
            HTTP_SERVER_PORT: '8099',
        },
    }).output();
    const stderr = new TextDecoder().decode(result.stderr);
    assertStrictEquals(result.code, 1);
    assertMatch(stderr, /"message":"boot failed"/);
    assertNotMatch(stderr, new RegExp(LEAKY_SECRET));
});
