import { assertStrictEquals } from '@std/assert';
import {
    postNotificationEvent,
    subscribeNotificationEvents,
} from '../web-app/app/adapters/broadcast-channel.ts';

// The divorce point is inert without a browser: no channel
// is created in Node, so the test runner never hangs on an
// open handle and neither call throws. The real cross-tab
// behavior is a browser regression case (TEST-PLAN.md).
Deno.test(
    'postNotificationEvent is inert without a browser',
    () => {
        postNotificationEvent({ kind: 'full' });
    },
);

Deno.test(
    'subscribeNotificationEvents returns a no-op unsubscribe',
    () => {
        const unsubscribe = subscribeNotificationEvents(
            () => {},
        );
        assertStrictEquals(typeof unsubscribe, 'function');
        unsubscribe();
    },
);
