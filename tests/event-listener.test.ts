import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    subscribeEventListener,
} from '../web-app/app/adapters/event-listener.ts';

test('subscribeEventListener adds; the returned fn removes',
    () => {
        const target = new EventTarget();
        let fired = 0;
        const unsubscribe = subscribeEventListener(
            target, 'ping', () => { fired += 1; },
        );
        target.dispatchEvent(new Event('ping'));
        assert.equal(fired, 1);
        unsubscribe();
        target.dispatchEvent(new Event('ping'));
        assert.equal(fired, 1);
    });
