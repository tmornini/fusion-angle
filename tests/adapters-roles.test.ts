import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getRoles,
    getRole,
    getPersistedRoles,
    putRole,
    deleteRole,
    getMembersOfRole,
    getRolesForPerson,
    addMember,
    removeMember,
    subscribeRoleChanges,
    subscribeMembershipChanges,
} from '../web-app/app/adapters/roles.ts';
import {
    Role,
    jsonArrayField,
    jsonObjectField,
    nowUtc,
} from '../api/types.ts';

function buildPersonRow(args: {
    id: string;
    first?: string;
}) {
    const first = args.first ?? 'Alice';
    return {
        id: args.id,
        first_name: first,
        last_name: 'Test',
        email:
            `${first}@example.com`.toLowerCase(),
        title: 'Engineer',
        department: 'Eng',
        status: 'active' as const,
        strengths: jsonArrayField([]),
        team_dimensions:
            jsonObjectField({ driver: 50 }),
        phone: '',
        bio: '',
    };
}

async function seedPerson(
    db: MemoryDbAdapter,
    id: string,
    first?: string,
) {
    const row = buildPersonRow({ id, first });
    const { id: rowId, ...rest } = row;
    await db.people.put(rowId, rest);
}

async function seedRole(
    db: MemoryDbAdapter,
    id: string,
    name: string,
) {
    await db.roles.put(id, {
        name,
        description: '',
        created_at: nowUtc(),
    });
}

test(
    'getRoles returns the persisted roles',
    async () => {
        const db = new MemoryDbAdapter();
        await seedRole(
            db, 'r-eng', 'Engineering',
        );
        await seedRole(db, 'r-qa', 'QA');
        const ctx = createRequestContext(db);
        const roles = await getRoles(ctx);
        assert.equal(roles.length, 2);
        assert.ok(roles[0] instanceof Role);
    },
);

test(
    'getRole throws on unknown id',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createRequestContext(db);
        await assert.rejects(
            () => getRole(ctx, 'missing'),
            /unknown role missing/,
        );
    },
);

test(
    'putRole creates a role; getRole returns it',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createRequestContext(db);
        await putRole(ctx, 'r-1', {
            name: 'Engineering',
            description: 'Builds things.',
            created_at: nowUtc(),
        });
        const fresh = createRequestContext(db);
        const role = await getRole(fresh, 'r-1');
        assert.equal(
            role.nameText(), 'Engineering',
        );
    },
);

test(
    'addMember, then getMembersOfRole returns'
    + ' the person',
    async () => {
        const db = new MemoryDbAdapter();
        await seedPerson(db, 'p-1', 'Alice');
        await seedRole(
            db, 'r-eng', 'Engineering',
        );
        const ctx = createRequestContext(db);
        await addMember(ctx, 'r-eng', 'p-1');
        const fresh = createRequestContext(db);
        const members = await getMembersOfRole(
            fresh, 'r-eng',
        );
        assert.equal(members.length, 1);
        assert.equal(
            members[0].person.idForLink(), 'p-1',
        );
        assert.equal(
            members[0].role.idForLink(), 'r-eng',
        );
    },
);

test(
    'removeMember removes the person from'
    + ' the role',
    async () => {
        const db = new MemoryDbAdapter();
        await seedPerson(db, 'p-1');
        await seedRole(db, 'r-eng', 'Engineering');
        const ctx = createRequestContext(db);
        await addMember(ctx, 'r-eng', 'p-1');
        const before = await getMembersOfRole(
            createRequestContext(db), 'r-eng',
        );
        assert.equal(before.length, 1);
        await removeMember(
            createRequestContext(db),
            before[0].membershipId,
        );
        const after = await getMembersOfRole(
            createRequestContext(db), 'r-eng',
        );
        assert.equal(after.length, 0);
    },
);

test(
    'deleteRole cascades to membership rows',
    async () => {
        const db = new MemoryDbAdapter();
        await seedPerson(db, 'p-1');
        await seedPerson(db, 'p-2', 'Bob');
        await seedRole(db, 'r-eng', 'Engineering');
        const ctx = createRequestContext(db);
        await addMember(ctx, 'r-eng', 'p-1');
        await addMember(
            createRequestContext(db),
            'r-eng', 'p-2',
        );
        await deleteRole(
            createRequestContext(db), 'r-eng',
        );
        const memberships = await db
            .roleMemberships.getAll();
        assert.equal(memberships.length, 0);
        await assert.rejects(
            () => getRole(
                createRequestContext(db), 'r-eng',
            ),
        );
    },
);

