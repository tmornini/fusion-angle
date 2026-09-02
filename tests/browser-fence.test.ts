import { assertMatch, assertNotStrictEquals } from '@std/assert';
import { join } from '@std/path';

// The name is the whole claim: this file is hermetic —
// no `node:` importer in its graph — so it proves only
// that a lone file rejects `process`. It is NOT evidence
// of a fence over `web-app/`, which has none today; the
// restoration oracle lives in TODO.md.
Deno.test('a hermetic file rejects process (TS2591)',
async () => {
    const dir = Deno.makeTempDirSync({ prefix: 'deno-fence-' });
    try {
        const leak = join(dir, 'leak.ts');
        Deno.writeTextFileSync(leak, 'process.exit(0);\n');
        // signal only bounds the async output() — the sync
        // outputSync() ignores it and blocks regardless.
        const result = await new Deno.Command('deno', {
            args: ['check', '--frozen', leak],
            signal: AbortSignal.timeout(60_000),
        }).output();
        const decoder = new TextDecoder();
        const out = decoder.decode(result.stdout)
            + decoder.decode(result.stderr);
        assertNotStrictEquals(result.code, 0);
        assertMatch(out, /TS2591/);
        assertMatch(out, /Cannot find name 'process'/);
    } finally {
        Deno.removeSync(dir, { recursive: true });
    }
});
