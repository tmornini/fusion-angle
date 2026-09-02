import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    createPageAbort,
    bindPageListeners,
} from '../web-app/app/page-lifecycle.ts';

Deno.test('createPageAbort pairs a controller with its signal', () => {
    const { pageAbort, signal } = createPageAbort();
    assertStrictEquals(signal, pageAbort.signal);
    assertStrictEquals(signal.aborted, false);
    pageAbort.abort();
    assertStrictEquals(signal.aborted, true);
});

Deno.test('bindPageListeners binds each handler with the signal',
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
        assertEquals(
            calls.map(c => c.type), ['click', 'input']);
        assertStrictEquals(calls[0]?.signal, signal);
    });
