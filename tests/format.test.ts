import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    initials,
    pluralize,
    trimStrings,
    displayText,
    toDateInputValue,
    formatDate,
    DISPLAY_ABSENT,
    SECONDS_PER_DAY,
} from '../web-app/app/format.ts';

Deno.test('initials returns first letter of single name', () => {
    assertStrictEquals(initials('Alice'), 'A');
});

Deno.test('initials concatenates multi-word firsts', () => {
    assertStrictEquals(initials('Alice Bob'), 'AB');
    assertStrictEquals(
        initials('Alice Bob Carol'),
        'ABC',
    );
});

Deno.test('initials skips multiple spaces', () => {
    assertStrictEquals(
        initials('Alice  Bob'),
        'AB',
    );
});

Deno.test('pluralize returns singular for count=1', () => {
    assertStrictEquals(
        pluralize(1, 'cat'), 'cat',
    );
});

Deno.test('pluralize returns plural for count!=1', () => {
    assertStrictEquals(
        pluralize(0, 'cat'), 'cats',
    );
    assertStrictEquals(
        pluralize(2, 'cat'), 'cats',
    );
    assertStrictEquals(
        pluralize(99, 'cat'), 'cats',
    );
});

Deno.test('trimStrings trims string properties', () => {
    const out = trimStrings({
        a: '  hello  ',
        b: ' world ',
    });
    assertEquals(
        out,
        { a: 'hello', b: 'world' },
    );
});

Deno.test('trimStrings preserves non-string values', () => {
    const out = trimStrings({
        s: '  hi  ',
        n: 42,
        b: true,
    });
    assertEquals(
        out,
        { s: 'hi', n: 42, b: true },
    );
});

Deno.test('displayText returns value or em-dash', () => {
    assertStrictEquals(displayText('foo'), 'foo');
    assertStrictEquals(
        displayText(''), DISPLAY_ABSENT,
    );
});

Deno.test('toDateInputValue extracts YYYY-MM-DD', () => {
    assertStrictEquals(
        toDateInputValue(
            '2026-04-26T12:00:00Z',
        ),
        '2026-04-26',
    );
});

Deno.test('toDateInputValue empty for empty', () => {
    assertStrictEquals(
        toDateInputValue(''), '',
    );
});

Deno.test('SECONDS_PER_DAY equals 86400', () => {
    assertStrictEquals(SECONDS_PER_DAY, 86400);
});

Deno.test('formatDate surfaces corruption, never the dash', () => {
    // Timestamps are gate-validated; a corrupt value inside
    // the walls must render visibly, not as legitimate absence.
    assertStrictEquals(formatDate('not-a-date'), 'Invalid Date');
});
