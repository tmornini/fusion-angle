import {
    assertEquals,
    assertMatch,
    assertNotMatch,
    assertStrictEquals,
} from '@std/assert';
import {
    DEFAULT_RUNS,
    MEASURE_DEMO_EMAIL,
    MEASURE_SEED_COMMAND,
    MEASURE_SERVER_ENTRY,
    finalizeMeasureCli,
    isVisualizeOnly,
    lastJsonLogMessage,
    measureSeedArgs,
    measureServerArgs,
    needsLocalMeasureServer,
    parseMeasureArgv,
    passwordFromSeedReveal,
    readMeasureServeEnv,
    type MeasureCliFlags,
} from '../web-app/app/measure-cli.ts';

function baseFlags(
    over: Partial<MeasureCliFlags> = {},
): MeasureCliFlags {
    return {
        check: false,
        record: false,
        writeBudgets: false,
        visualize: false,
        profile: false,
        pages: null,
        runs: DEFAULT_RUNS,
        runsExplicit: false,
        baseUrl: null,
        password: null,
        ...over,
    };
}

Deno.test('DEFAULT_RUNS is 25', () => {
    assertStrictEquals(DEFAULT_RUNS, 25);
});

Deno.test('bare argv applies full ceremony', () => {
    const result = finalizeMeasureCli(baseFlags());
    assertStrictEquals(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assertStrictEquals(result.cli.record, true);
    assertStrictEquals(result.cli.writeBudgets, true);
    assertStrictEquals(result.cli.visualize, true);
    assertStrictEquals(result.cli.runs, 25);
    assertStrictEquals(result.cli.check, false);
    assertStrictEquals(result.cli.profile, false);
    assertStrictEquals(result.cli.pages, null);
    assertStrictEquals(result.cli.runsExplicit, false);
});

Deno.test('record with --pages is illegal', () => {
    const result = finalizeMeasureCli(
        baseFlags({
            record: true,
            pages: ['workbox'],
        }),
    );
    assertStrictEquals(result.kind, 'error');
    if (result.kind !== 'error') return;
    assertMatch(result.message, /--record/);
    assertMatch(result.message, /omit --pages/);
});

Deno.test('write-budgets with --pages is illegal', () => {
    const result = finalizeMeasureCli(
        baseFlags({
            writeBudgets: true,
            pages: ['workbox'],
        }),
    );
    assertStrictEquals(result.kind, 'error');
    if (result.kind !== 'error') return;
    assertMatch(result.message, /--write-budgets/);
    assertMatch(result.message, /omit --pages/);
});

Deno.test('explicit --runs alone is not bare', () => {
    const result = finalizeMeasureCli(
        baseFlags({
            runs: 5,
            runsExplicit: true,
        }),
    );
    assertStrictEquals(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assertStrictEquals(result.cli.record, false);
    assertStrictEquals(result.cli.writeBudgets, false);
    assertStrictEquals(result.cli.visualize, false);
    assertStrictEquals(result.cli.runs, 5);
    assertStrictEquals(result.cli.runsExplicit, true);
});

Deno.test('visualize alone is not bare', () => {
    const result = finalizeMeasureCli(
        baseFlags({ visualize: true }),
    );
    assertStrictEquals(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assertStrictEquals(result.cli.visualize, true);
    assertStrictEquals(result.cli.record, false);
    assertStrictEquals(result.cli.writeBudgets, false);
});

Deno.test('profile is not bare', () => {
    const result = finalizeMeasureCli(
        baseFlags({ profile: true }),
    );
    assertStrictEquals(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assertStrictEquals(result.cli.profile, true);
    assertStrictEquals(result.cli.record, false);
    assertStrictEquals(result.cli.writeBudgets, false);
    assertStrictEquals(result.cli.visualize, false);
});

Deno.test('record full registry leaves flags', () => {
    const input = baseFlags({
        record: true,
        pages: null,
        runs: 30,
        runsExplicit: true,
    });
    const result = finalizeMeasureCli(input);
    assertStrictEquals(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assertEquals(result.cli, input);
});

Deno.test('parse accepts --base-url and --password', () => {
    const result = parseMeasureArgv([
        '--base-url',
        'http://127.0.0.1:8080/',
        '--password',
        'secret',
    ]);
    assertStrictEquals(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assertStrictEquals(
        result.cli.baseUrl,
        'http://127.0.0.1:8080',
    );
    assertStrictEquals(result.cli.password, 'secret');
    assertStrictEquals(result.cli.record, false);
    assertStrictEquals(result.cli.writeBudgets, false);
});

Deno.test('unknown flags still error', () => {
    const result = parseMeasureArgv(['--not-a-flag']);
    assertStrictEquals(result.kind, 'error');
    if (result.kind !== 'error') return;
    assertStrictEquals(
        result.message,
        'Unknown flag: --not-a-flag',
    );
});

Deno.test('--base-url requires a password', () => {
    const result = parseMeasureArgv(
        ['--base-url', 'http://127.0.0.1:8080'],
        {},
    );
    assertStrictEquals(result.kind, 'error');
    if (result.kind !== 'error') return;
    assertMatch(result.message, /--password/);
    assertMatch(result.message, /MEASURE_PASSWORD/);
});

Deno.test('MEASURE_PASSWORD satisfies --base-url', () => {
    const result = parseMeasureArgv(
        ['--base-url', 'http://127.0.0.1:8080'],
        { MEASURE_PASSWORD: 'from-env' },
    );
    assertStrictEquals(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assertStrictEquals(result.cli.password, 'from-env');
});

Deno.test('visualize-only is disk-only, no local server', () => {
    const cli = baseFlags({ visualize: true });
    assertStrictEquals(isVisualizeOnly(cli), true);
    assertStrictEquals(needsLocalMeasureServer(cli), false);
});

Deno.test('bare ceremony needs a local Node server', () => {
    const result = finalizeMeasureCli(baseFlags());
    assertStrictEquals(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assertStrictEquals(isVisualizeOnly(result.cli), false);
    assertStrictEquals(
        needsLocalMeasureServer(result.cli),
        true,
    );
});

Deno.test('--base-url skips the local Node spawn', () => {
    const cli = baseFlags({
        baseUrl: 'http://127.0.0.1:8080',
        password: 'secret',
    });
    assertStrictEquals(needsLocalMeasureServer(cli), false);
});

Deno.test('local serve requires Postgres and HMAC env', () => {
    const missingUrl = readMeasureServeEnv({
        JWT_HMAC_SIGNING_KEY: 'k',
    });
    assertStrictEquals(missingUrl.kind, 'error');
    if (missingUrl.kind !== 'error') return;
    assertMatch(missingUrl.message, /POSTGRES_URL/);

    const missingKey = readMeasureServeEnv({
        POSTGRES_URL: 'postgres://x',
    });
    assertStrictEquals(missingKey.kind, 'error');
    if (missingKey.kind !== 'error') return;
    assertMatch(
        missingKey.message,
        /JWT_HMAC_SIGNING_KEY/,
    );

    const empty = readMeasureServeEnv({
        POSTGRES_URL: '',
        JWT_HMAC_SIGNING_KEY: 'k',
    });
    assertStrictEquals(empty.kind, 'error');

    const ok = readMeasureServeEnv({
        POSTGRES_URL: 'postgres://x',
        JWT_HMAC_SIGNING_KEY: 'k',
    });
    assertStrictEquals(ok.kind, 'ok');
    if (ok.kind !== 'ok') return;
    assertStrictEquals(ok.env.postgresUrl, 'postgres://x');
    assertStrictEquals(ok.env.jwtHmacSigningKey, 'k');
});

Deno.test('passwordFromSeedReveal reads tab lines', () => {
    const text = [
        'Save your demo sign-ins — shown once;',
        '',
        'sarah.chen@company.com\talice-secret',
        'demo@example.com\tdemo-secret',
    ].join('\n');
    assertStrictEquals(
        passwordFromSeedReveal(
            text,
            MEASURE_DEMO_EMAIL,
        ),
        'demo-secret',
    );
});

Deno.test('passwordFromSeedReveal misses empty secret', () => {
    assertStrictEquals(
        passwordFromSeedReveal(
            'demo@example.com\t',
            MEASURE_DEMO_EMAIL,
        ),
        null,
    );
    assertStrictEquals(
        passwordFromSeedReveal(
            'other@example.com\tx',
            MEASURE_DEMO_EMAIL,
        ),
        null,
    );
});

Deno.test('lastJsonLogMessage takes the last message', () => {
    const text = [
        'not json',
        '{"level":"info","message":"listening"}',
        '{"level":"error","message":'
            + '"database is not empty; refuse to seed"}',
    ].join('\n');
    assertStrictEquals(
        lastJsonLogMessage(text),
        'database is not empty; refuse to seed',
    );
    assertStrictEquals(lastJsonLogMessage('plain'), null);
});

Deno.test('local spawn is seed then ./fusion-angle serve', () => {
    assertStrictEquals(MEASURE_SEED_COMMAND, './postgres-seed');
    assertEquals(measureSeedArgs(), [
        '--postgres', 'local', '--mock-data',
    ]);
    assertStrictEquals(MEASURE_SERVER_ENTRY, './fusion-angle');
    assertEquals(measureServerArgs(), ['serve']);
});

Deno.test('measure discovery has no identity sentinel', () => {
    const src = Deno.readTextFileSync(
        'web-app/app/measure.ts',
    );
    assertNotMatch(src, /identityId=current/);
    assertNotMatch(src, /Tony Stark/);
    assertMatch(src, /Detail URL discovery failed/);
});
