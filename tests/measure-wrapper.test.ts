import {
    assertEquals,
    assertMatch,
    assertStrictEquals,
} from '@std/assert';
import { join } from '@std/path';

// bin/measure runs with deno and docker stubbed on PATH.
// Each stub appends one tab-separated line to a log: deno
// the environment the wrapper handed it, docker its
// compose project and arguments. Every ambient value is
// a decoy the wrapper must not pass through to a local
// sweep.
const AMBIENT = 'ambient';

type WrapperRun = {
    readonly code: number;
    readonly calls: readonly (readonly string[])[];
};

async function runMeasureWrapper(
    args: readonly string[],
    denoExit: number,
): Promise<WrapperRun> {
    const dir = Deno.makeTempDirSync({
        prefix: 'fusion-measure-wrapper-',
    });
    const log = join(dir, 'calls.log');
    try {
        Deno.writeTextFileSync(
            join(dir, 'deno'),
            '#!/bin/bash\n'
            + 'printf \'deno\\t%s\\t%s\\t%s\\t%s\\t%s\\n\' \\\n'
            + '    "${POSTGRES_URL-}" "${POSTGRES_PASSWORD-}" \\\n'
            + '    "${JWT_HMAC_SIGNING_KEY-}" "${PORT-}" \\\n'
            + '    "${COMPOSE_PROJECT_NAME-}" \\\n'
            + `    >> "${log}"\n`
            + `exit ${denoExit}\n`,
            { mode: 0o755 },
        );
        Deno.writeTextFileSync(
            join(dir, 'docker'),
            '#!/bin/bash\n'
            + 'printf \'docker\\t%s\\t%s\\n\' \\\n'
            + '    "${COMPOSE_PROJECT_NAME-}" "$*" \\\n'
            + `    >> "${log}"\n`,
            { mode: 0o755 },
        );
        const output = await new Deno.Command('./bin/measure', {
            args: [...args],
            signal: AbortSignal.timeout(10_000),
            env: {
                PATH: `${dir}:${Deno.env.get('PATH') ?? ''}`,
                POSTGRES_URL: AMBIENT,
                POSTGRES_PASSWORD: AMBIENT,
                JWT_HMAC_SIGNING_KEY: AMBIENT,
                PORT: AMBIENT,
                COMPOSE_PROJECT_NAME: AMBIENT,
            },
            stdout: 'null',
            stderr: 'null',
        }).output();
        const text = Deno.readTextFileSync(log);
        return {
            code: output.code,
            calls: text.trimEnd().split('\n')
                .map((line) => line.split('\t')),
        };
    } finally {
        Deno.removeSync(dir, { recursive: true });
    }
}

Deno.test('a local sweep mints its own compose stack',
async () => {
    const run = await runMeasureWrapper(['--runs', '1'], 0);
    assertStrictEquals(run.code, 0);
    assertStrictEquals(run.calls.length, 2);
    const [deno, docker] = run.calls;
    const [, url, password, key, port, project] = deno!;
    assertMatch(password!, /^[0-9a-f]{32}$/);
    assertStrictEquals(
        url,
        `postgres://fusion:${password}@127.0.0.1:5432/fusion`,
    );
    assertMatch(key!, /^[0-9a-f]{64}$/);
    assertStrictEquals(port, '8080');
    assertMatch(project!, /^fusion-measure-[0-9]+$/);
    assertEquals(
        docker,
        ['docker', project!, 'compose down --remove-orphans'],
    );
});

Deno.test('a failed sweep still takes its stack down',
async () => {
    const run = await runMeasureWrapper(['--runs', '1'], 3);
    assertStrictEquals(run.code, 3);
    assertStrictEquals(run.calls.length, 2);
    assertStrictEquals(run.calls[1]![0], 'docker');
    assertStrictEquals(
        run.calls[1]![2],
        'compose down --remove-orphans',
    );
});

Deno.test('a run without a local sweep leaves compose be',
async () => {
    for (const args of [
        ['--help'],
        ['--visualize'],
        ['--base-url', 'http://127.0.0.1:1', '--password', 'p'],
    ]) {
        const run = await runMeasureWrapper(args, 0);
        assertStrictEquals(run.code, 0);
        assertEquals(
            run.calls,
            [['deno', AMBIENT, AMBIENT, AMBIENT, AMBIENT,
                AMBIENT]],
            args.join(' '),
        );
    }
});
