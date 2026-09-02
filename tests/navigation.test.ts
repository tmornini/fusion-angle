import { assertStrictEquals, assertThrows } from '@std/assert';

// navigation.ts touches window.location.href (navigateTo via
// location.ts) and document.documentElement (getPageName).
// Stub both minimally before importing.
const fakeLocation = { href: '' };
let dataPage: string | null = 'dashboard';

// @ts-expect-error — Node global stub
globalThis.window = { location: fakeLocation };
globalThis.document = {
    documentElement: {
        getAttribute(name: string): string | null {
            return name === 'data-page' ? dataPage : null;
        },
    },
} as unknown as Document;

const {
    buildPageUrl,
    navigateTo,
    getPageName,
} = await import('../web-app/app/navigation.ts');

// --- buildPageUrl: sourceDir/sourceFile -> .html ---

Deno.test('buildPageUrl resolves an index page', () => {
    assertStrictEquals(
        buildPageUrl('dashboard'),
        '../dashboard/index.html',
    );
});

Deno.test('buildPageUrl resolves a detail page', () => {
    assertStrictEquals(
        buildPageUrl('idea-detail'),
        '../ideas/detail.html',
    );
});

Deno.test('buildPageUrl resolves a create page', () => {
    assertStrictEquals(
        buildPageUrl('idea-create'),
        '../ideas/create.html',
    );
});

Deno.test('buildPageUrl resolves a standalone page', () => {
    assertStrictEquals(
        buildPageUrl('auth'),
        '../auth/index.html',
    );
});

// --- buildPageUrl: query params ---

Deno.test('buildPageUrl appends a single query param', () => {
    assertStrictEquals(
        buildPageUrl('idea-detail', { id: 'abc' }),
        '../ideas/detail.html?id=abc',
    );
});

Deno.test('buildPageUrl appends multiple query params', () => {
    assertStrictEquals(
        buildPageUrl('flow-detail', {
            id: 'ZOousbbnzpqlxJExVAruYQ',
            tab: 'graph',
        }),
        '../flows/detail.html?id=ZOousbbnzpqlxJExVAruYQ&tab=graph',
    );
});

Deno.test('buildPageUrl omits "?" when params is empty', () => {
    assertStrictEquals(
        buildPageUrl('projects', {}),
        '../projects/index.html',
    );
});

Deno.test('buildPageUrl percent-encodes param values', () => {
    assertStrictEquals(
        buildPageUrl('idea-detail', { id: 'a b' }),
        '../ideas/detail.html?id=a+b',
    );
});

// --- buildPageUrl: flow-stats page ---

Deno.test('buildPageUrl resolves flow-stats to flows/stats.html', () => {
    assertStrictEquals(
        buildPageUrl('flow-stats'),
        '../flows/stats.html',
    );
});

Deno.test('buildPageUrl appends flowId param for flow-stats', () => {
    assertStrictEquals(
        buildPageUrl('flow-stats', { flowId: 'ZOousbbnzpqlxJExVAruYQ' }),
        '../flows/stats.html?flowId=ZOousbbnzpqlxJExVAruYQ',
    );
});

// --- buildPageUrl: unknown page ---

Deno.test('buildPageUrl throws on an unknown page', () => {
    assertThrows(
        () => buildPageUrl('nope'),
        Error, 'Unknown page: "nope"',
    );
});

// --- navigateTo: writes window.location.href ---

Deno.test('navigateTo sets location to the page URL', () => {
    fakeLocation.href = '';
    navigateTo('projects');
    assertStrictEquals(
        fakeLocation.href,
        '../projects/index.html',
    );
});

Deno.test('navigateTo carries params into the URL', () => {
    fakeLocation.href = '';
    navigateTo('idea-detail', { id: 'x9' });
    assertStrictEquals(
        fakeLocation.href,
        '../ideas/detail.html?id=x9',
    );
});

// --- getPageName: reads data-page attribute ---

Deno.test('getPageName returns the data-page value', () => {
    dataPage = 'workbox';
    assertStrictEquals(getPageName(), 'workbox');
});

Deno.test('getPageName throws when data-page is absent', () => {
    dataPage = null;
    assertThrows(
        () => getPageName(),
        Error, 'Missing data-page attribute',
    );
});
