import { assertMatch, assertNotMatch, assertStrictEquals } from '@std/assert';
import { existsSync } from '@std/fs';
import { join } from '@std/path';

type ServeResult = {
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

async function runServe(
    args: string[],
    extraEnv: Record<string, string> = {},
): Promise<ServeResult> {
    const stamp = join(
        Deno.makeTempDirSync({ prefix: 'fusion-stamp-' }),
        'called',
    );
    // POSTGRES_URL and JWT_HMAC_SIGNING_KEY are blanked
    // deliberately: ./test exports the latter ambiently,
    // and a merge (unlike Node's env-replace) would
    // otherwise leak it through.
    // signal only bounds the async output() — the sync
    // outputSync() ignores it and blocks regardless.
    const output = await new Deno.Command('./serve', {
        args,
        signal: AbortSignal.timeout(4000),
        env: {
            PATH: pathWithDockerStub(stamp),
            POSTGRES_URL: '',
            JWT_HMAC_SIGNING_KEY: '',
            ...extraEnv,
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

Deno.test('serve with no args exits 1 with usage',
async () => {
    const result = await runServe([]);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/serve/);
    assertStrictEquals(
        existsSync(result.stamp) &&
            Deno.readTextFileSync(result.stamp)
                .length > 0,
        false,
    );
});

Deno.test('serve missing port exits 1 with usage',
async () => {
    const result = await runServe(['bundle/']);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/serve/);
});

Deno.test('serve dir without trailing slash exits 1',
async () => {
    const result = await runServe(['bundle', '8080']);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/serve/);
});

Deno.test('serve --help exits 0', async () => {
    const result = await runServe(['--help']);
    assertStrictEquals(result.status, 0);
    assertMatch(result.stdout, /Usage: \.\/serve/);
});

Deno.test('serve missing POSTGRES_URL exits 1',
async () => {
    const result = await runServe(['bundle/', '8080']);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /POSTGRES_URL/);
});

Deno.test('serve missing JWT exits 1', async () => {
    const result = await runServe(['bundle/', '8080'], {
        POSTGRES_URL: 'postgres://fusion@127.0.0.1/x',
    });
    assertStrictEquals(result.status, 1);
    assertMatch(
        result.stderr,
        /JWT_HMAC_SIGNING_KEY/,
    );
});

Deno.test('serve does not invoke ./build', () => {
    const src = Deno.readTextFileSync('serve');
    assertNotMatch(src, /\.\/build/);
    assertMatch(src, /exec \.\/fusion-angle serve/);
    assertNotMatch(src, /DEFAULT_PORT/);
    assertNotMatch(src, /mktemp/);
});
