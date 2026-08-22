import { test } from 'node:test';
import { strict as assert } from 'node:assert';

// navigation.ts touches window.location.href (navigateTo via
// location.ts) and document.documentElement (getPageName).
// Stub both minimally before importing.
const fakeLocation = { href: '' };
let dataPage: string | null = 'dashboard';

// @ts-expect-error — Node global stub
globalThis.window = { location: fakeLocation };
// @ts-expect-error — Node global stub
globalThis.document = {
    documentElement: {
        getAttribute(name: string): string | null {
            return name === 'data-page' ? dataPage : null;
        },
    },
};

const {
    buildPageUrl,
    navigateTo,
    getPageName,
} = await import('../web-app/app/navigation.ts');

// --- buildPageUrl: sourceDir/sourceFile -> .html ---

test('buildPageUrl resolves an index page', () => {
    assert.equal(
        buildPageUrl('dashboard'),
        '../dashboard/index.html',
    );
});

test('buildPageUrl resolves a detail page', () => {
    assert.equal(
        buildPageUrl('idea-detail'),
        '../ideas/detail.html',
    );
});

test('buildPageUrl resolves a create page', () => {
    assert.equal(
        buildPageUrl('idea-create'),
        '../ideas/create.html',
    );
});

test('buildPageUrl resolves a standalone page', () => {
    assert.equal(
        buildPageUrl('auth'),
        '../auth/index.html',
    );
});

// --- buildPageUrl: query params ---

test('buildPageUrl appends a single query param', () => {
    assert.equal(
        buildPageUrl('idea-detail', { id: 'abc' }),
        '../ideas/detail.html?id=abc',
    );
});

test('buildPageUrl appends multiple query params', () => {
    assert.equal(
        buildPageUrl('flow-detail', {
            id: 'ZOousbbnzpqlxJExVAruYQ',
            tab: 'graph',
        }),
        '../flows/detail.html?id=ZOousbbnzpqlxJExVAruYQ&tab=graph',
    );
});

test('buildPageUrl omits "?" when params is empty', () => {
    assert.equal(
        buildPageUrl('projects', {}),
        '../projects/index.html',
    );
});

test('buildPageUrl percent-encodes param values', () => {
    assert.equal(
        buildPageUrl('idea-detail', { id: 'a b' }),
        '../ideas/detail.html?id=a+b',
    );
});

// --- buildPageUrl: flow-stats page ---

test('buildPageUrl resolves flow-stats to flows/stats.html', () => {
    assert.equal(
        buildPageUrl('flow-stats'),
        '../flows/stats.html',
    );
});

test('buildPageUrl appends flowId param for flow-stats', () => {
    assert.equal(
        buildPageUrl('flow-stats', { flowId: 'ZOousbbnzpqlxJExVAruYQ' }),
        '../flows/stats.html?flowId=ZOousbbnzpqlxJExVAruYQ',
    );
});

// --- buildPageUrl: unknown page ---

test('buildPageUrl throws on an unknown page', () => {
    assert.throws(
        () => buildPageUrl('nope'),
        /Unknown page: "nope"/,
    );
});

// --- navigateTo: writes window.location.href ---

test('navigateTo sets location to the page URL', () => {
    fakeLocation.href = '';
    navigateTo('projects');
    assert.equal(
        fakeLocation.href,
        '../projects/index.html',
    );
});

test('navigateTo carries params into the URL', () => {
    fakeLocation.href = '';
    navigateTo('idea-detail', { id: 'x9' });
    assert.equal(
        fakeLocation.href,
        '../ideas/detail.html?id=x9',
    );
});

// --- getPageName: reads data-page attribute ---

test('getPageName returns the data-page value', () => {
    dataPage = 'workbox';
    assert.equal(getPageName(), 'workbox');
});

test('getPageName throws when data-page is absent', () => {
    dataPage = null;
    assert.throws(
        () => getPageName(),
        /Missing data-page attribute/,
    );
});
