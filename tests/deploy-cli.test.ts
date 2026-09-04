import {
    assert,
    assertMatch,
    assertNotMatch,
    assertStrictEquals,
} from '@std/assert';
import { existsSync } from '@std/fs';
import { join } from '@std/path';

type DeployResult = {
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
    // environment (it does not replace it), so only
    // the PATH override needs to be named here.
    return `${dir}:${Deno.env.get('PATH') ?? ''}`;
}

async function runDeploy(
    args: string[],
): Promise<DeployResult> {
    const stamp = join(
        Deno.makeTempDirSync({ prefix: 'fusion-stamp-' }),
        'called',
    );
    // signal only bounds the async output() — the
    // sync outputSync() ignores it and blocks
    // regardless.
    // POSTGRES_URL and JWT_HMAC_SIGNING_KEY are
    // blanked deliberately: Deno.Command MERGES,
    // and ./test exports JWT_HMAC_SIGNING_KEY
    // ambiently, so omitting this would leak it
    // into the child. No case below reaches
    // ./deploy past argument parsing (each exits
    // on a usage error or --help, before minting),
    // so no current assertion depends on the
    // blank — kept for isolation.
    const output = await new Deno.Command('./deploy', {
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

Deno.test('deploy with no args exits 1 with usage',
async () => {
    const result = await runDeploy([]);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/deploy/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('deploy --local without --postgres exits 1',
async () => {
    const result = await runDeploy(['--local', '8080']);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/deploy/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('deploy --postgres without where exits 1',
async () => {
    const result = await runDeploy([
        '--postgres',
        'mock-data',
    ]);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/deploy/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('deploy --local plus --commit exits 1',
async () => {
    const result = await runDeploy([
        '--local',
        '8080',
        '--commit',
        'abc',
    ]);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/deploy/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('deploy --commit plus --postgres exits 1',
async () => {
    const result = await runDeploy([
        '--render',
        'tok',
        '--commit',
        'abc',
        '--postgres',
        'mock-data',
    ]);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/deploy/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('deploy two seed modes exits 1',
async () => {
    const result = await runDeploy([
        '--local',
        '8080',
        '--postgres',
        'mock-data',
        '--postgres',
        'bootstrap',
    ]);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/deploy/);
    assertMatch(result.stderr, /exclusive/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('deploy --postgres local exits 1',
async () => {
    const result = await runDeploy([
        '--local',
        '8080',
        '--postgres',
        'local',
    ]);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/deploy/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('deploy --postgres compose exits 1',
async () => {
    const result = await runDeploy([
        '--local',
        '8080',
        '--postgres',
        'compose',
    ]);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/deploy/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('deploy --postgres render exits 1',
async () => {
    const result = await runDeploy([
        '--local',
        '8080',
        '--postgres',
        'render',
    ]);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/deploy/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('deploy unknown flag exits 1 with usage',
async () => {
    const result = await runDeploy(['--bogus']);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/deploy/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('deploy --help exits 0', async () => {
    const result = await runDeploy(['--help']);
    assertStrictEquals(result.status, 0);
    assertMatch(result.stdout, /Usage: \.\/deploy/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('deploy -h exits 0', async () => {
    const result = await runDeploy(['-h']);
    assertStrictEquals(result.status, 0);
    assertMatch(result.stdout, /Usage: \.\/deploy/);
    assertStrictEquals(dockerCalled(result.stamp), false);
});

Deno.test('deploy source owns the local stack', () => {
    const src = Deno.readTextFileSync('deploy');
    assertMatch(src, /\.\/test validate/);
    assertMatch(src, /\.\/test postgres/);
    assertMatch(src, /\.\/test browser/);
    assertMatch(
        src,
        /docker compose up -d --wait postgres/,
    );
    assertMatch(src, /docker compose build/);
    assertMatch(
        src,
        /bin\/postgres-wipe --postgres local/,
    );
    assertMatch(
        src,
        /bin\/postgres-seed --postgres local/,
    );
    assertMatch(
        src,
        /docker compose up -d --wait server/,
    );
    assertNotMatch(src, /bin\/serve/);
    assertNotMatch(src, /bin\/build --no-zip/);
    assertNotMatch(src, /HTTP_SERVER_PORT/);
    assertNotMatch(src, /echo \$POSTGRES_URL/);
    assertNotMatch(src, /echo \$POSTGRES_PASSWORD/);
    assertNotMatch(src, /echo \$JWT_HMAC_SIGNING_KEY/);
    const trapAt = src.indexOf('trap ');
    const upAt = src.indexOf(
        'docker compose up -d --wait postgres',
    );
    assert(trapAt >= 0, 'trap missing');
    assert(upAt >= 0, 'compose up missing');
    assert(trapAt < upAt, 'trap after Docker');
});

Deno.test('deploy INT TERM traps exit the park', () => {
    const src = Deno.readTextFileSync('deploy');
    assertMatch(src, /trap 'cleanup; exit 130' INT/);
    assertMatch(src, /trap 'cleanup; exit 143' TERM/);
    const intAt = src.indexOf(
        "trap 'cleanup; exit 130' INT",
    );
    const termAt = src.indexOf(
        "trap 'cleanup; exit 143' TERM",
    );
    const parkAt = src.indexOf('while true; do');
    assert(intAt >= 0, 'INT trap missing');
    assert(termAt >= 0, 'TERM trap missing');
    assert(parkAt >= 0, 'park loop missing');
    assert(intAt < parkAt, 'INT trap after park');
    assert(termAt < parkAt, 'TERM trap after park');
});

Deno.test('deploy source render path is the CLI',
() => {
    const src = Deno.readTextFileSync('deploy');
    const lib = Deno.readTextFileSync(
        'bin/postgres-lib',
    );
    const combined = `${src}\n${lib}`;
    assertMatch(
        src,
        /git ls-remote origin refs\/heads\/master/,
    );
    assertMatch(src, /render deploys create/);
    assertMatch(src, /--wait --confirm -o json/);
    assertNotMatch(src, /--clear-cache/);
    assertMatch(combined, /command -v render/);
    assertNotMatch(combined, /http_json/);
});

Deno.test('deploy oracle curls bound their wait',
() => {
    const src = Deno.readTextFileSync('deploy');
    assertMatch(src, /ORACLE_TIMEOUT_SEC=/);
    assertMatch(
        src,
        /--max-time "\$ORACLE_TIMEOUT_SEC"/,
    );
    const curls = [...src.matchAll(/\$\(curl /g)];
    const bounds = [...src.matchAll(
        /--max-time "\$ORACLE_TIMEOUT_SEC"/g,
    )];
    assert(curls.length > 0, 'curl missing');
    assertStrictEquals(curls.length, bounds.length);
});
