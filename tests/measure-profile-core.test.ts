import {
    assert,
    assertEquals,
    assertMatch,
    assertStrictEquals,
} from '@std/assert';
import {
    canonicalizeResource,
    summarizeRequestHits,
    pageInitAttribution,
    formatRequestProfileReport,
    DEFAULT_PROFILE_PAGES,
} from '../web-app/app/measure-profile-core.ts';
import {
    MEASURE_BOOT_PAGE_INIT,
} from '../web-app/app/measure-viz-core.ts';
import { encodeIdentifier } from
    '../shared/identifier.ts';

Deno.test('DEFAULT_PROFILE_PAGES is the four heavy pages', () => {
    assertEquals(
        [...DEFAULT_PROFILE_PAGES],
        [
            'organization',
            'workbox',
            'workbox-detail',
            'projects',
        ],
    );
});

Deno.test('canonicalizeResource collapses long id segments', () => {
    const dashBytes = new Uint8Array(16);
    dashBytes[0] = 62 << 2;
    const id = encodeIdentifier(dashBytes);
    assert(id.includes('-') || id.includes('_'));
    assertStrictEquals(
        canonicalizeResource(
            `work-orders/${id}`,
        ),
        'work-orders/:id',
    );
    assertStrictEquals(
        canonicalizeResource(
            `work-orders/${id}/history`,
        ),
        'work-orders/:id/history',
    );
    assertStrictEquals(
        canonicalizeResource('states'),
        'states',
    );
    assertStrictEquals(
        canonicalizeResource('ideas'),
        'ideas',
    );
    assertStrictEquals(
        canonicalizeResource(
            'work-orders/' + 'a'.repeat(21),
        ),
        'work-orders/' + 'a'.repeat(21),
    );
});

Deno.test('summarizeRequestHits counts and sorts', () => {
    const dashBytes = new Uint8Array(16);
    dashBytes[0] = 62 << 2;
    const id = encodeIdentifier(dashBytes);
    const summary = summarizeRequestHits([
        { method: 'GET', resource: 'states' },
        { method: 'GET', resource: 'states' },
        { method: 'GET', resource: 'states' },
        { method: 'GET', resource: 'ideas' },
        {
            method: 'GET',
            resource: `work-orders/${id}`,
        },
        {
            method: 'POST',
            resource: `work-orders/${id}/claim`,
        },
    ]);
    assertStrictEquals(summary.total, 6);
    assertEquals(summary.byRoute, [
        {
            method: 'GET',
            resource: 'states',
            count: 3,
        },
        {
            method: 'GET',
            resource: 'ideas',
            count: 1,
        },
        {
            method: 'GET',
            resource: 'work-orders/:id',
            count: 1,
        },
        {
            method: 'POST',
            resource: 'work-orders/:id/claim',
            count: 1,
        },
    ]);
});

Deno.test('pageInitAttribution nested and residual', () => {
    const attr = pageInitAttribution({
        [MEASURE_BOOT_PAGE_INIT]: 2000,
        'fetch:a': 900,
        'fetch:b': 800,
        'render:a': 100,
        'boot:sidebar-chrome': 500,
    });
    assertStrictEquals(attr.pageInitMs, 2000);
    assertStrictEquals(attr.nestedFetchMs, 1700);
    assertStrictEquals(attr.nestedRenderMs, 100);
    assertStrictEquals(attr.residualMs, 200);
});

Deno.test('formatRequestProfileReport includes residual', () => {
    const text = formatRequestProfileReport(
        'workbox',
        3200,
        {
            [MEASURE_BOOT_PAGE_INIT]: 2100,
            'fetch:active-list': 1000,
            'fetch:archive-list': 1000,
        },
        [
            { method: 'GET', resource: 'states' },
            { method: 'GET', resource: 'states' },
            {
                method: 'GET',
                resource: 'work-orders',
            },
        ],
    );
    assertMatch(text, /Request profile: workbox/);
    assertMatch(text, /readyMs\s+3200/);
    assertMatch(text, /residual 100/);
    assertMatch(text, /nested-fetch 2000/);
    assertMatch(text, /API requests\s+3 total/);
    assertMatch(text, /GET\s+states/);
    assertMatch(text, /work-orders/);
});

Deno.test('formatRequestProfileReport empty hits', () => {
    const text = formatRequestProfileReport(
        'auth',
        200,
        { [MEASURE_BOOT_PAGE_INIT]: 1 },
        [],
    );
    assertMatch(text, /\(none recorded\)/);
});
