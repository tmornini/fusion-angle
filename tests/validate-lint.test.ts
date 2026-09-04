import { assert, assertMatch, assertNotMatch } from '@std/assert';

const TEST_SRC = Deno.readTextFileSync('test');

function longLineBlock(src: string): string {
    const start = src.indexOf('LONG_LINES=');
    const end = src.indexOf('if [ -n "$LONG_LINES"');
    assert(start >= 0, 'LONG_LINES missing');
    assert(end > start, 'LONG_LINES guard missing');
    return src.slice(start, end);
}

Deno.test('test does not lint root markdown', () => {
    const block = longLineBlock(TEST_SRC);
    assertNotMatch(block, /-name '\*\.md'/);
    assertNotMatch(
        block,
        /TEST-PLAN\.md/,
    );
});

Deno.test('test lints deploy', () => {
    assertMatch(
        longLineBlock(TEST_SRC),
        /\bdeploy\b/,
    );
});
