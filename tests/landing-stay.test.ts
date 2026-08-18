import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
    fileURLToPath(
        new URL(
            '../web-app/landing/index.ts',
            import.meta.url,
        ),
    ),
    'utf8',
);

test('landing does not shove to dashboard', () => {
    assert.equal(
        src.includes('AUTO_REDIRECT_MS'),
        false,
    );
    assert.equal(
        src.includes('dashboard/index.html'),
        false,
    );
    assert.match(src, /auth\/index\.html/);
});
