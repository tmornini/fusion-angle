import { assertMatch, assertStrictEquals } from '@std/assert';
import { fromFileUrl } from '@std/path';

const src = Deno.readTextFileSync(
    fromFileUrl(
        new URL(
            '../web-app/landing/index.ts',
            import.meta.url,
        ),
    ),
);

Deno.test('landing does not shove to dashboard', () => {
    assertStrictEquals(
        src.includes('AUTO_REDIRECT_MS'),
        false,
    );
    assertStrictEquals(
        src.includes('dashboard/index.html'),
        false,
    );
    assertMatch(src, /auth\/index\.html/);
});

function readRel(rel: string): string {
    return Deno.readTextFileSync(
        fromFileUrl(new URL(rel, import.meta.url)),
    );
}

Deno.test('landing has no how-it-works jump', () => {
    assertStrictEquals(
        src.includes('how-it-works'), false,
    );
    assertStrictEquals(
        src.includes('See how it works'), false,
    );
    assertStrictEquals(
        src.includes('How it works'), false,
    );
    assertStrictEquals(
        src.includes('buildPipeline'), false,
    );
    assertStrictEquals(
        src.includes('PIPELINE'), false,
    );
    const landingCss = readRel(
        '../web-app/app/styles/pages-landing.css',
    );
    assertStrictEquals(
        landingCss.includes('how-it-works'), false,
    );
    assertStrictEquals(
        landingCss.includes('steps-list'), false,
    );
    const buttons = readRel(
        '../web-app/app/styles/'
            + 'components-buttons.css',
    );
    assertStrictEquals(
        buttons.includes('btn-outline-hero'), false,
    );
});
