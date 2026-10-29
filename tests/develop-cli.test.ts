import {
    assert,
    assertEquals,
    assertMatch,
    assertNotMatch,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import { join } from '@std/path';

// bin/develop runs with deno and docker stubbed on PATH.
// Each stub appends one tab-separated line: docker the
// compose project and arguments, deno the environment
// the wrapper handed it and its arguments. Ambient
// values are decoys the fresh path must mint over.
const AMBIENT = 'ambient';

type DevelopRun = {
    readonly code: number;
    readonly signal: Deno.Signal | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly calls: readonly (readonly string[])[];
    readonly sessionEnv: string | undefined;
    readonly settledMain: number | undefined;
};

function writeStub(
    dir: string,
    name: string,
    body: string,
): void {
    Deno.writeTextFileSync(join(dir, name), body, {
        mode: 0o755,
    });
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function decodeChunks(
    chunks: readonly Uint8Array[],
): string {
    let size = 0;
    for (const chunk of chunks) {
        size += chunk.byteLength;
    }
    const all = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        all.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(all);
}

async function collect(
    stream: ReadableStream<Uint8Array>,
    chunks: Uint8Array[],
): Promise<void> {
    const reader = stream.getReader();
    try {
        while (true) {
            const next = await reader.read();
            if (next.done) {
                break;
            }
            if (next.value !== undefined) {
                chunks.push(next.value);
            }
        }
    } finally {
        reader.releaseLock();
    }
}

async function stopChild(
    child: Deno.ChildProcess,
    stderrTask: Promise<void>,
): Promise<void> {
    try {
        child.kill('SIGTERM');
    } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
            throw error;
        }
    }
    await child.status;
    await stderrTask;
}

async function settleFailedReturn(
    child: Deno.ChildProcess,
    log: string,
    before: number,
    stderrTask: Promise<void>,
): Promise<void> {
    const failLimit = Date.now() + 8_000;
    let attempted = false;
    while (Date.now() < failLimit) {
        const text = Deno.readTextFileSync(log);
        if (outdirCount(text) > before) {
            attempted = true;
            break;
        }
        await delay(20);
    }
    if (!attempted) {
        await stopChild(child, stderrTask);
        throw new Error('return did not rebundle');
    }
    const settle = Date.now() + 1_000;
    while (Date.now() < settle) {
        await delay(20);
    }
}

async function waitForRedeploy(
    child: Deno.ChildProcess,
    log: string,
    beforeOutdir: number,
    beforeMain: number,
    stderrChunks: readonly Uint8Array[],
    stderrTask: Promise<void>,
): Promise<void> {
    const limit = Date.now() + 8_000;
    while (Date.now() < limit) {
        const text = Deno.readTextFileSync(log);
        const err = decodeChunks(stderrChunks);
        if (outdirCount(text) > beforeOutdir
            && mainCount(text) > beforeMain
            && err.includes('Redeploying')) {
            return;
        }
        await delay(20);
    }
    await stopChild(child, stderrTask);
    throw new Error('return did not redeploy');
}

function bundleFailure(at: number, log: string): string {
    if (at === 0) {
        return '';
    }
    return 'if [[ "$*" == *--outdir* ]]; then\n'
        + `    count_file="${log}.bundles"\n`
        + '    n=0\n'
        + '    if [ -f "$count_file" ]; then\n'
        + '        n=$(cat "$count_file")\n'
        + '    fi\n'
        + '    n=$((n + 1))\n'
        + '    printf \'%s\\n\' "$n" > "$count_file"\n'
        + `    if [ "$n" -eq ${at} ]; then\n`
        + '        echo \'error: bundle failed\' >&2\n'
        + '        exit 1\n'
        + '    fi\n'
        + 'fi\n';
}

