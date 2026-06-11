import { test } from 'node:test';
import { strict as assert } from 'node:assert';
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

test('initials returns first letter of single name', () => {
    assert.equal(initials('Alice'), 'A');
});

test('initials concatenates multi-word firsts', () => {
    assert.equal(initials('Alice Bob'), 'AB');
    assert.equal(
        initials('Alice Bob Carol'),
        'ABC',
    );
});

test('initials skips multiple spaces', () => {
    assert.equal(
        initials('Alice  Bob'),
        'AB',
    );
});

test('pluralize returns singular for count=1', () => {
    assert.equal(
        pluralize(1, 'cat'), 'cat',
    );
});

test('pluralize returns plural for count!=1', () => {
    assert.equal(
        pluralize(0, 'cat'), 'cats',
    );
    assert.equal(
        pluralize(2, 'cat'), 'cats',
    );
    assert.equal(
        pluralize(99, 'cat'), 'cats',
    );
});

test('trimStrings trims string properties', () => {
    const out = trimStrings({
        a: '  hello  ',
        b: ' world ',
    });
    assert.deepEqual(
        out,
        { a: 'hello', b: 'world' },
    );
});

test('trimStrings preserves non-string values', () => {
    const out = trimStrings({
        s: '  hi  ',
        n: 42,
        b: true,
    });
    assert.deepEqual(
        out,
        { s: 'hi', n: 42, b: true },
    );
});

test('displayText returns value or em-dash', () => {
    assert.equal(displayText('foo'), 'foo');
    assert.equal(
        displayText(''), DISPLAY_ABSENT,
    );
});

test('toDateInputValue extracts YYYY-MM-DD', () => {
    assert.equal(
        toDateInputValue(
            '2026-04-26T12:00:00Z',
        ),
        '2026-04-26',
    );
});

test('toDateInputValue empty for empty', () => {
    assert.equal(
        toDateInputValue(''), '',
    );
});

test('SECONDS_PER_DAY equals 86400', () => {
    assert.equal(SECONDS_PER_DAY, 86400);
});

test('formatDate surfaces corruption, never the dash', () => {
    // Timestamps are gate-validated; a corrupt value inside
    // the walls must render visibly, not as legitimate absence.
    assert.equal(formatDate('not-a-date'), 'Invalid Date');
});
