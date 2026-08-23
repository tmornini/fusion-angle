import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildBipolarGaugeSvg } from
    '../web-app/app/presenters/gauge.ts';

test('measured zero renders an apex marker', () => {
    const html = buildBipolarGaugeSvg(
        { value: 0, label: 'Baseline', display: '0' },
        {
            value: undefined,
            label: 'Actual',
            display: 'none yet',
        },
        'gauge-zero', 'small',
    ).toString();
    assert.ok(
        html.includes('gauge-arc-zero-mark'),
        'a measured 0 should emit the apex zero marker',
    );
});

test('absent value renders no apex marker', () => {
    const html = buildBipolarGaugeSvg(
        {
            value: undefined,
            label: 'Baseline',
            display: 'unset',
        },
        {
            value: undefined,
            label: 'Actual',
            display: 'none yet',
        },
        'gauge-absent', 'small',
    ).toString();
    assert.ok(
        !html.includes('gauge-arc-zero-mark'),
        'no measurement should emit no marker',
    );
});

test('nonzero value still renders a filled arc', () => {
    const html = buildBipolarGaugeSvg(
        { value: 50, label: 'Baseline', display: '+50' },
        {
            value: undefined,
            label: 'Actual',
            display: 'none yet',
        },
        'gauge-nonzero', 'small',
    ).toString();
    assert.ok(
        html.includes('gauge-arc-bipolar-half'),
        'a nonzero value should emit a filled arc path',
    );
    assert.ok(
        !html.includes('gauge-arc-zero-mark'),
        'a nonzero value should not emit the zero marker',
    );
});

const SVG_PATH_DATA = /^[MmZzLlHhVvCcSsQqTtAa0-9 .,eE+-]+$/;

test('empty bipolar gauge path data is SVG grammar', () => {
    const html = buildBipolarGaugeSvg(
        {
            value: undefined,
            label: 'Baseline',
            display: 'unset',
        },
        {
            value: undefined,
            label: 'Actual',
            display: 'none yet',
        },
        'gauge-grammar', 'small',
    ).toString();
    const paths = [
        ...html.matchAll(/\bd="([^"]*)"/g),
    ].map(m => m[1]!);
    assert.ok(paths.length >= 2);
    for (const d of paths) {
        assert.match(d, SVG_PATH_DATA, 'path d ' + d);
    }
});