async function runDevelop(
    args: readonly string[],
    options: {
        readonly failOn?: string;
        readonly failBundleAt?: number;
        readonly holdMain?: boolean;
        readonly signal?: Deno.Signal;
        readonly pressReturn?: boolean;
    } = {},
): Promise<DevelopRun> {
    const dir = Deno.makeTempDirSync({
        prefix: 'fusion-develop-',
    });
    const log = join(dir, 'calls.log');
    const sessionDir = join(dir, 'session');
    Deno.mkdirSync(sessionDir);
    const failOn = options.failOn ?? '';
    const failBundleAt = options.failBundleAt ?? 0;
    try {
        writeStub(
            dir,
            'docker',
            '#!/bin/bash\n'
                + 'printf \'docker\\t%s\\t%s\\n\' \\\n'
                + '    "${COMPOSE_PROJECT_NAME-}" "$*" \\\n'
                + `    >> "${log}"\n`
                + 'exit 0\n',
        );
        writeStub(
            dir,
            'deno',
            '#!/bin/bash\n'
                + 'printf \'deno\\t%s\\t%s\\t%s\\t%s\\t%s\\n\' \\\n'
                + '    "${POSTGRES_URL-}" \\\n'
                + '    "${POSTGRES_PASSWORD-}" \\\n'
                + '    "${JWT_HMAC_SIGNING_KEY-}" \\\n'
                + '    "${PORT-}" "$*" \\\n'
                + `    >> "${log}"\n`
                + 'prev=""\n'
                + 'for arg in "$@"; do\n'
                + '    if [ "$prev" = "--outdir" ]; then\n'
                + '        mkdir -p "$arg"\n'
                + '        printf x > "$arg/server-core.js"\n'
                + '    elif [ "$prev" = "-o" ]; then\n'
                + '        mkdir -p "$(dirname "$arg")"\n'
                + '        printf x > "$arg"\n'
                + '    fi\n'
                + '    prev="$arg"\n'
                + 'done\n'
                + (failOn === ''
                    ? ''
                    : `case "$*" in\n`
                        + `    *${failOn}*) exit 1 ;;\n`
                        + 'esac\n')
                + bundleFailure(failBundleAt, log)
                + 'case "$*" in\n'
                + '    *postgres-seed.ts*)\n'
                + '        printf'
                + ' \'demo@example.com\\tsecret\\n\'\n'
                + '        ;;\n'
                + 'esac\n'
                + 'if [[ "$*" == *develop-main.ts* ]];'
                + ' then\n'
                + '    printf \'request-log-line\\n\'\n'
                + 'fi\n'
                + (options.holdMain === true
                    ? 'if [[ "$*" == *develop-main.ts* ]];'
                        + ' then\n'
                        + '    printf \'%s\\n\' \\\n'
                        + '        \'{"message":"listening"}\'\n'
                        + '    trap "exit 0" INT TERM\n'
                        + '    while true; do sleep 0.2; done\n'
                        + 'fi\n'
                    : '')
                + 'exit 0\n',
        );
        const env = {
            PATH: `${dir}:${Deno.env.get('PATH') ?? ''}`,
            POSTGRES_URL: AMBIENT,
            POSTGRES_PASSWORD: AMBIENT,
            JWT_HMAC_SIGNING_KEY: AMBIENT,
            PORT: AMBIENT,
            COMPOSE_PROJECT_NAME: AMBIENT,
            FUSION_DEVELOP_DIR: sessionDir,
            TMPDIR: dir,
        };
        let code = 0;
        let signal: Deno.Signal | null = null;
        let stdoutBytes = new Uint8Array();
        let stderrBytes = new Uint8Array();
        let settledMain: number | undefined;
        if (options.signal !== undefined
            || options.pressReturn === true) {
            const child = new Deno.Command('./bin/develop', {
                args: [...args],
                env,
                stdout: 'piped',
                stderr: 'piped',
                stdin: options.pressReturn === true
                    ? 'piped'
                    : 'null',
            }).spawn();
            const stderrChunks: Uint8Array[] = [];
            const stderrTask = child.stderr === null
                ? Promise.resolve()
                : collect(child.stderr, stderrChunks);
            const deadline = Date.now() + 8_000;
            let seen = false;
            while (Date.now() < deadline) {
                try {
                    const text = Deno.readTextFileSync(log);
                    if (text.includes('develop-main.ts')) {
                        seen = true;
                        break;
                    }
                } catch (error) {
                    if (!(error instanceof Deno.errors.NotFound)) {
                        throw error;
                    }
                }
                await delay(20);
            }
            if (!seen) {
                child.kill('SIGTERM');
                await child.status;
                await stderrTask;
                throw new Error('server did not start');
            }
            if (options.pressReturn === true) {
                const stdin = child.stdin;
                if (stdin === null) {
                    child.kill('SIGTERM');
                    await child.status;
                    await stderrTask;
                    throw new Error('develop has no stdin');
                }
                const beforeText =
                    Deno.readTextFileSync(log);
                const before = outdirCount(beforeText);
                const beforeMain = mainCount(beforeText);
                const writer = stdin.getWriter();
                const encode = new TextEncoder();
                await writer.write(encode.encode('\n'));
                if (options.failBundleAt !== undefined) {
                    await settleFailedReturn(
                        child,
                        log,
                        before,
                        stderrTask,
                    );
                    const mid = Deno.readTextFileSync(log);
                    settledMain = mainCount(mid);
                    await writer.write(encode.encode('\n'));
                    await waitForRedeploy(
                        child,
                        log,
                        before,
                        settledMain,
                        stderrChunks,
                        stderrTask,
                    );
                } else {
                    await waitForRedeploy(
                        child,
                        log,
                        before,
                        beforeMain,
                        stderrChunks,
                        stderrTask,
                    );
                }
                await writer.close();
            }
            try {
                child.kill(options.signal ?? 'SIGINT');
            } catch (error) {
                if (!(error instanceof Deno.errors.NotFound)) {
                    throw error;
                }
            }
            const status = await child.status;
            code = status.code;
            signal = status.signal;
            if (child.stdout !== null) {
                stdoutBytes = new Uint8Array(
                    await new Response(child.stdout)
                        .arrayBuffer(),
                );
            }
            await stderrTask;
            stderrBytes = new TextEncoder().encode(
                decodeChunks(stderrChunks),
            );
        } else {
            const output = await new Deno.Command(
                './bin/develop',
                {
                    args: [...args],
                    signal: AbortSignal.timeout(15_000),
                    env,
                },
            ).output();
            code = output.code;
            signal = output.signal;
            stdoutBytes = output.stdout;
            stderrBytes = output.stderr;
        }
        const decoder = new TextDecoder();
        let calls: (readonly string[])[] = [];
        try {
            calls = Deno.readTextFileSync(log)
                .trimEnd()
                .split('\n')
                .filter((line) => line !== '')
                .map((line) => line.split('\t'));
        } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) {
                throw error;
            }
        }
        let sessionEnv: string | undefined;
        const sessionPath = join(sessionDir, 'session.env');
        try {
            sessionEnv = Deno.readTextFileSync(sessionPath);
        } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) {
                throw error;
            }
        }
        return {
            code,
            signal,
            stdout: decoder.decode(stdoutBytes),
            stderr: decoder.decode(stderrBytes),
            calls,
            sessionEnv,
            settledMain,
        };
    } finally {
        Deno.removeSync(dir, { recursive: true });
    }
}

