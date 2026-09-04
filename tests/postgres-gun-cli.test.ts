import {
    assertMatch,
    assertNotMatch,
    assertStrictEquals,
} from '@std/assert';
import { existsSync } from '@std/fs';
import { join } from '@std/path';

type GunResult = {
    readonly status: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly dockerStamp: string;
    readonly renderStamp: string;
};

function pathWithStubs(
    dockerStamp: string,
    renderStamp: string,
): string {
    const dir = Deno.makeTempDirSync({
        prefix: 'fusion-gun-stub-',
    });
    Deno.writeTextFileSync(
        join(dir, 'docker'),
        '#!/bin/bash\n'
        + `printf x >> "${dockerStamp}"\n`
        + 'exit 99\n',
        { mode: 0o755 },
    );
    Deno.writeTextFileSync(
        join(dir, 'render'),
        '#!/bin/bash\n'
        + `printf x >> "${renderStamp}"\n`
        + 'exit 99\n',
        { mode: 0o755 },
    );
    // Deno.Command's env MERGES onto the ambient
    // environment (it does not replace it), so only
    // the PATH override needs to be named here.
    return `${dir}:${Deno.env.get('PATH') ?? ''}`;
}

function stamped(stamp: string): boolean {
    return existsSync(stamp)
        && Deno.readTextFileSync(stamp).length > 0;
}

async function runGun(
    script: string,
    args: string[],
): Promise<GunResult> {
    const dockerStamp = join(
        Deno.makeTempDirSync({
            prefix: 'fusion-docker-stamp-',
        }),
        'called',
    );
    const renderStamp = join(
        Deno.makeTempDirSync({
            prefix: 'fusion-render-stamp-',
        }),
        'called',
    );
    // POSTGRES_URL and JWT_HMAC_SIGNING_KEY are
    // blanked deliberately: ./test exports the
    // latter ambiently, and a merge would leak it.
    // signal only bounds the async output().
    const output = await new Deno.Command(script, {
        args,
        signal: AbortSignal.timeout(4000),
        env: {
            PATH: pathWithStubs(
                dockerStamp,
                renderStamp,
            ),
            POSTGRES_URL: '',
            JWT_HMAC_SIGNING_KEY: '',
        },
    }).output();
    const decoder = new TextDecoder();
    return {
        status: output.code,
        stdout: decoder.decode(output.stdout),
        stderr: decoder.decode(output.stderr),
        dockerStamp,
        renderStamp,
    };
}

Deno.test('wipe compose target exits 1 with usage',
async () => {
    const result = await runGun(
        './bin/postgres-wipe',
        ['--postgres', 'compose'],
    );
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage:/);
    assertStrictEquals(
        stamped(result.dockerStamp),
        false,
    );
    assertStrictEquals(
        stamped(result.renderStamp),
        false,
    );
});

Deno.test('seed compose target exits 1 with usage',
async () => {
    const result = await runGun(
        './bin/postgres-seed',
        ['--postgres', 'compose', '--mock-data'],
    );
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage:/);
    assertStrictEquals(
        stamped(result.dockerStamp),
        false,
    );
    assertStrictEquals(
        stamped(result.renderStamp),
        false,
    );
});

Deno.test('wipe local with TOKEN exits 1',
async () => {
    const result = await runGun(
        './bin/postgres-wipe',
        ['--postgres', 'local', 'TOKEN'],
    );
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage:/);
    assertStrictEquals(
        stamped(result.dockerStamp),
        false,
    );
    assertStrictEquals(
        stamped(result.renderStamp),
        false,
    );
});

Deno.test('seed missing mode exits 1 with usage',
async () => {
    const result = await runGun(
        './bin/postgres-seed',
        ['--postgres', 'local'],
    );
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage:/);
    assertStrictEquals(
        stamped(result.dockerStamp),
        false,
    );
    assertStrictEquals(
        stamped(result.renderStamp),
        false,
    );
});

Deno.test('wipe --help exits 0', async () => {
    const result = await runGun(
        './bin/postgres-wipe',
        ['--help'],
    );
    assertStrictEquals(result.status, 0);
    assertMatch(result.stdout, /Usage:/);
    assertStrictEquals(
        stamped(result.dockerStamp),
        false,
    );
    assertStrictEquals(
        stamped(result.renderStamp),
        false,
    );
});

Deno.test('seed --help exits 0', async () => {
    const result = await runGun(
        './bin/postgres-seed',
        ['--help'],
    );
    assertStrictEquals(result.status, 0);
    assertMatch(result.stdout, /Usage:/);
    assertStrictEquals(
        stamped(result.dockerStamp),
        false,
    );
    assertStrictEquals(
        stamped(result.renderStamp),
        false,
    );
});

Deno.test('wipe source local path is compose run',
() => {
    const src = Deno.readTextFileSync(
        'bin/postgres-wipe',
    );
    assertMatch(src, /docker compose/);
    assertMatch(src, /run --rm wipe/);
    assertNotMatch(src, /deno run/);
    assertNotMatch(src, /--postgres compose/);
});

Deno.test('seed source local path is compose run',
() => {
    const src = Deno.readTextFileSync(
        'bin/postgres-seed',
    );
    assertMatch(src, /docker compose/);
    assertMatch(src, /run --rm seed/);
    assertNotMatch(src, /deno run/);
    assertNotMatch(src, /--postgres compose/);
});

Deno.test('gun source render path is the CLI',
() => {
    const lib = Deno.readTextFileSync(
        'bin/postgres-lib',
    );
    const wipe = Deno.readTextFileSync(
        'bin/postgres-wipe',
    );
    const seed = Deno.readTextFileSync(
        'bin/postgres-seed',
    );
    const src = `${lib}\n${wipe}\n${seed}`;
    assertMatch(src, /render jobs create/);
    assertMatch(src, /render jobs list/);
    assertMatch(src, /render logs/);
    assertMatch(src, /command -v render/);
    assertNotMatch(src, /http_json/);
    assertNotMatch(src, /api\.render\.com/);
    assertNotMatch(src, /jobs get "/);
});
