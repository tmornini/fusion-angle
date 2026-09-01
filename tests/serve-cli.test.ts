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

function runServe(
    args: string[],
    extraEnv: NodeJS.ProcessEnv = {},
): SpawnSyncReturns<string> & { stamp: string } {
    const stamp = join(
        mkdtempSync(join(tmpdir(), 'fusion-stamp-')),
        'called',
    );
    const result = spawnSync('./serve', args, {
        encoding: 'utf8',
        timeout: 4000,
        env: {
            PATH: pathWithDockerStub(stamp),
            HOME: process.env['HOME'] ?? '',
            TMPDIR: process.env['TMPDIR'] ?? '/tmp',
            POSTGRES_URL: '',
            JWT_HMAC_SIGNING_KEY: '',
            ...extraEnv,
        },
    });
    return Object.assign(result, { stamp });
}

test('serve with no args exits 1 with usage', () => {
    const result = runServe([]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: \.\/serve/);
    assert.equal(
        existsSync(result.stamp) &&
            readFileSync(result.stamp, 'utf8')
                .length > 0,
        false,
    );
});

test('serve missing port exits 1 with usage', () => {
    const result = runServe(['bundle/']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: \.\/serve/);
});

test('serve dir without trailing slash exits 1',
() => {
    const result = runServe(['bundle', '8080']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: \.\/serve/);
});

test('serve --help exits 0', () => {
    const result = runServe(['--help']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: \.\/serve/);
});

test('serve missing POSTGRES_URL exits 1', () => {
    const result = runServe(['bundle/', '8080']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /POSTGRES_URL/);
});

test('serve missing JWT exits 1', () => {
    const result = runServe(['bundle/', '8080'], {
        POSTGRES_URL: 'postgres://fusion@127.0.0.1/x',
    });
    assert.equal(result.status, 1);
    assert.match(
        result.stderr,
        /JWT_HMAC_SIGNING_KEY/,
    );
});

test('serve does not invoke ./build', () => {
    const src = readFileSync('serve', 'utf8');
    assert.doesNotMatch(src, /\.\/build/);
    assert.match(src, /node server\.mjs/);
    assert.doesNotMatch(src, /DEFAULT_PORT/);
    assert.doesNotMatch(src, /mktemp/);
});