function dockerCalls(
    run: DevelopRun,
): readonly (readonly string[])[] {
    return run.calls.filter((call) => call[0] === 'docker');
}

function denoArgs(run: DevelopRun): readonly string[] {
    return run.calls
        .filter((call) => call[0] === 'deno')
        .map((call) => call[5] ?? '');
}

function outdirCount(text: string): number {
    return text.split('\n').filter((line) =>
        line.includes('--outdir')).length;
}

function mainCount(text: string): number {
    return text.split('\n').filter((line) =>
        line.includes('develop-main.ts')).length;
}

Deno.test('develop with no args exits 1 with usage',
async () => {
    const run = await runDevelop([]);
    assertStrictEquals(run.code, 1);
    assertMatch(run.stderr, /Usage: \.\/bin\/develop/);
    assertEquals(run.calls, []);
});

Deno.test('develop --help exits 0 with usage',
async () => {
    const run = await runDevelop(['--help']);
    assertStrictEquals(run.code, 0);
    assertMatch(run.stdout, /Usage: \.\/bin\/develop/);
    assertMatch(run.stdout, /Press Return/);
    assertMatch(run.stdout, /Request log/);
    assertMatch(run.stdout, /fusion-develop down/);
    assertMatch(run.stdout, /browser-use/);
    assertMatch(
        run.stdout,
        /After each commit/,
    );
    assertEquals(run.calls, []);
});

Deno.test('develop rejects a port of 0', async () => {
    const run = await runDevelop(['0', '--postgres',
        'mock-data']);
    assertStrictEquals(run.code, 1);
    assertMatch(run.stderr, /Usage: \.\/bin\/develop/);
    assertEquals(run.calls, []);
});

