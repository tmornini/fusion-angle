import { assertStrictEquals } from '@std/assert';
import {
    subscribeEventListener,
} from '../web-app/app/adapters/event-listener.ts';

Deno.test('subscribeEventListener adds; the returned fn removes',
    () => {
        const target = new EventTarget();
        let fired = 0;
        const unsubscribe = subscribeEventListener(
            target, 'ping', () => { fired += 1; },
        );
        target.dispatchEvent(new Event('ping'));
        assertStrictEquals(fired, 1);
        unsubscribe();
        target.dispatchEvent(new Event('ping'));
        assertStrictEquals(fired, 1);
    });
