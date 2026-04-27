import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    SafeHtml,
    trusted,
    escapeForHtml,
    html,
} from '../web-app/app/safe-html.ts';

test('escapeForHtml escapes &', () => {
    assert.equal(
        escapeForHtml('a & b'),
        'a &amp; b',
    );
});

test('escapeForHtml escapes < and >', () => {
    assert.equal(
        escapeForHtml('<script>'),
        '&lt;script&gt;',
    );
});

test('escapeForHtml escapes quotes', () => {
    assert.equal(
        escapeForHtml(`"hello" 'world'`),
        '&quot;hello&quot; &#39;world&#39;',
    );
});

test('escapeForHtml escapes & first to avoid double-escape', () => {
    assert.equal(
        escapeForHtml('&amp;'),
        '&amp;amp;',
    );
});

test('trusted returns SafeHtml without escaping', () => {
    const safe = trusted('<b>bold</b>');
    assert.ok(safe instanceof SafeHtml);
    assert.equal(
        safe.toString(),
        '<b>bold</b>',
    );
});

test('html escapes interpolated strings', () => {
    const userInput = '<script>alert(1)</script>';
    const result = html`<p>${userInput}</p>`;
    assert.equal(
        result.toString(),
        '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
});

test('html preserves SafeHtml without re-escaping', () => {
    const inner = trusted('<b>bold</b>');
    const result = html`<p>${inner}</p>`;
    assert.equal(
        result.toString(),
        '<p><b>bold</b></p>',
    );
});

test('html joins arrays without separator', () => {
    const items = [
        trusted('<li>a</li>'),
        trusted('<li>b</li>'),
    ];
    const result = html`<ul>${items}</ul>`;
    assert.equal(
        result.toString(),
        '<ul><li>a</li><li>b</li></ul>',
    );
});

test('html renders null and undefined as empty', () => {
    const result = html`a${null}b${undefined}c`;
    assert.equal(result.toString(), 'abc');
});

test('html escapes interpolation even with concatenation', () => {
    const userInput = '<script>';
    const result = html`<p>${
        'before ' + userInput + ' after'
    }</p>`;
    assert.equal(
        result.toString(),
        '<p>before &lt;script&gt; after</p>',
    );
});

test('html stringifies non-string values and escapes', () => {
    const num = 42;
    const result = html`<n>${num}</n>`;
    assert.equal(
        result.toString(),
        '<n>42</n>',
    );
});
