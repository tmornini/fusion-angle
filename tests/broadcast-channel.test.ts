import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    postTablesChanged,
    subscribeTablesChanged,
} from '../web-app/app/adapters/broadcast-channel.ts';

// The divorce point is inert without a browser: no channel
// is created in Node, so the test runner never hangs on an
// open handle and neither call throws. The real cross-tab
// behavior is a browser regression case (TEST-PLAN.md).
test(
    'postTablesChanged is inert without a browser',
    () => {
        assert.doesNotThrow(
            () => postTablesChanged(['ideas']),
        );
    },
);

test(
    'subscribeTablesChanged returns a no-op unsubscribe',
    () => {
        const unsubscribe = subscribeTablesChanged(
            () => {},
        );
        assert.equal(typeof unsubscribe, 'function');
        assert.doesNotThrow(() => unsubscribe());
    },
);
