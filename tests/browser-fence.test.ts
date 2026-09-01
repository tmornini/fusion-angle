import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
    mkdtempSync, writeFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('browser project rejects process (TS2591)', () => {
    const dir = mkdtempSync(
        join(tmpdir(), 'deno-fence-'),
    );
    try {
        const leak = join(dir, 'leak.ts');
        writeFileSync(leak, 'process.exit(0);\n');
        const result = spawnSync(
            'deno',
            ['check', '--frozen', leak],
            { encoding: 'utf8', timeout: 60_000 },
        );
        const out = String(result.stdout)
            + String(result.stderr);
        assert.notEqual(result.status, 0);
        assert.match(out, /TS2591/);
        assert.match(out, /Cannot find name 'process'/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
