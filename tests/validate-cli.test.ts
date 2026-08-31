import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

function headSha(): string {
    return execSync('git rev-parse HEAD', {
        encoding: 'utf8',
    }).trim();
}

test('validate skips when the HEAD SHA already passed',
    () => {
    const stamp = join(
        mkdtempSync(join(tmpdir(), 'validate-ok-')),
        'validate-ok',
    );
    writeFileSync(stamp, `${headSha()}\n`);
    const result = spawnSync('./validate', [], {
        encoding: 'utf8',
        timeout: 4000,
        env: {
            ...process.env,
            VALIDATE_OK: stamp,
            VALIDATE_PORCELAIN: '',
        },
    });
    assert.equal(result.status, 0);
    assert.match(
        result.stdout,
        /already validated [0-9a-f]{40}/,
    );
});
