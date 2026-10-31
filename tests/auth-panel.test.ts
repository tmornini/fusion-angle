import { assertStrictEquals } from '@std/assert';
import { fromFileUrl } from '@std/path';

function readRel(rel: string): string {
    return Deno.readTextFileSync(
        fromFileUrl(new URL(rel, import.meta.url)),
    );
}

function between(
    text: string,
    start: string,
    end: string,
): string {
    const from = text.indexOf(start);
    const to = text.indexOf(end, from + start.length);
    return text.slice(from, to);
}

const src = readRel('../web-app/auth/index.ts');
const css = readRel(
    '../web-app/app/styles/pages-auth.css',
);

Deno.test('auth panel uses the landing ground', () => {
    const panel = between(
        css, '.auth-branding {', '@media',
    );
    assertStrictEquals(
        panel.includes('gradient-hero'),
        false,
    );
    assertStrictEquals(
        panel.includes(
            'background-color: hsl(var(--background))',
        ),
        true,
    );
});

Deno.test('auth panel speaks in the landing voice', () => {
    const panel = between(
        src, 'id="auth-branding"', 'id="auth-form-wrapper"',
    );
    const headline = panel.indexOf(
        "'Strategy to Change Engine'",
    );
    const mark = panel.indexOf("ICON_SIZE['6xl']");
    assertStrictEquals(headline > 0, true);
    assertStrictEquals(mark >= 0, true);
    assertStrictEquals(mark < headline, true);
    assertStrictEquals(
        panel.includes('Transform your business'),
        false,
    );
    assertStrictEquals(
        panel.includes('>Fusion Angle<'),
        false,
    );
    assertStrictEquals(
        panel.includes('auth-brand-name'),
        false,
    );
    assertStrictEquals(panel.includes('0k+'), true);
    assertStrictEquals(panel.includes('0%'), true);
    assertStrictEquals(panel.includes('0+'), true);
    assertStrictEquals(
        panel.includes('Active Users'), true,
    );
    assertStrictEquals(
        panel.includes('>Dissatisfaction<'), true,
    );
    assertStrictEquals(
        panel.includes('Integrations'), true,
    );
    assertStrictEquals(panel.includes('10K+'), false);
    assertStrictEquals(panel.includes('98%'), false);
    assertStrictEquals(panel.includes('50+'), false);
    assertStrictEquals(
        panel.includes('>Satisfaction<'), false,
    );
    const headlineRule = between(
        css, '.auth-headline {', '.auth-subhead',
    );
    assertStrictEquals(
        headlineRule.includes(
            'color: hsl(var(--foreground))',
        ),
        true,
    );
    const subhead = between(
        css, '.auth-subhead {', '.auth-stat-value',
    );
    assertStrictEquals(
        subhead.includes(
            'color: hsl(var(--muted-foreground))',
        ),
        true,
    );
    const label = between(
        css, '.auth-stat-label {', '.auth-submit-btn',
    );
    assertStrictEquals(
        label.includes(
            'color: hsl(var(--muted-foreground))',
        ),
        true,
    );
    const value = between(
        css, '.auth-stat-value {', '.auth-stat-label',
    );
    assertStrictEquals(
        value.includes('color: hsl(var(--accent))'),
        true,
    );
    const markRule = between(
        css, '.auth-mark .brand-mark {', '.auth-form-card',
    );
    assertStrictEquals(
        markRule.includes('width: 2.25em'),
        true,
    );
    assertStrictEquals(
        markRule.includes('height: 2.25em'),
        true,
    );
    const mobile = between(
        src, 'id="mobile-logo"', 'id="auth-title"',
    );
    assertStrictEquals(
        mobile.includes('>Fusion Angle<'),
        false,
    );
    assertStrictEquals(
        mobile.includes("ICON_SIZE['6xl']"),
        true,
    );
});

Deno.test('auth subhead and legal line are honest', () => {
    assertStrictEquals(src.includes('thousands'), false);
    const zero = src.indexOf("'Join zero companies'");
    const currently = src.indexOf(
        "' currently using'",
    );
    assertStrictEquals(zero > 0, true);
    assertStrictEquals(currently > zero, true);
    const our = src.indexOf("' agree to our'");
    const terms = src.indexOf(
        "'Terms of Service and'",
    );
    const br = src.indexOf('<br>', our);
    assertStrictEquals(our > 0, true);
    assertStrictEquals(br > our, true);
    assertStrictEquals(br < terms, true);
    const legal = between(
        src, 'mt-6 text-center', 'let isLogin',
    );
    assertStrictEquals(
        legal.includes('By continuing, you'),
        true,
    );
});

Deno.test('auth logo centers over the headline', () => {
    const panel = between(
        src,
        'id="auth-branding"',
        'class="auth-subhead"',
    );
    const lockup = panel.indexOf('auth-lockup');
    const mark = panel.indexOf('class="auth-mark"');
    const headline = panel.indexOf('auth-headline');
    assertStrictEquals(lockup >= 0, true);
    assertStrictEquals(mark > lockup, true);
    assertStrictEquals(headline > mark, true);
    const rule = between(
        css, '.auth-lockup {', '.auth-mark {',
    );
    assertStrictEquals(
        rule.includes('width: fit-content'),
        true,
    );
    const markRule = between(
        css, '.auth-mark {', '@media',
    );
    assertStrictEquals(
        markRule.includes('justify-content: center'),
        true,
    );
    const image = between(
        css, '.auth-mark .brand-mark {', '.auth-form-card',
    );
    assertStrictEquals(
        image.includes('transform: translateX(-16%)'),
        true,
    );
});

Deno.test('auth headline rises without lowering the stats',
() => {
    const mark = between(
        css, '.auth-mark {', '@media',
    );
    assertStrictEquals(
        mark.includes('margin-bottom: 0.2em'),
        true,
    );
    const stats = between(
        css, '.auth-stats {', '@media',
    );
    assertStrictEquals(
        stats.includes('margin-top: 0.45em'),
        true,
    );
    assertStrictEquals(src.includes('mt-12'), false);
    assertStrictEquals(
        src.includes('auth-stats'), true,
    );
});

Deno.test('auth left block centers on the sign-in card',
() => {
    const rule = between(
        css,
        '.auth-branding .auth-branding-content {',
        '.auth-branding-content {',
    );
    assertStrictEquals(
        rule.includes(
            'var(--space-12) + var(--space-6)'
            + ' + 2.5rem',
        ),
        true,
    );
});

Deno.test('auth outer edges share one inset', () => {
    const inset = 'calc((50vw - 28rem) / 2 + 4rem)';
    assertStrictEquals(
        css.split(inset).length,
        3,
    );
    const desktop = between(
        css,
        '@media (min-width: 1024px) {',
        '.auth-branding-content {',
    );
    assertStrictEquals(
        desktop.includes('justify-content: flex-end'),
        true,
    );
});
