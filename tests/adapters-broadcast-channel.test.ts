import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    tablesFromMessage,
} from '../web-app/app/adapters/broadcast-channel.ts';

// The cross-tab wire shape is validated at the adapter —
// a malformed message throws instead of handing subscribers
// a corrupt table list.

test('a well-formed message yields its tables', () => {
    assert.deepEqual(
        tablesFromMessage({ tables: ['states', 'ideas'] }),
        ['states', 'ideas'],
    );
});

test('an empty tables list is valid', () => {
    assert.deepEqual(
        tablesFromMessage({ tables: [] }), [],
    );
});

test('a missing tables key throws', () => {
    assert.throws(
        () => tablesFromMessage({}),
        /malformed cross-tab tables message/,
    );
});

test('a non-array tables value throws', () => {
    assert.throws(
        () => tablesFromMessage({ tables: 'states' }),
        /malformed cross-tab tables message/,
    );
});

test('non-string array elements throw', () => {
    assert.throws(
        () => tablesFromMessage({ tables: ['states', 7] }),
        /malformed cross-tab tables message/,
    );
});

test('a null message throws', () => {
    assert.throws(
        () => tablesFromMessage(null),
        /malformed cross-tab tables message/,
    );
});
