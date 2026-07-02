import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    postNotificationEvent,
    subscribeNotificationEvents,
} from '../web-app/app/adapters/broadcast-channel.ts';

// The divorce point is inert without a browser: no channel
// is created in Node, so the test runner never hangs on an
// open handle and neither call throws. The real cross-tab
// behavior is a browser regression case (TEST-PLAN.md).
test(
    'postNotificationEvent is inert without a browser',
    () => {
        assert.doesNotThrow(
            () => postNotificationEvent({ kind: 'full' }),
        );
    },
);

test(
    'subscribeNotificationEvents returns a no-op unsubscribe',
    () => {
        const unsubscribe = subscribeNotificationEvents(
            () => {},
        );
        assert.equal(typeof unsubscribe, 'function');
        assert.doesNotThrow(() => unsubscribe());
    },
);
