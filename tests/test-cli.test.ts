import {
    assert,
    assertMatch,
    assertNotMatch,
    assertStrictEquals,
} from '@std/assert';
import { join } from '@std/path';

function headSha(): string {
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

async function runTest(
    args: string[],
    env: Record<string, string> = {},
): Promise<{
    readonly status: number;
    readonly stdout: string;
    readonly stderr: string;
}> {
    const output = await new Deno.Command('./test', {
        args,
        signal: AbortSignal.timeout(4000),
        env: {
            POSTGRES_URL: '',
            JWT_HMAC_SIGNING_KEY: '',
            ...env,
        },
    }).output();
    const decoder = new TextDecoder();
    return {
        status: output.code,
        stdout: decoder.decode(output.stdout),
        stderr: decoder.decode(output.stderr),
    };
}

Deno.test('test unknown suite exits 1 with usage',
async () => {
    const result = await runTest(['bogus']);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/test/);
});

Deno.test('test validate skips when HEAD already passed',
async () => {
    const stamp = join(
        Deno.makeTempDirSync({
            prefix: 'most-recently-validated-sha-',
        }),
        'most-recently-validated-sha',
    );
    Deno.writeTextFileSync(stamp, `${headSha()}\n`);
    const result = await runTest(['validate'], {
        MOST_RECENTLY_VALIDATED_SHA_PATH: stamp,
        WORKING_TREE_PORCELAIN: '',
    });
    assertStrictEquals(result.status, 0);
    assertMatch(
        result.stdout,
        /already validated [0-9a-f]{40}/,
    );
});

Deno.test('test memory does not SHA-skip', () => {
    const src = Deno.readTextFileSync('test');
    const skipAt = src.indexOf('already validated');
    const memoryAt = src.indexOf('run_memory()');
    assert(skipAt >= 0, 'skip message missing');
    assert(memoryAt >= 0, 'run_memory missing');
    assert(
        src.includes('MOST_RECENTLY_VALIDATED_SHA_PATH'),
    );
    assertNotMatch(
        src,
        /VALIDATE_OK|validate-ok/,
    );
});

Deno.test('test dispatcher names combinations', () => {
    const src = Deno.readTextFileSync('test');
    assertMatch(src, /validate browser/);
    assertNotMatch(src, /VALIDATE_OK/);
    assertNotMatch(src, /validate-ok/);
});

Deno.test(
    'test validate skip returns so combinations continue',
() => {
    const src = Deno.readTextFileSync('test');
    const skipAt = src.indexOf('already validated');
    assert(skipAt >= 0, 'skip message missing');
    const skipEnd = src.indexOf('\n    fi', skipAt);
    assert(skipEnd > skipAt, 'skip branch unclosed');
    const skipBranch = src.slice(skipAt, skipEnd);
    assertMatch(skipBranch, /\breturn\b/);
    assertNotMatch(skipBranch, /exit 0/);

    const comboAt = src.indexOf('"$1" = "browser"');
    assert(comboAt >= 0, 'browser combination missing');
    const comboEnd = src.indexOf('elif', comboAt + 1);
    assert(comboEnd > comboAt, 'browser combo unclosed');
    const combo = src.slice(comboAt, comboEnd);
    const runAt = combo.indexOf('run_validate');
    const execAt = combo.indexOf('bin/test-browser');
    assert(runAt >= 0, 'run_validate missing in combo');
    assert(execAt >= 0, 'test-browser exec missing');
    assert(
        runAt < execAt,
        'browser exec before run_validate',
    );
});

Deno.test('test-postgres mints PORT for compose parse',
() => {
    const src = Deno.readTextFileSync('bin/test-postgres');
    assertMatch(src, /export JWT_HMAC_SIGNING_KEY/);
    assertMatch(src, /export POSTGRES_PASSWORD/);
    assertNotMatch(src, /\$\{PORT:-/);
    const inline = /export PORT=/.test(src);
    const assign = /PORT=/.test(src)
        && /export PORT\b/.test(src);
    assert(
        inline || assign,
        'bin/test-postgres must export PORT',
    );
});
