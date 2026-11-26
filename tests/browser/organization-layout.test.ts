import { assert, assertStrictEquals } from '@std/assert';
import { useBrowser, withAdminPage } from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const CARD = (box: string) =>
    `document.querySelector('${box} > .card')`;
const PAINTED = `!!${CARD('#objectives-box')}`
    + ` && !!${CARD('#sent-invitations-box')}`;
const RECTS = `(() => {`
    + ` const r = (el) => el.getBoundingClientRect();`
    + ` const o = r(${CARD('#objectives-box')});`
    + ` const u = r(${CARD('.organization-usage')});`
    + ` const s = r(${CARD('#sent-invitations-box')});`
    + ` const wide = document.documentElement.scrollWidth`
    + ` > document.documentElement.clientWidth;`
    + ` const cut = [...document.querySelectorAll(`
    + `'#sent-invitations-list p')]`
    + `.some((p) => p.scrollWidth > p.clientWidth);`
    + ` return { o: o.toJSON(), u: u.toJSON(),`
    + ` s: s.toJSON(), wide, cut }; })()`;

type Rects = {
    readonly o: DOMRect;
    readonly u: DOMRect;
    readonly s: DOMRect;
    readonly wide: boolean;
    readonly cut: boolean;
};

Deno.test('the Organization columns end on the same line',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.setViewport(1280, 800, false);
        await page.navigate(
            registryUrl(origin.baseUrl, 'organization'));
        await page.ready('organization');
        await page.until(PAINTED, 'both columns painted');
        const { o, u, s, wide, cut } =
            await page.evaluate<Rects>(RECTS);
        assertStrictEquals(cut, false);
        assert(o.right <= u.left, 'objectives sit left');
        assertStrictEquals(u.top, o.top);
        assert(s.top >= u.bottom, 'invitations under usage');
        assert(Math.abs(o.bottom - s.bottom) <= 1);
        assertStrictEquals(wide, false);
    });
});

Deno.test('the Organization cards stack on a narrow screen',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.setViewport(390, 844, true);
        await page.navigate(
            registryUrl(origin.baseUrl, 'organization'));
        await page.ready('organization');
        await page.until(PAINTED, 'all cards painted');
        const { o, u, s, wide } =
            await page.evaluate<Rects>(RECTS);
        assert(u.top >= o.bottom, 'usage under objectives');
        assert(s.top >= u.bottom, 'invitations under usage');
        assertStrictEquals(wide, false);
    });
});
