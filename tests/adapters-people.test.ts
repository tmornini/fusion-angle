import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createFetchContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getPeople,
    getPersonRows,
    featuredPeople,
    putPersonStatus,
    subscribePersonChanges,
} from '../web-app/app/adapters/people.ts';
import {
    Person,
    jsonArrayField,
    jsonObjectField,
} from '../api/types.ts';

function buildPersonRow(args: {
    id: string;
    first?: string;
    last?: string;
    department?: string;
    status?: 'active' | 'pending' | 'deactivated';
}) {
    const first = args.first ?? 'Alice';
    const last = args.last ?? 'Adams';
    return {
        id: args.id,
        first_name: first,
        last_name: last,
        email:
            `${first}@example.com`.toLowerCase(),
        title: 'product_manager',
        department: args.department ?? 'Product',
        status: args.status ?? 'active',
        strengths: jsonArrayField([]),
        team_dimensions:
            jsonObjectField({ driver: 50 }),
        phone: '',
        bio: '',
    };
}

async function seed(
    db: MemoryDbAdapter,
    rows: Array<ReturnType<typeof buildPersonRow>>,
) {
    for (const row of rows) {
        const { id, ...rest } = row;
        await db.people.put(id, rest);
    }
}

test('getPeople returns all people', async () => {
    const db = new MemoryDbAdapter();
    await seed(db, [
        buildPersonRow({ id: 'u1' }),
        buildPersonRow({ id: 'u2', first: 'Bob' }),
    ]);
    const ctx = createFetchContext(db);
    const people = await getPeople(ctx);
    assert.equal(people.length, 2);
    assert.ok(people[0] instanceof Person);
});

test(
    'getPersonRows returns raw entities',
    async () => {
        const db = new MemoryDbAdapter();
        await seed(db, [
            buildPersonRow({ id: 'u1' }),
        ]);
        const ctx = createFetchContext(db);
        const rows = await getPersonRows(ctx);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].id, 'u1');
        assert.equal(
            rows[0].first_name, 'Alice',
        );
    },
);

test(
    'featuredPeople filters out people'
    + ' missing department',
    () => {
        const populated = new Person(
            buildPersonRow({ id: 'u1' }),
        );
        const noDept = new Person(buildPersonRow({
            id: 'u2',
            department: '',
        }));
        const result = featuredPeople([
            populated, noDept,
        ]);
        assert.equal(result.length, 1);
        assert.equal(
            result[0].idForLink(), 'u1',
        );
    },
);

test(
    'featuredPeople slices to 6',
    () => {
        const people = Array.from(
            { length: 10 },
            (_, i) => new Person(buildPersonRow({
                id: `u${i}`,
            })),
        );
        const result = featuredPeople(people);
        assert.equal(result.length, 6);
    },
);

test(
    'putPersonStatus flips status on the row',
    async () => {
        const db = new MemoryDbAdapter();
        await seed(db, [
            buildPersonRow({
                id: 'u1', status: 'active',
            }),
        ]);
        const ctx = createFetchContext(db);
        await putPersonStatus(
            ctx, 'u1', 'deactivated',
        );
        const row = await db.people.getById('u1');
        assert.equal(row.status, 'deactivated');
    },
);

test(
    'putPersonStatus notifies personChanges',
    async () => {
        const db = new MemoryDbAdapter();
        await seed(db, [
            buildPersonRow({ id: 'u1' }),
        ]);
        let fired = 0;
        const unsub = subscribePersonChanges(
            () => { fired += 1; },
        );
        try {
            await putPersonStatus(
                createFetchContext(db),
                'u1', 'deactivated',
            );
        } finally {
            unsub();
        }
        assert.equal(fired, 1);
    },
);

test(
    'putPersonStatus throws on unknown person',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createFetchContext(db);
        await assert.rejects(
            () => putPersonStatus(
                ctx, 'missing', 'active',
            ),
            /unknown person missing/,
        );
    },
);
