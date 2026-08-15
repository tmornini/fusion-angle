import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_RUNS,
    finalizeMeasureCli,
    parseMeasureArgv,
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

test('DEFAULT_RUNS is 25', () => {
    assert.equal(DEFAULT_RUNS, 25);
});

test('bare argv applies full ceremony', () => {
    const result = finalizeMeasureCli(baseFlags());
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.equal(result.cli.record, true);
    assert.equal(result.cli.writeBudgets, true);
    assert.equal(result.cli.visualize, true);
    assert.equal(result.cli.runs, 25);
    assert.equal(result.cli.check, false);
    assert.equal(result.cli.profile, false);
    assert.equal(result.cli.pages, null);
    assert.equal(result.cli.runsExplicit, false);
});

test('record with --pages is illegal', () => {
    const result = finalizeMeasureCli(
        baseFlags({
            record: true,
            pages: ['workbox'],
        }),
    );
    assert.equal(result.kind, 'error');
    if (result.kind !== 'error') return;
    assert.match(result.message, /--record/);
    assert.match(result.message, /omit --pages/);
});

test('write-budgets with --pages is illegal', () => {
    const result = finalizeMeasureCli(
        baseFlags({
            writeBudgets: true,
            pages: ['workbox'],
        }),
    );
    assert.equal(result.kind, 'error');
    if (result.kind !== 'error') return;
    assert.match(result.message, /--write-budgets/);
    assert.match(result.message, /omit --pages/);
});

test('explicit --runs alone is not bare', () => {
    const result = finalizeMeasureCli(
        baseFlags({
            runs: 5,
            runsExplicit: true,
        }),
    );
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.equal(result.cli.record, false);
    assert.equal(result.cli.writeBudgets, false);
    assert.equal(result.cli.visualize, false);
    assert.equal(result.cli.runs, 5);
    assert.equal(result.cli.runsExplicit, true);
});

test('visualize alone is not bare', () => {
    const result = finalizeMeasureCli(
        baseFlags({ visualize: true }),
    );
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.equal(result.cli.visualize, true);
    assert.equal(result.cli.record, false);
    assert.equal(result.cli.writeBudgets, false);
});

test('profile is not bare', () => {
    const result = finalizeMeasureCli(
        baseFlags({ profile: true }),
    );
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.equal(result.cli.profile, true);
    assert.equal(result.cli.record, false);
    assert.equal(result.cli.writeBudgets, false);
    assert.equal(result.cli.visualize, false);
});

test('record full registry leaves flags', () => {
    const input = baseFlags({
        record: true,
        pages: null,
        runs: 30,
        runsExplicit: true,
    });
    const result = finalizeMeasureCli(input);
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.deepEqual(result.cli, input);
});

test('parse accepts --base-url and --password', () => {
    const result = parseMeasureArgv([
        '--base-url',
        'http://127.0.0.1:8080/',
        '--password',
        'secret',
    ]);
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.equal(
        result.cli.baseUrl,
        'http://127.0.0.1:8080',
    );
    assert.equal(result.cli.password, 'secret');
    assert.equal(result.cli.record, false);
    assert.equal(result.cli.writeBudgets, false);
});

test('unknown flags still error', () => {
    const result = parseMeasureArgv(['--not-a-flag']);
    assert.equal(result.kind, 'error');
    if (result.kind !== 'error') return;
    assert.equal(
        result.message,
        'Unknown flag: --not-a-flag',
    );
});

test('--base-url requires a password', () => {
    const result = parseMeasureArgv(
        ['--base-url', 'http://127.0.0.1:8080'],
        {},
    );
    assert.equal(result.kind, 'error');
    if (result.kind !== 'error') return;
    assert.match(result.message, /--password/);
    assert.match(result.message, /MEASURE_PASSWORD/);
});

test('MEASURE_PASSWORD satisfies --base-url', () => {
    const result = parseMeasureArgv(
        ['--base-url', 'http://127.0.0.1:8080'],
        { MEASURE_PASSWORD: 'from-env' },
    );
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.equal(result.cli.password, 'from-env');
});
