import {
    assert,
    assertMatch,
    assertNotMatch,
    assertStrictEquals,
} from '@std/assert';
import { existsSync } from '@std/fs';
import { join } from '@std/path';

type CrankResult = {
    readonly status: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly stamp: string;
};

function pathWithDockerStub(stamp: string): string {
    const dir = Deno.makeTempDirSync({
        prefix: 'fusion-docker-stub-',
    });
    Deno.writeTextFileSync(
        join(dir, 'docker'),
        '#!/bin/bash\n'
        + `printf x >> "${stamp}"\n`
        + 'exit 99\n',
        { mode: 0o755 },
    );
    // Deno.Command's env MERGES onto the ambient
    // environment (it does not replace it), so only the
    // PATH override needs to be named here.
    return `${dir}:${Deno.env.get('PATH') ?? ''}`;
}

async function runCrank(
    args: string[],
): Promise<CrankResult> {
    const stamp = join(
        Deno.makeTempDirSync({ prefix: 'fusion-stamp-' }),
        'called',
    );
    // signal only bounds the async output() — the sync
    // outputSync() ignores it and blocks regardless.
    // POSTGRES_URL and JWT_HMAC_SIGNING_KEY are blanked
    // deliberately: Node's spawnSync REPLACED the child env
    // with exactly {PATH, HOME, TMPDIR}, so ./crank never
    // saw either var regardless of the ambient shell.
    // Deno.Command MERGES, and ./test exports
    // JWT_HMAC_SIGNING_KEY ambiently, so omitting this would
    // leak it into a child the original deliberately
    // starved. No case below reaches ./crank past its
    // argument parsing (each exits on a usage error or
    // --help, before line 85 of ./crank mints these), so no
    // current assertion depends on the blank — kept anyway
    // for parity with the original isolation.
    const output = await new Deno.Command('./crank', {
        args,
        signal: AbortSignal.timeout(4000),
        env: {
            PATH: pathWithDockerStub(stamp),
            POSTGRES_URL: '',
            JWT_HMAC_SIGNING_KEY: '',
        },
    }).output();
    const decoder = new TextDecoder();
    return {
        status: output.code,
        stdout: decoder.decode(output.stdout),
        stderr: decoder.decode(output.stderr),
        stamp,
    };
}

function dockerCalled(stamp: string): boolean {
    return existsSync(stamp)
        && Deno.readTextFileSync(stamp).length > 0;
}

Deno.test('crank with no args exits 1 with usage',
async () => {
    const result = await runCrank([]);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/crank/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('crank missing port exits 1 with usage',
async () => {
    const result = await runCrank(['--mock-data']);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/crank/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('crank missing mode exits 1 with usage',
async () => {
    const result = await runCrank(['8080']);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/crank/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('crank two modes exits 1 with usage',
async () => {
    const result = await runCrank([
        '--mock-data',
        '--bootstrap',
        '8080',
    ]);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/crank/);
    assertMatch(result.stderr, /exclusive/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('crank unknown flag exits 1 with usage',
async () => {
    const result = await runCrank(['--bogus', '8080']);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/crank/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('crank --help exits 0', async () => {
    const result = await runCrank(['--help']);
    assertStrictEquals(result.status, 0);
    assertMatch(result.stdout, /Usage: \.\/crank/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('crank source owns the local stack', () => {
    const src = Deno.readTextFileSync('crank');
    assertMatch(src, /\.\/validate/);
    assertMatch(
        src,
        /docker compose up -d --wait postgres/,
    );
    assertMatch(src, /\.\/test-postgres/);
    assertMatch(src, /\.\/build --no-zip/);
    assertMatch(
        src,
        /\.\/postgres-wipe --postgres local/,
    );
    assertMatch(
        src,
        /\.\/postgres-seed --postgres local/,
    );
    assertMatch(src, /\.\/serve /);
    assertNotMatch(
        src,
        /docker compose up -d --wait["\n]*$/,
    );
    assertNotMatch(src, /echo \$POSTGRES_URL/);
    assertNotMatch(
        src,
        /echo \$POSTGRES_PASSWORD/,
    );
    assertNotMatch(
        src,
        /echo \$JWT_HMAC_SIGNING_KEY/,
    );
    const trapAt = src.indexOf('trap ');
    const upAt = src.indexOf(
        'docker compose up -d --wait postgres',
    );
    assert(trapAt >= 0, 'trap missing');
    assert(upAt >= 0, 'compose up missing');
    assert(trapAt < upAt, 'trap after Docker');
});
