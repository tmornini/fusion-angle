import { assertMatch, assertStrictEquals } from '@std/assert';
import { join } from '@std/path';

function headSha(): string {
    // No timeout here, matching the original execSync call
    // (which took none) — so the sync outputSync() form
    // stays exactly right; there is no signal to be inert.
    // Deno.Command still resolves on a non-zero exit rather
    // than rejecting, unlike execSync — check success
    // explicitly or a failed git call reads as an empty SHA.
    const output = new Deno.Command('sh', {
        args: ['-c', 'git rev-parse HEAD'],
    }).outputSync();
    const decoder = new TextDecoder();
    if (!output.success) {
        throw new Error(
            'git rev-parse HEAD failed: '
            + decoder.decode(output.stderr),
        );
    }
    return decoder.decode(output.stdout).trim();
}

Deno.test('validate skips when the HEAD SHA already passed',
    async () => {
    const stamp = join(
        Deno.makeTempDirSync({ prefix: 'validate-ok-' }),
        'validate-ok',
    );
    Deno.writeTextFileSync(stamp, `${headSha()}\n`);
    // Deno.Command's env MERGES onto the ambient
    // environment, so the Node `{ ...process.env, X }`
    // spread is unneeded — only the overlay keys go here.
    // signal only bounds the async output() — the sync
    // outputSync() ignores it and blocks regardless.
    const output = await new Deno.Command('./validate', {
        signal: AbortSignal.timeout(4000),
        env: {
            VALIDATE_OK: stamp,
            VALIDATE_PORCELAIN: '',
        },
    }).output();
    const decoder = new TextDecoder();
    assertStrictEquals(output.code, 0);
    assertMatch(
        decoder.decode(output.stdout),
        /already validated [0-9a-f]{40}/,
    );
});
