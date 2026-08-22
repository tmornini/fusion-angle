import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('DEFAULT_PROFILE_PAGES is the four heavy pages', () => {
    assert.deepEqual(
        [...DEFAULT_PROFILE_PAGES],
        [
            'organization',
            'workbox',
            'workbox-detail',
            'projects',
        ],
    );
});

test('canonicalizeResource collapses long id segments', () => {
    const dashBytes = new Uint8Array(16);
    dashBytes[0] = 62 << 2;
    const id = encodeIdentifier(dashBytes);
    assert.ok(id.includes('-') || id.includes('_'));
    assert.equal(
        canonicalizeResource(
            `work-orders/${id}`,
        ),
        'work-orders/:id',
    );
    assert.equal(
        canonicalizeResource(
            `work-orders/${id}/history`,
        ),
        'work-orders/:id/history',
    );
    assert.equal(
        canonicalizeResource('states'),
        'states',
    );
    assert.equal(
        canonicalizeResource('ideas'),
        'ideas',
    );
    assert.equal(
        canonicalizeResource(
            'work-orders/' + 'a'.repeat(21),
        ),
        'work-orders/' + 'a'.repeat(21),
    );
});

test('summarizeRequestHits counts and sorts', () => {
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
    assert.equal(summary.total, 6);
    assert.deepEqual(summary.byRoute, [
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

test('pageInitAttribution nested and residual', () => {
    const attr = pageInitAttribution({
        [MEASURE_BOOT_PAGE_INIT]: 2000,
        'fetch:a': 900,
        'fetch:b': 800,
        'render:a': 100,
        'boot:sidebar-chrome': 500,
    });
    assert.equal(attr.pageInitMs, 2000);
    assert.equal(attr.nestedFetchMs, 1700);
    assert.equal(attr.nestedRenderMs, 100);
    assert.equal(attr.residualMs, 200);
});

test('formatRequestProfileReport includes residual', () => {
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
    assert.match(text, /Request profile: workbox/);
    assert.match(text, /readyMs\s+3200/);
    assert.match(text, /residual 100/);
    assert.match(text, /nested-fetch 2000/);
    assert.match(text, /API requests\s+3 total/);
    assert.match(text, /GET\s+states/);
    assert.match(text, /work-orders/);
});

test('formatRequestProfileReport empty hits', () => {
    const text = formatRequestProfileReport(
        'auth',
        200,
        { [MEASURE_BOOT_PAGE_INIT]: 1 },
        [],
    );
    assert.match(text, /\(none recorded\)/);
});
