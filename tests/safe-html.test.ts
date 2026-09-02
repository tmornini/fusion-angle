import { assert, assertStrictEquals } from '@std/assert';
import {
    SafeHtml,
    trusted,
    escapeForHtml,
    html,
} from '../web-app/app/safe-html.ts';

Deno.test('escapeForHtml escapes &', () => {
    assertStrictEquals(
        escapeForHtml('a & b'),
        'a &amp; b',
    );
});

Deno.test('escapeForHtml escapes < and >', () => {
    assertStrictEquals(
        escapeForHtml('<script>'),
        '&lt;script&gt;',
    );
});

Deno.test('escapeForHtml escapes quotes', () => {
    assertStrictEquals(
        escapeForHtml(`"hello" 'world'`),
        '&quot;hello&quot; &#39;world&#39;',
    );
});

Deno.test('escapeForHtml escapes & first to avoid double-escape', () => {
    assertStrictEquals(
        escapeForHtml('&amp;'),
        '&amp;amp;',
    );
});

Deno.test('trusted returns SafeHtml without escaping', () => {
    const safe = trusted('<b>bold</b>');
    assert(safe instanceof SafeHtml);
    assertStrictEquals(
        safe.toString(),
        '<b>bold</b>',
    );
});

Deno.test('html escapes interpolated strings', () => {
    const userInput = '<script>alert(1)</script>';
    const result = html`<p>${userInput}</p>`;
    assertStrictEquals(
        result.toString(),
        '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
});

Deno.test('html preserves SafeHtml without re-escaping', () => {
    const inner = trusted('<b>bold</b>');
    const result = html`<p>${inner}</p>`;
    assertStrictEquals(
        result.toString(),
        '<p><b>bold</b></p>',
    );
});

Deno.test('html joins arrays without separator', () => {
    const items = [
        trusted('<li>a</li>'),
        trusted('<li>b</li>'),
    ];
    const result = html`<ul>${items}</ul>`;
    assertStrictEquals(
        result.toString(),
        '<ul><li>a</li><li>b</li></ul>',
    );
});

Deno.test('html renders null and undefined as empty', () => {
    const result = html`a${null}b${undefined}c`;
    assertStrictEquals(result.toString(), 'abc');
});

Deno.test('html escapes interpolation even with concatenation', () => {
    const userInput = '<script>';
    const result = html`<p>${
        'before ' + userInput + ' after'
    }</p>`;
    assertStrictEquals(
        result.toString(),
        '<p>before &lt;script&gt; after</p>',
    );
});

Deno.test('html stringifies non-string values and escapes', () => {
    const num = 42;
    const result = html`<n>${num}</n>`;
    assertStrictEquals(
        result.toString(),
        '<n>42</n>',
    );
});
