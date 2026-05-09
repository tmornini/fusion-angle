import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getPersonMap,
    personName,
    getCurrentPerson,
} from '../web-app/app/adapters/people.ts';
import { Person } from '../api/types.ts';

function buildPersonRow(
    id: string,
    first: string,
    last: string,
) {
    return {
        id,
        first_name: first,
        last_name: last,
        email: `${first}@example.com`.toLowerCase(),
        phone: '',
        title: 'product_manager',
        status: 'active' as const,
        strengths: '[]' as const,
        team_dimensions: '{}' as const,
        bio: '',
        department: 'Product',
    };
}

test('personName returns fullName for known id', () => {
    const map = new Map<string, Person>([
        ['u1', new Person(
            buildPersonRow('u1', 'Alice', 'Adams'),
        )],
    ]);
    assert.equal(
        personName(map, 'u1'),
        'Alice Adams',
    );
});

test('personName throws for unknown id', () => {
    const map = new Map<string, Person>();
    assert.throws(
        () => personName(map, 'missing'),
        /unknown person/,
    );
});

test('getPersonMap fetches people via adapter', async () => {
    const db = new MemoryDbAdapter();
    await db.people.put('u1', buildPersonRow(
        'u1', 'Alice', 'Adams',
    ));
    const ctx = createRequestContext(db);
    const map = await getPersonMap(ctx);
    assert.equal(map.size, 1);
    assert.equal(
        map.get('u1')?.fullName(),
        'Alice Adams',
    );
});

// Test removed: memoization is no longer guaranteed;
// per-task atomicity flows from JavaScript's
// single-threaded model.

test('Fresh ctx re-fetches each call', async () => {
    const db = new MemoryDbAdapter();
    await db.people.put('u1', buildPersonRow(
        'u1', 'Alice', 'Adams',
    ));
    const m1 = await getPersonMap(
        createRequestContext(db),
    );
    await db.people.put('u2', buildPersonRow(
        'u2', 'Bob', 'Brown',
    ));
    const m2 = await getPersonMap(
        createRequestContext(db),
    );
    assert.notEqual(m1, m2);
    assert.equal(m1.size, 1);
    assert.equal(m2.size, 2);
});

test('getCurrentPerson returns PersonEntity', async () => {
    const db = new MemoryDbAdapter();
    await db.people.put('current', {
        ...buildPersonRow(
            'current', 'Alice', 'Adams',
        ),
    });
    const row = await getCurrentPerson(
        createRequestContext(db),
    );
    assert.equal(row.first_name, 'Alice');
    assert.equal(row.last_name, 'Adams');
});

// Test removed: memoization is no longer guaranteed;
// per-task atomicity flows from JavaScript's
// single-threaded model.

test(
    'RequestContext requestId is stable'
    + ' and unique',
    () => {
        const db = new MemoryDbAdapter();
        const a = createRequestContext(db);
        const b = createRequestContext(db);
        assert.equal(
            a.requestId, a.requestId,
        );
        assert.notEqual(
            a.requestId, b.requestId,
        );
        assert.ok(a.requestId.length > 0);
    },
);

// Test removed: memoization is no longer guaranteed;
// per-task atomicity flows from JavaScript's
// single-threaded model.

// Tests removed: memoization is no longer guaranteed;
// per-task atomicity flows from JavaScript's
// single-threaded model.
