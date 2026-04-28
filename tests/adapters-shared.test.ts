import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    initApi,
    resetApi,
} from '../api/api.ts';
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

function setupMemDb(): MemoryDbAdapter {
    const db = new MemoryDbAdapter();
    resetApi();
    initApi(db);
    return db;
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
    const db = setupMemDb();
    await db.users.put('u1', buildUserRow(
        'u1', 'Alice', 'Adams',
    ));
    const map = await getUserMap();
    assert.equal(map.size, 1);
    assert.equal(
        map.get('u1')?.fullName(),
        'Alice Adams',
    );
});

test('FetchContext memoizes user map across calls', async () => {
    const db = setupMemDb();
    await db.users.put('u1', buildUserRow(
        'u1', 'Alice', 'Adams',
    ));
    const ctx = createFetchContext();
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

test('Without ctx, getUserMap re-fetches each call', async () => {
    const db = setupMemDb();
    await db.users.put('u1', buildUserRow(
        'u1', 'Alice', 'Adams',
    ));
    const m1 = await getUserMap();
    await db.users.put('u2', buildUserRow(
        'u2', 'Bob', 'Brown',
    ));
    const m2 = await getUserMap();
    assert.notEqual(m1, m2);
    assert.equal(m1.size, 1);
    assert.equal(m2.size, 2);
});

test('getCurrentUserRow returns UserEntity', async () => {
    const db = setupMemDb();
    await db.users.put('current', {
        ...buildUserRow(
            'current', 'Alice', 'Adams',
        ),
    });
    const row = await getCurrentUserRow();
    assert.equal(row.first_name, 'Alice');
    assert.equal(row.last_name, 'Adams');
});

test('getCompanyRow returns CompanyEntity', async () => {
    const db = setupMemDb();
    await db.company.put({
        name: 'Acme Corp',
        domain: 'acme.example',
    });
    const row = await getCompanyRow();
    assert.equal(row.name, 'Acme Corp');
    assert.equal(row.domain, 'acme.example');
});

test(
    'FetchContext memoizes currentUser'
    + ' across calls',
    async () => {
        const db = setupMemDb();
        await db.users.put('current', {
            ...buildUserRow(
                'current', 'Alice', 'Adams',
            ),
        });
        const ctx = createFetchContext();
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
        const a = createFetchContext();
        const b = createFetchContext();
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
        const db = setupMemDb();
        await db.users.put('u1', buildUserRow(
            'u1', 'Alice', 'Adams',
        ));
        const ctx = createFetchContext();
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
