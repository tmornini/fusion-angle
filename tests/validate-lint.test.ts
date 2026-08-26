import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const VALIDATE = readFileSync('validate', 'utf8');

function longLineBlock(src: string): string {
    const start = src.indexOf('LONG_LINES=');
    const end = src.indexOf('DOC_LINE_FAIL=');
    assert.ok(start >= 0, 'LONG_LINES missing');
    assert.ok(end > start, 'DOC_LINE_FAIL missing');
    return src.slice(start, end);
}

test('validate does not lint root markdown', () => {
    const block = longLineBlock(VALIDATE);
    assert.doesNotMatch(block, /-name '\*\.md'/);
    assert.doesNotMatch(
        block,
        /TEST-PLAN\.md/,
    );
});

test('validate lints crank', () => {
    assert.match(
        longLineBlock(VALIDATE),
        /\bcrank\b/,
    );
});
