import { assert, assertMatch, assertNotMatch } from '@std/assert';

const VALIDATE = Deno.readTextFileSync('validate');

function longLineBlock(src: string): string {
    const start = src.indexOf('LONG_LINES=');
    const end = src.indexOf('if [ -n "$LONG_LINES"');
    assert(start >= 0, 'LONG_LINES missing');
    assert(end > start, 'LONG_LINES guard missing');
    return src.slice(start, end);
}

Deno.test('validate does not lint root markdown', () => {
    const block = longLineBlock(VALIDATE);
    assertNotMatch(block, /-name '\*\.md'/);
    assertNotMatch(
        block,
        /TEST-PLAN\.md/,
    );
});

Deno.test('validate lints crank', () => {
    assertMatch(
        longLineBlock(VALIDATE),
        /\bcrank\b/,
    );
});
