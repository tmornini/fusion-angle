import { assert } from '@std/assert';

const src = Deno.readTextFileSync('TEST-PLAN.md');

function caseBlock(id: string): string {
    const start = src.indexOf('**' + id + '**');
    assert(start >= 0, id + ' missing');
    const next = src.indexOf('\n- [ ] **', start + 1);
    return next < 0 ? src.slice(start) : src.slice(
        start,
        next,
    );
}

Deno.test('I7 I9 I28 name #sidebar-toggle', () => {
    for (const id of ['I7', 'I9', 'I28']) {
        assert(
            caseBlock(id).includes('#sidebar-toggle'),
            id + ' must name #sidebar-toggle',
        );
    }
});

Deno.test('I11 I14 I15 name #mobile-sidebar-open',
() => {
    for (const id of ['I11', 'I14', 'I15']) {
        assert(
            caseBlock(id).includes(
                '#mobile-sidebar-open',
            ),
            id + ' must name #mobile-sidebar-open',
        );
    }
});

Deno.test('B2 B3 and C5 name the Apple-menu miss',
() => {
    assert(caseBlock('B2').includes('.navbar-logo'));
    assert(caseBlock('B3').includes('.navbar-logo'));
    assert(
        caseBlock('C5').includes('#sidebar-toggle'),
    );
});
