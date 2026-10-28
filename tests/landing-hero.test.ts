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

function joinedLiterals(block: string): string {
    return [...block.matchAll(/'([^'\\]*)'/g)]
        .map(match => match[1] ?? '')
        .join('');
}

function slot(markup: string, tag: string): string {
    const open = markup.indexOf('<' + tag);
    const close = markup.indexOf(
        '</' + tag + '>', open,
    );
    const body = markup.slice(open, close);
    const brace = body.lastIndexOf('${');
    return joinedLiterals(body.slice(brace));
}

Deno.test('landing hero states the engine', () => {
    const hero = between(
        src,
        'function buildHero',
        'function buildStalls',
    );
    assertStrictEquals(
        slot(hero, 'h1'),
        'Fusion Angle is your '
            + 'Strategy-to-Change Engine',
    );
    assertStrictEquals(
        slot(hero, 'p'),
        'Ideas are easy and execution is hard. '
            + 'We make it easy to align ideas with '
            + 'strategy and get them implemented '
            + 'quickly.',
    );
});
