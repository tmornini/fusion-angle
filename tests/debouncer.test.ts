import { test } from 'node:test';
import { strict as assert } from 'node:assert';

// debouncer.ts → logger.ts → preferences.ts reads
// localStorage, which is absent in Node. Stub it
// before any log.* call fires.
// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: (_key: string) => null,
    setItem: () => {},
};

import {
    Debouncer,
} from '../web-app/app/debouncer.ts';

test(
    'schedule waits the delay; the last scheduled'
    + ' save wins the burst',
    (t) => {
        t.mock.timers.enable({
            apis: ['setTimeout'],
        });
        const d = new Debouncer(800);
        const ran: string[] = [];
        d.schedule(() => ran.push('first'));
        d.schedule(() => ran.push('second'));
        t.mock.timers.tick(799);
        assert.deepEqual(ran, []);
        t.mock.timers.tick(1);
        assert.deepEqual(ran, ['second']);
    },
);

test(
    'flush runs the pending save immediately and'
    + ' cancels the timer — no double fire',
    (t) => {
        t.mock.timers.enable({
            apis: ['setTimeout'],
        });
        const d = new Debouncer(800);
        let runs = 0;
        d.schedule(() => { runs += 1; });
        d.flush();
        assert.equal(runs, 1);
        t.mock.timers.tick(800);
        assert.equal(runs, 1);
    },
);

test(
    'flush with nothing pending is a no-op',
    (t) => {
        t.mock.timers.enable({
            apis: ['setTimeout'],
        });
        const d = new Debouncer(800);
        let runs = 0;
        // Empty flush invents no save and leaves the
        // debouncer ready for a later schedule.
        d.flush();
        assert.equal(runs, 0);
        d.schedule(() => { runs += 1; });
        t.mock.timers.tick(800);
        assert.equal(runs, 1);
    },
);

test(
    'a fired save clears pending — a later flush'
    + ' does not replay it',
    (t) => {
        t.mock.timers.enable({
            apis: ['setTimeout'],
        });
        const d = new Debouncer(800);
        let runs = 0;
        d.schedule(() => { runs += 1; });
        t.mock.timers.tick(800);
        assert.equal(runs, 1);
        d.flush();
        assert.equal(runs, 1);
    },
);

test(
    'schedule after a fire starts a fresh burst',
    (t) => {
        t.mock.timers.enable({
            apis: ['setTimeout'],
        });
        const d = new Debouncer(800);
        const ran: string[] = [];
        d.schedule(() => ran.push('a'));
        t.mock.timers.tick(800);
        d.schedule(() => ran.push('b'));
        t.mock.timers.tick(800);
        assert.deepEqual(ran, ['a', 'b']);
    },
);

test(
    'isPending tracks a scheduled save until fire'
    + ' or flush',
    (t) => {
        t.mock.timers.enable({
            apis: ['setTimeout'],
        });
        const d = new Debouncer(800);
        assert.equal(d.isPending(), false);
        d.schedule(() => {});
        assert.equal(d.isPending(), true);
        t.mock.timers.tick(800);
        assert.equal(d.isPending(), false);
        d.schedule(() => {});
        assert.equal(d.isPending(), true);
        d.flush();
        assert.equal(d.isPending(), false);
    },
);
