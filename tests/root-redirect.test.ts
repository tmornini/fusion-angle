import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
    fileURLToPath(
        new URL(
            '../web-app/app/root-redirect.ts',
            import.meta.url,
        ),
    ),
    'utf8',
);

test('apex hops via the destination helper', () => {
    assert.match(src, /resolveApexLocation/);
    assert.match(src, /probeRefreshSession/);
    assert.equal(
        src.includes('auth/index.html'),
        false,
    );
    assert.equal(
        src.includes('snapshots/index.html'),
        false,
    );
    assert.equal(
        src.includes('getSchemaPresent'),
        false,
    );
});