Deno.test('develop rejects a port above 65535',
async () => {
    const run = await runDevelop(['65536']);
    assertStrictEquals(run.code, 1);
    assertEquals(run.calls, []);
});

Deno.test('develop rejects an unknown seed mode',
async () => {
    const run = await runDevelop(['8080', '--postgres',
        'nope']);
    assertStrictEquals(run.code, 1);
    assertMatch(run.stderr, /mock-data or bootstrap/);
    assertEquals(run.calls, []);
});

Deno.test(
    'a down database is created, seeded, and served',
    async () => {
        const run = await runDevelop(
            ['8080', '--postgres', 'mock-data'],
        );
        assertStrictEquals(run.code, 0);
        assertEquals(
            dockerCalls(run).map((call) => call[2]),
            [
                'compose down --remove-orphans',
                'compose up -d --wait postgres',
                'compose down --remove-orphans',
            ],
        );
        for (const call of dockerCalls(run)) {
            assertStrictEquals(call[1], 'fusion-develop');
        }
        const seed = run.calls.find((call) =>
            (call[5] ?? '').includes('postgres-seed.ts'));
        assert(seed !== undefined);
        assertMatch(seed[5] ?? '', /--mock-data/);
        assertMatch(seed[2] ?? '', /^[0-9a-f]{32}$/);
        assertStrictEquals(
            seed[1],
            `postgres://fusion:${seed[2]}@127.0.0.1:5432/fusion`,
        );
        assertNotStrictEquals(seed[2], AMBIENT);
        assertMatch(seed[3] ?? '', /^[0-9a-f]{64}$/);
        assertStrictEquals(seed[4], '8080');
        const args = denoArgs(run);
        assert(args.some((line) =>
            line.includes('server/develop-main.ts')));
        assertStrictEquals(run.sessionEnv, undefined);
        assert(!run.stdout.includes(seed[2] ?? ''));
        assert(!run.stderr.includes(seed[2] ?? ''));
        const urlAt = run.stdout.indexOf(
            'http://localhost:8080/',
        );
        const signInAt = run.stdout.indexOf(
            'demo@example.com\tsecret',
        );
        assert(urlAt !== -1);
        assert(signInAt > urlAt);
        assertMatch(
            run.stdout,
            /Request log: \/\S+\/requests\.log/,
        );
        assertNotMatch(run.stdout, /request-log-line/);
    },
);

Deno.test('a down database can be bootstrapped',
async () => {
    const run = await runDevelop(
        ['8080', '--postgres', 'bootstrap'],
    );
    assertStrictEquals(run.code, 0);
    const args = denoArgs(run);
    assert(args.some((line) =>
        line.includes('postgres-seed.ts')
        && line.includes('--bootstrap')));
});

Deno.test(
    'a down database without --postgres does not start',
    async () => {
        const run = await runDevelop(['8080']);
        assertStrictEquals(run.code, 1);
        assertMatch(run.stderr, /--postgres/);
        assertEquals(dockerCalls(run), []);
        assert(denoArgs(run).every((line) =>
            !line.includes('postgres-seed.ts')));
    },
);

Deno.test('a failed seed takes the new database down',
async () => {
    const run = await runDevelop(
        ['8080', '--postgres', 'mock-data'],
        { failOn: 'postgres-seed.ts' },
    );
    assertStrictEquals(run.code, 1);
    assertEquals(
        dockerCalls(run).map((call) => call[2]),
        [
            'compose down --remove-orphans',
            'compose up -d --wait postgres',
            'compose down --remove-orphans',
        ],
    );
    assert(denoArgs(run).every((line) =>
        !line.includes('develop-main.ts')));
    assertNotMatch(run.stdout, /localhost/);
});

Deno.test('ctrl-c takes the develop stack down',
async () => {
    const run = await runDevelop(
        ['8080', '--postgres', 'mock-data'],
        { holdMain: true, signal: 'SIGINT' },
    );
    assert(
        run.code === 130 || run.signal === 'SIGINT',
    );
    assertEquals(
        dockerCalls(run).map((call) => call[2]),
        [
            'compose down --remove-orphans',
            'compose up -d --wait postgres',
            'compose down --remove-orphans',
        ],
    );
    assertStrictEquals(run.sessionEnv, undefined);
});

