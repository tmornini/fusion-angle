import { assertStrictEquals } from '@std/assert';
import { fromFileUrl } from '@std/path';

const src = Deno.readTextFileSync(
    fromFileUrl(
        new URL(
            '../web-app/landing/index.ts',
            import.meta.url,
        ),
    ),
);

function between(
    text: string,
    start: string,
    end: string,
): string {
    const from = text.indexOf(start);
    const to = text.indexOf(end, from + start.length);
    return text.slice(from, to);
}

Deno.test('landing hero states the engine', () => {
    const hero = between(
        src,
        'function buildHero',
        'export async function init',
    );
    const headline = hero.indexOf('<h1');
    const angle = hero.indexOf("'Fusion Angle'");
    const engine = hero.indexOf(
        "'Strategy-to-Change Engine'",
    );
    assertStrictEquals(hero.includes('is your'), false);
    assertStrictEquals(angle > headline, true);
    assertStrictEquals(engine > angle, true);
    assertStrictEquals(
        hero.slice(angle, engine).includes('<br'),
        true,
    );
    const first = hero.indexOf(
        "'Ideas are easy and execution is hard.'",
    );
    const second = hero.indexOf(
        "'We make it easy to align ideas to '",
    );
    assertStrictEquals(first > headline, true);
    assertStrictEquals(second > first, true);
    assertStrictEquals(
        hero.slice(first, second).includes('<br'),
        true,
    );
    assertStrictEquals(
        src.includes('buildStalls'), false,
    );
    assertStrictEquals(
        src.includes('buildSafety'), false,
    );
    assertStrictEquals(
        src.includes('buildFooter'), false,
    );
});

Deno.test('landing hero rests the mark above the lines', () => {
    const css = Deno.readTextFileSync(
        fromFileUrl(
            new URL(
                '../web-app/app/styles/'
                    + 'pages-landing.css',
                import.meta.url,
            ),
        ),
    );
    const hero = between(
        src,
        'function buildHero',
        'export async function init',
    );
    const mark = hero.indexOf('hero-mark');
    const headline = hero.indexOf('<h1');
    assertStrictEquals(mark >= 0, true);
    assertStrictEquals(mark < headline, true);
    assertStrictEquals(
        src.includes('buildNavbar'), false,
    );
    assertStrictEquals(
        src.includes('class="navbar"'), false,
    );
    const block = between(
        css, '.hero-content {', '.hero h1',
    );
    assertStrictEquals(
        block.includes('translateY(-1lh)'),
        false,
    );
    const heroRule = between(css, '.hero {', '.hero-bg');
    assertStrictEquals(
        heroRule.includes('padding-top:'),
        false,
    );
    const gap = between(
        css, '.hero-mark {', '.hero-mark .brand-mark',
    );
    assertStrictEquals(
        gap.includes('padding-top: calc(5em / 18)'),
        true,
    );
    assertStrictEquals(
        gap.includes(
            'margin-bottom: calc(0.65em - 5em / 18)',
        ),
        true,
    );
    const markRule = between(
        css, '.hero-mark .brand-mark {', '.hero h1',
    );
    assertStrictEquals(
        markRule.includes('width: 2.25em'),
        true,
    );
    assertStrictEquals(
        markRule.includes(
            'background-color: hsl(var(--accent))',
        ),
        true,
    );
    assertStrictEquals(
        markRule.includes(
            'mask-image: url('
            + '"../../assets/mark.png")',
        ),
        true,
    );
    assertStrictEquals(
        block.includes('translateY(-1.5rem)'),
        true,
    );
    assertStrictEquals(
        block.includes('font-size: var(--text-4xl)'),
        true,
    );
    assertStrictEquals(
        block.includes(
            'line-height: var(--leading-tight)',
        ),
        true,
    );
    assertStrictEquals(
        css.includes(
            '.hero-content { font-size: 3rem; }',
        ),
        true,
    );
    assertStrictEquals(
        css.includes(
            '.hero-content { font-size: 3.75rem; }',
        ),
        true,
    );
    assertStrictEquals(
        css.includes(
            '.hero-content { font-size: 4.5rem; }',
        ),
        true,
    );
    const subtitle = between(
        css, '.hero-subtitle {', '@media',
    );
    assertStrictEquals(
        subtitle.includes('white-space: nowrap'),
        true,
    );
    assertStrictEquals(
        subtitle.includes('max-width:'),
        false,
    );
});

Deno.test('landing headline is foreground', () => {
    const css = Deno.readTextFileSync(
        fromFileUrl(
            new URL(
                '../web-app/app/styles/'
                    + 'pages-landing.css',
                import.meta.url,
            ),
        ),
    );
    const headline = between(
        css, '.hero h1 {', '.hero-actions',
    );
    assertStrictEquals(
        headline.includes(
            'color: hsl(var(--foreground))',
        ),
        true,
    );
});

Deno.test('landing hero signs up then signs in', () => {
    const hero = between(
        src,
        'function buildHero',
        'export async function init',
    );
    const signUp = hero.indexOf('Sign Up');
    const signIn = hero.indexOf('Sign In');
    const primary = hero.indexOf(
        "'btn btn-primary btn-lg'",
    );
    const ink = hero.indexOf(
        "'btn btn-ink btn-lg'",
    );
    assertStrictEquals(signUp >= 0, true);
    assertStrictEquals(signIn > signUp, true);
    assertStrictEquals(primary >= 0, true);
    assertStrictEquals(primary < signUp, true);
    assertStrictEquals(ink > signUp, true);
    assertStrictEquals(ink < signIn, true);
    const css = Deno.readTextFileSync(
        fromFileUrl(
            new URL(
                '../web-app/app/styles/'
                    + 'pages-landing.css',
                import.meta.url,
            ),
        ),
    );
    const inkRule = between(
        css, '.btn-ink {', '.btn-ink:hover',
    );
    assertStrictEquals(
        inkRule.includes('hsl(0 0% 0%)'),
        true,
    );
    assertStrictEquals(
        hero.includes('href="index.html"'),
        true,
    );
    assertStrictEquals(
        hero.includes('data-goto-auth'),
        true,
    );
});
