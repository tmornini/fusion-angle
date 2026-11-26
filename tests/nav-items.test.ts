import { assertEquals } from '@std/assert';
import { buildSidebarNavItemsHtml } from
    '../web-app/app/nav-items.ts';
import { PAGE_REGISTRY } from
    '../web-app/app/page-registry.ts';

// C2: the sidebar lists its links under five headings.

function headingsAndLinks(html: string): string[] {
    const pattern =
        /sidebar-nav-heading"[^>]*>([^<]+)<|data-page-link="([^"]+)"/g;
    return [...html.matchAll(pattern)].map((match) =>
        match[1] === undefined ? match[2]! : '# ' + match[1]);
}

Deno.test('sidebar links sit under their headings in order',
() => {
    assertEquals(
        headingsAndLinks(buildSidebarNavItemsHtml()),
        [
            '# Strategy', 'dashboard', 'organization',
            '# Pipeline', 'ideas', 'projects',
            '# Operations', 'flows', 'records', 'workbox',
            '# Account', 'members', 'identities', 'billing',
            '# Developer', 'api-documentation',
            'design-system',
        ],
    );
});

Deno.test('every sidebar page names a heading', () => {
    const unnamed = Object.entries(PAGE_REGISTRY)
        .filter(([, e]) => e.inSidebarNav && !e.navGroup)
        .map(([key]) => key);
    assertEquals(unnamed, []);
});
