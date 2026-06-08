import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    createPageAbort,
    bindPageListeners,
} from '../web-app/app/page-lifecycle.ts';

test('createPageAbort pairs a controller with its signal', () => {
    const { pageAbort, signal } = createPageAbort();
    assert.equal(signal, pageAbort.signal);
    assert.equal(signal.aborted, false);
    pageAbort.abort();
    assert.equal(signal.aborted, true);
});

test('bindPageListeners binds each handler with the signal',
    () => {
        const calls: { type: string; signal: unknown }[] = [];
        const target = {
            addEventListener(
                type: string,
                _h: unknown,
                opts: { signal: unknown },
            ) {
                calls.push({ type, signal: opts.signal });
            },
        } as unknown as HTMLElement;
        const { signal } = createPageAbort();
        bindPageListeners(target, {
            click: () => {},
            input: () => {},
        }, signal);
        assert.deepEqual(
            calls.map(c => c.type), ['click', 'input']);
        assert.equal(calls[0]?.signal, signal);
    });
