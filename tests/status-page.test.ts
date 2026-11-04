import { assertEquals, assertMatch } from '@std/assert';
import { join } from '@std/path';
import {
    jsonRequested,
    statusAssets,
    statusPageHtml,
} from '../server/status-page.ts';

function headers(
    init: Record<string, string>,
): Headers {
    return new Headers(init);
}

Deno.test('json is requested only when it wins', () => {
    assertEquals(jsonRequested(headers({})), false);
    assertEquals(jsonRequested(headers({
        accept: '',
    })), false);
    assertEquals(jsonRequested(headers({
        accept: '*/*',
    })), false);
    assertEquals(jsonRequested(headers({
        accept: 'text/json',
    })), false);
    assertEquals(jsonRequested(headers({
        accept: 'application/vnd.api+json',
    })), false);
    assertEquals(jsonRequested(headers({
        accept: 'application/json;q=0',
    })), false);
    assertEquals(jsonRequested(headers({
        accept: 'application/json, text/html',
    })), false);
    assertEquals(jsonRequested(headers({
        accept: 'application/json;q=1.5, text/html',
    })), false);
    assertEquals(jsonRequested(headers({
        accept: 'application/json;q=nan',
    })), false);
    assertEquals(jsonRequested(headers({
        accept: 'application/xhtml+xml,'
            + ' application/json;q=0.5',
    })), false);
    assertEquals(jsonRequested(headers({
        accept: 'application/json',
    })), true);
    assertEquals(jsonRequested(headers({
        accept: 'text/html;q=0.5,'
            + ' application/json;q=0.2,'
            + ' application/json;q=0.9',
    })), true);
    assertEquals(jsonRequested(headers({
        accept: 'application/json;q=2',
    })), true);
    assertEquals(jsonRequested(headers({
        'content-type':
            'application/json; charset=utf-8',
        accept: 'text/html',
    })), true);
});

Deno.test('the status page escapes text', () => {
    const html = statusPageHtml(
        'a<b&"c>',
        { postgres: false },
        {
            styles: '/assets/styles.0123abcd.css',
            icon: '/assets/favicon.0123abcd.svg',
        },
    );
    assertEquals(
        html.includes('a&lt;b&amp;&quot;c&gt;'),
        true,
    );
    assertEquals(html.includes('a<b'), false);
    const nameAt = html.indexOf(
        '<h1 class="font-display text-3xl font-bold mb-6">\n'
        + 'Fusion Angle\n</h1>',
    );
    const downAt = html.indexOf(
        '<span class="pill" data-tone="error">Down</span>',
    );
    const postgresAt = html.indexOf(
        '<span class="pill" data-tone="error">'
        + 'Postgres down</span>',
    );
    assertEquals(nameAt >= 0, true);
    assertEquals(downAt > nameAt, true);
    assertEquals(postgresAt > downAt, true);
    assertEquals(
        html.includes(
            '<h1 class="font-display text-4xl font-bold mb-2">\n'
            + 'Down\n</h1>',
        ),
        false,
    );
    assertEquals(
        html.includes(
            'href="/assets/styles.0123abcd.css"',
        ),
        true,
    );
});

Deno.test('the status sha clips to seven digits', () => {
    const css = Deno.readTextFileSync(
        'web-app/app/styles/base.css',
    );
    const html = statusPageHtml(
        '0123456789abcdef0123456789abcdef01234567',
        { postgres: true },
        {},
    );
    assertEquals(
        html.includes('class="git-sha font-mono text-sm"'),
        true,
    );
    assertMatch(
        css,
        /\.git-sha \{[^}]*width: 7ch;[^}]*\}/,
    );
    assertMatch(
        css,
        /\.git-sha \{[^}]*overflow: hidden;[^}]*\}/,
    );
    assertMatch(
        css,
        /\.git-sha \{[^}]*white-space: nowrap;[^}]*\}/,
    );
    assertMatch(
        css,
        /\.font-mono \{ font-family: var\(--font-mono\); \}/,
    );
});

Deno.test('status assets keep published names only',
async () => {
    const root = await Deno.makeTempDir({
        prefix: 'fusion-status-assets-',
    });
    try {
        assertEquals(await statusAssets(root), {});
        await Deno.writeTextFile(
            join(root, 'asset-manifest.json'),
            '[]',
        );
        assertEquals(await statusAssets(root), {});
        await Deno.writeTextFile(
            join(root, 'asset-manifest.json'),
            '{',
        );
        assertEquals(await statusAssets(root), {});
        await Deno.writeTextFile(
            join(root, 'asset-manifest.json'),
            JSON.stringify({
                'styles.css':
                    'styles.0123abcd0123abcd.css',
                'favicon.svg': 'not-a-hash.svg',
            }),
        );
        assertEquals(await statusAssets(root), {
            styles: '/assets/'
                + 'styles.0123abcd0123abcd.css',
        });
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
