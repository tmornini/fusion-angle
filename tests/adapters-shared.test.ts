import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createFetchContext,
    getUserMap,
    userName,
    getCurrentUserRow,
    getCompanyRow,
} from '../web-app/app/adapters/shared.ts';
import { User } from '../api/types.ts';

function buildUserRow(
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
        role: 'product_manager',
        availability: 80,
        is_active: 1 as 0 | 1,
        bio: '',
        department: 'Product',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
    };
}

test('userName returns fullName for known id', () => {
    const map = new Map<string, User>([
        ['u1', new User(
            buildUserRow('u1', 'Alice', 'Adams'),
        )],
    ]);
    assert.equal(
        userName(map, 'u1'),
        'Alice Adams',
    );
});

test('userName throws for unknown id', () => {
    const map = new Map<string, User>();
    assert.throws(
        () => userName(map, 'missing'),
        /unknown user/,
    );
});

test('getUserMap fetches users via adapter', async () => {
    const db = new MemoryDbAdapter();
    await db.users.put('u1', buildUserRow(
        'u1', 'Alice', 'Adams',
    ));
    const ctx = createFetchContext(db);
    const map = await getUserMap(ctx);
    assert.equal(map.size, 1);
    assert.equal(
        map.get('u1')?.fullName(),
        'Alice Adams',
    );
});

test('FetchContext memoizes user map across calls', async () => {
    const db = new MemoryDbAdapter();
    await db.users.put('u1', buildUserRow(
        'u1', 'Alice', 'Adams',
    ));
    const ctx = createFetchContext(db);
    const m1 = await ctx.getUserMap();
    // Mutate underlying data after first fetch
    await db.users.put('u2', buildUserRow(
        'u2', 'Bob', 'Brown',
    ));
    const m2 = await ctx.getUserMap();
    // Same Promise → same Map → m2 reflects ONLY first fetch
    assert.equal(m1, m2);
    assert.equal(m1.size, 1);
});

test('Fresh ctx re-fetches each call', async () => {
    const db = new MemoryDbAdapter();
    await db.users.put('u1', buildUserRow(
        'u1', 'Alice', 'Adams',
    ));
    const m1 = await createFetchContext(db)
        .getUserMap();
    await db.users.put('u2', buildUserRow(
        'u2', 'Bob', 'Brown',
    ));
    const m2 = await createFetchContext(db)
        .getUserMap();
    assert.notEqual(m1, m2);
    assert.equal(m1.size, 1);
    assert.equal(m2.size, 2);
});

test('getCurrentUserRow returns UserEntity', async () => {
    const db = new MemoryDbAdapter();
    await db.users.put('current', {
        ...buildUserRow(
            'current', 'Alice', 'Adams',
        ),
    });
    const row = await getCurrentUserRow(
        createFetchContext(db),
    );
    assert.equal(row.first_name, 'Alice');
    assert.equal(row.last_name, 'Adams');
});

test('getCompanyRow returns CompanyEntity', async () => {
    const db = new MemoryDbAdapter();
    await db.company.put({
        name: 'Acme Corp',
        domain: 'acme.example',
    });
    const row = await getCompanyRow(
        createFetchContext(db),
    );
    assert.equal(row.name, 'Acme Corp');
    assert.equal(row.domain, 'acme.example');
});

test(
    'FetchContext memoizes currentUser'
    + ' across calls',
    async () => {
        const db = new MemoryDbAdapter();
        await db.users.put('current', {
            ...buildUserRow(
                'current', 'Alice', 'Adams',
            ),
        });
        const ctx = createFetchContext(db);
        const u1 = await ctx.getCurrentUser();
        await db.users.put('current', {
            ...buildUserRow(
                'current', 'Renamed', 'Adams',
            ),
        });
        const u2 = await ctx.getCurrentUser();
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
        await db.users.put('u1', buildUserRow(
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