Deno.test('develop does not compile or build an image',
() => {
    const src = Deno.readTextFileSync('bin/develop');
    assertNotMatch(src, /deno compile/);
    assertNotMatch(src, /\.\/bin\/build/);
    assertNotMatch(src, /compose build/);
    assertMatch(src, /bundle_client/);
    assertMatch(src, /server\/develop-main\.ts/);
    assertNotMatch(src, /server\/develop-watch\.ts/);
    const trapAt = src.indexOf(
        "trap 'RESTARTING=1' USR1",
    );
    const armAt = src.lastIndexOf('read_return');
    assert(trapAt !== -1);
    assert(armAt !== -1);
    assert(trapAt < armAt);
    assertMatch(src, /Press Return/);
    assertMatch(src, /server\/postgres-seed\.ts/);
    assertMatch(src, /trap cleanup EXIT/);
    assertNotMatch(src, /exec deno/);
    assertMatch(src, /fusion-develop/);
});

async function runMain(
    args: readonly string[],
    env: Record<string, string> = {},
): Promise<{ code: number; stderr: string }> {
    const output = await new Deno.Command('deno', {
        args: [
            'run', '--frozen', '--no-check',
            '--allow-net', '--allow-env',
            'server/develop-main.ts',
            ...args,
        ],
        signal: AbortSignal.timeout(30_000),
        env: {
            POSTGRES_URL: '',
            JWT_HMAC_SIGNING_KEY: '',
            PORT: '',
            ...env,
        },
    }).output();
    return {
        code: output.code,
        stderr: new TextDecoder().decode(output.stderr),
    };
}

Deno.test('develop-main with no args exits 1',
async () => {
    const run = await runMain([]);
    assertStrictEquals(run.code, 1);
    assertMatch(run.stderr, /Usage: develop-main\.ts dir\//);
});

Deno.test('develop-main rejects a relative directory',
async () => {
    const run = await runMain(['site/']);
    assertStrictEquals(run.code, 1);
    assertMatch(run.stderr, /Usage: develop-main\.ts dir\//);
});

Deno.test('return redeploys the server', async () => {
    const run = await runDevelop(
        ['8080', '--postgres', 'mock-data'],
        { holdMain: true, pressReturn: true },
    );
    assert(
        run.code === 130 || run.signal === 'SIGINT',
    );
    assertEquals(
        denoArgs(run).filter((line) =>
            line.includes('--outdir')).length,
        2,
    );
    assertEquals(
        denoArgs(run).filter((line) =>
            line.includes('server/develop-main.ts'))
            .length,
        2,
    );
    assertMatch(run.stderr, /Redeploying/);
    assertNotMatch(run.stderr, /\u0007/);
    assertMatch(run.stdout, /Press Return to redeploy/);
    assertEquals(
        dockerCalls(run).map((call) => call[2]),
        [
            'compose down --remove-orphans',
            'compose up -d --wait postgres',
            'compose down --remove-orphans',
        ],
    );
});

Deno.test(
    'a failed rebundle leaves the server running',
    async () => {
        const run = await runDevelop(
            ['8080', '--postgres', 'mock-data'],
            {
                holdMain: true,
                pressReturn: true,
                failBundleAt: 2,
            },
        );
        assert(
            run.code === 130 || run.signal === 'SIGINT',
        );
        assertStrictEquals(run.settledMain, 1);
        assertEquals(
            denoArgs(run).filter((line) =>
                line.includes('--outdir')).length,
            3,
        );
        assertEquals(
            denoArgs(run).filter((line) =>
                line.includes(
                    'server/develop-main.ts',
                )).length,
            2,
        );
        assertMatch(
            run.stderr,
            /error: bundle failed/,
        );
        const reloads = run.stderr.match(
            /Redeploying/g,
        ) ?? [];
        assertStrictEquals(reloads.length, 1);
        const errAt = run.stderr.indexOf(
            'error: bundle failed',
        );
        const reloadAt = run.stderr.indexOf(
            'Redeploying',
        );
        assert(reloadAt > errAt);
    },
);

Deno.test(
    'develop-main reports a missing POSTGRES_URL',
    async () => {
        const dir = Deno.makeTempDirSync({
            prefix: 'fusion-develop-site-',
        });
        try {
            const run = await runMain([`${dir}/`]);
            assertStrictEquals(run.code, 1);
            assertMatch(
                run.stderr,
                /missing required env POSTGRES_URL/,
            );
        } finally {
            Deno.removeSync(dir, { recursive: true });
        }
    },
);
