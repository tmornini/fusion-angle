import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    spawnSync,
    type SpawnSyncReturns,
} from 'node:child_process';

function pathWithDockerStub(stamp: string): string {
    const dir = mkdtempSync(
        join(tmpdir(), 'fusion-docker-stub-'),
    );
    writeFileSync(
        join(dir, 'docker'),
        '#!/bin/bash\n'
        + `printf x >> "${stamp}"\n`
        + 'exit 99\n',
        { mode: 0o755 },
    );
    return `${dir}:${process.env['PATH'] ?? ''}`;
}

function runCrank(
    args: string[],
): SpawnSyncReturns<string> & { stamp: string } {
    const stamp = join(
        mkdtempSync(join(tmpdir(), 'fusion-stamp-')),
        'called',
    );
    const result = spawnSync('./crank', args, {
        encoding: 'utf8',
        timeout: 4000,
        env: {
            PATH: pathWithDockerStub(stamp),
            HOME: process.env['HOME'] ?? '',
            TMPDIR: process.env['TMPDIR'] ?? '/tmp',
        },
    });
    return Object.assign(result, { stamp });
}

function dockerCalled(stamp: string): boolean {
    return existsSync(stamp)
        && readFileSync(stamp, 'utf8').length > 0;
}

test('crank with no args exits 1 with usage', () => {
    const result = runCrank([]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: \.\/crank/);
    assert.equal(dockerCalled(result.stamp), false);
});

test('crank missing port exits 1 with usage', () => {
    const result = runCrank(['--mock-data']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: \.\/crank/);
    assert.equal(dockerCalled(result.stamp), false);
});

test('crank missing mode exits 1 with usage', () => {
    const result = runCrank(['8080']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: \.\/crank/);
    assert.equal(dockerCalled(result.stamp), false);
});

test('crank two modes exits 1 with usage', () => {
    const result = runCrank([
        '--mock-data',
        '--bootstrap',
        '8080',
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: \.\/crank/);
    assert.match(result.stderr, /exclusive/);
    assert.equal(dockerCalled(result.stamp), false);
});

test('crank unknown flag exits 1 with usage', () => {
    const result = runCrank(['--bogus', '8080']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: \.\/crank/);
    assert.equal(dockerCalled(result.stamp), false);
});

test('crank --help exits 0', () => {
    const result = runCrank(['--help']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: \.\/crank/);
    assert.equal(dockerCalled(result.stamp), false);
});

test('crank source owns the local stack', () => {
    const src = readFileSync('crank', 'utf8');
    assert.match(src, /\.\/validate/);
    assert.match(
        src,
        /docker compose up -d --wait postgres/,
    );
    assert.match(src, /\.\/test-postgres/);
    assert.match(src, /\.\/build --no-zip/);
    assert.match(
        src,
        /\.\/postgres-wipe --postgres local/,
    );
    assert.match(
        src,
        /\.\/postgres-seed --postgres local/,
    );
    assert.match(src, /\.\/serve /);
    assert.doesNotMatch(
        src,
        /docker compose up -d --wait["\n]*$/,
    );
    assert.doesNotMatch(src, /echo \$POSTGRES_URL/);
    assert.doesNotMatch(
        src,
        /echo \$POSTGRES_PASSWORD/,
    );
    assert.doesNotMatch(
        src,
        /echo \$JWT_HMAC_SIGNING_KEY/,
    );
    const trapAt = src.indexOf('trap ');
    const upAt = src.indexOf(
        'docker compose up -d --wait postgres',
    );
    assert.ok(trapAt >= 0, 'trap missing');
    assert.ok(upAt >= 0, 'compose up missing');
    assert.ok(trapAt < upAt, 'trap after Docker');
});