test(
    'getRolesForPerson reflects every role'
    + ' the person joins (persisted slice)',
    async () => {
        const db = new MemoryDbAdapter();
        await seedPerson(db, 'p-1');
        await seedRole(db, 'r-eng', 'Engineering');
        await seedRole(db, 'r-qa', 'QA');
        const ctx = createRequestContext(db);
        await addMember(ctx, 'r-eng', 'p-1');
        await addMember(
            createRequestContext(db),
            'r-qa', 'p-1',
        );
        const roles = await getRolesForPerson(
            createRequestContext(db), 'p-1',
        );
        const persistedNames = roles
            .filter(r => r.idForLink()
                === 'r-eng'
                || r.idForLink() === 'r-qa')
            .map(r => r.nameText())
            .sort();
        assert.deepEqual(
            persistedNames,
            ['Engineering', 'QA'],
        );
    },
);

test(
    'addMember rejects an unknown role id',
    async () => {
        const db = new MemoryDbAdapter();
        await seedPerson(db, 'p-1');
        const ctx = createRequestContext(db);
        await assert.rejects(
            () => addMember(
                ctx, 'no-role', 'p-1',
            ),
            /unknown role no-role/,
        );
    },
);

test(
    'addMember rejects an unknown person id',
    async () => {
        const db = new MemoryDbAdapter();
        await seedRole(db, 'r-eng', 'Engineering');
        const ctx = createRequestContext(db);
        await assert.rejects(
            () => addMember(
                ctx, 'r-eng', 'no-person',
            ),
            /unknown person no-person/,
        );
    },
);

test(
    'subscribeRoleChanges fires after putRole'
    + ' and deleteRole',
    async () => {
        const db = new MemoryDbAdapter();
        let count = 0;
        const unsubscribe =
            subscribeRoleChanges(() => {
                count++;
            });
        await putRole(
            createRequestContext(db), 'r-1', {
                name: 'Engineering',
                description: '',
                created_at: nowUtc(),
            },
        );
        await deleteRole(
            createRequestContext(db), 'r-1',
        );
        unsubscribe();
        assert.ok(
            count >= 2,
            'expected at least 2 notifications',
        );
    },
);

test(
    'getPersistedRoles returns only persisted'
    + ' roles, not user-private',
    async () => {
        const db = new MemoryDbAdapter();
        await seedPerson(db, 'p-1', 'Alice');
        await seedPerson(db, 'p-2', 'Bob');
        await seedRole(db, 'r-eng', 'Engineering');
        const ctx = createRequestContext(db);
        const persisted =
            await getPersistedRoles(ctx);
        assert.equal(persisted.length, 1);
        assert.equal(
            persisted[0].nameText(),
            'Engineering',
        );
    },
);

test(
    'getPersistedRoles returns empty when no'
    + ' roles exist even with people present',
    async () => {
        const db = new MemoryDbAdapter();
        await seedPerson(db, 'p-1', 'Alice');
        await seedPerson(db, 'p-2', 'Bob');
        const ctx = createRequestContext(db);
        const persisted =
            await getPersistedRoles(ctx);
        assert.equal(persisted.length, 0);
    },
);

test(
    'subscribeMembershipChanges fires after'
    + ' addMember and removeMember',
    async () => {
        const db = new MemoryDbAdapter();
        await seedPerson(db, 'p-1');
        await seedRole(db, 'r-eng', 'Engineering');
        let count = 0;
        const unsubscribe =
            subscribeMembershipChanges(() => {
                count++;
            });
        await addMember(
            createRequestContext(db),
            'r-eng', 'p-1',
        );
        const members = await getMembersOfRole(
            createRequestContext(db), 'r-eng',
        );
        await removeMember(
            createRequestContext(db),
            members[0].membershipId,
        );
        unsubscribe();
        assert.ok(
            count >= 2,
            'expected at least 2 notifications',
        );
    },
);
