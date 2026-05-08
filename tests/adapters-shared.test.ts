import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createFetchContext,
    getPersonMap,
    personName,
    getCurrentPersonRow,
} from '../web-app/app/adapters/shared.ts';
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
    const ctx = createFetchContext(db);
    const map = await getPersonMap(ctx);
    assert.equal(map.size, 1);
    assert.equal(
        map.get('u1')?.fullName(),
        'Alice Adams',
    );
});

test('FetchContext memoizes person map across calls', async () => {
    const db = new MemoryDbAdapter();
    await db.people.put('u1', buildPersonRow(
        'u1', 'Alice', 'Adams',
    ));
    const ctx = createFetchContext(db);
    const m1 = await ctx.getPersonMap();
    // Mutate underlying data after first fetch
    await db.people.put('u2', buildPersonRow(
        'u2', 'Bob', 'Brown',
    ));
    const m2 = await ctx.getPersonMap();
    // Same Promise → same Map → m2 reflects ONLY first fetch
    assert.equal(m1, m2);
    assert.equal(m1.size, 1);
});

test('Fresh ctx re-fetches each call', async () => {
    const db = new MemoryDbAdapter();
    await db.people.put('u1', buildPersonRow(
        'u1', 'Alice', 'Adams',
    ));
    const m1 = await createFetchContext(db)
        .getPersonMap();
    await db.people.put('u2', buildPersonRow(
        'u2', 'Bob', 'Brown',
    ));
    const m2 = await createFetchContext(db)
        .getPersonMap();
    assert.notEqual(m1, m2);
    assert.equal(m1.size, 1);
    assert.equal(m2.size, 2);
});

test('getCurrentPersonRow returns PersonEntity', async () => {
    const db = new MemoryDbAdapter();
    await db.people.put('current', {
        ...buildPersonRow(
            'current', 'Alice', 'Adams',
        ),
    });
    const row = await getCurrentPersonRow(
        createFetchContext(db),
    );
    assert.equal(row.first_name, 'Alice');
    assert.equal(row.last_name, 'Adams');
});

test(
    'FetchContext memoizes currentPerson'
    + ' across calls',
    async () => {
        const db = new MemoryDbAdapter();
        await db.people.put('current', {
            ...buildPersonRow(
                'current', 'Alice', 'Adams',
            ),
        });
        const ctx = createFetchContext(db);
        const u1 = await ctx.getCurrentPerson();
        await db.people.put('current', {
            ...buildPersonRow(
                'current', 'Renamed', 'Adams',
            ),
        });
        const u2 = await ctx.getCurrentPerson();
        // Same Promise → first snapshot stays
        assert.equal(u1, u2);
        assert.equal(u1.first_name, 'Alice');
    },
);

test(
    'FetchContext requestId is stable'
    + ' and unique',
    () => {
        const db = new MemoryDbAdapter();
        const a = createFetchContext(db);
        const b = createFetchContext(db);
        assert.equal(
            a.requestId, a.requestId,
        );
        assert.notEqual(
            a.requestId, b.requestId,
        );
        assert.ok(a.requestId.length > 0);
    },
);

test(
    'FetchContext memoizes idea, project,'
    + ' and flow row fetches',
    async () => {
        const db = new MemoryDbAdapter();
        await db.people.put('u1', buildPersonRow(
            'u1', 'Alice', 'Adams',
        ));
        const ctx = createFetchContext(db);
        const ideas1 = await ctx.getIdeaRows();
        const ideas2 = await ctx.getIdeaRows();
        assert.equal(ideas1, ideas2);

        const projects1 =
            await ctx.getProjectRows();
        const projects2 =
            await ctx.getProjectRows();
        assert.equal(projects1, projects2);

        const flows1 = await ctx.getFlowRows();
        const flows2 = await ctx.getFlowRows();
        assert.equal(flows1, flows2);
    },
);

test(
    'FetchContext memoizes person rows',
    async () => {
        const db = new MemoryDbAdapter();
        await db.people.put('u1', buildPersonRow(
            'u1', 'Alice', 'Adams',
        ));
        const ctx = createFetchContext(db);
        const rows1 = await ctx.getPersonRows();
        await db.people.put('u2', buildPersonRow(
            'u2', 'Bob', 'Brown',
        ));
        const rows2 = await ctx.getPersonRows();
        assert.equal(rows1, rows2);
        assert.equal(rows1.length, 1);
    },
);

test(
    'getPersonRows and getPersonMap share one'
    + ' underlying fetch',
    async () => {
        const db = new MemoryDbAdapter();
        await db.people.put('u1', buildPersonRow(
            'u1', 'Alice', 'Adams',
        ));
        const ctx = createFetchContext(db);
        const rows1 = await ctx.getPersonRows();
        // If getPersonMap re-fetches, the post-mutation
        // state would leak into the map.
        await db.people.put('u2', buildPersonRow(
            'u2', 'Bob', 'Brown',
        ));
        const map = await ctx.getPersonMap();
        assert.equal(map.size, rows1.length);
        assert.equal(map.size, 1);
    },
);
