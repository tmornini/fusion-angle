import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getCrews,
    getCrew,
    putCrew,
    deleteCrew,
    getRolesInCrew,
    getCrewsContainingRole,
    getMembersOfCrew,
    addRoleToCrew,
    removeRoleFromCrew,
} from '../web-app/app/adapters/crews.ts';
import {
    addMember,
    isUserPrivateRole,
} from '../web-app/app/adapters/roles.ts';
import {
    userPrivateRoleId,
} from '../api/types.ts';
import {
    Crew,
    jsonArrayField,
    jsonObjectField,
    nowUtc,
} from '../api/types.ts';

async function seedCrew(
    db: MemoryDbAdapter,
    id: string,
    name: string,
): Promise<void> {
    await db.crews.put(id, {
        name,
        description: '',
        created_at: nowUtc(),
    });
}

async function seedRole(
    db: MemoryDbAdapter,
    id: string,
    name: string,
): Promise<void> {
    await db.roles.put(id, {
        name,
        description: '',
        created_at: nowUtc(),
    });
}

async function seedPerson(
    db: MemoryDbAdapter,
    id: string,
    first: string = 'Alice',
): Promise<void> {
    await db.people.put(id, {
        first_name: first,
        last_name: 'Test',
        email:
            `${first}@example.com`.toLowerCase(),
        title: 'Engineer',
        department: 'Eng',
        status: 'active',
        strengths: jsonArrayField([]),
        team_dimensions:
            jsonObjectField({ driver: 50 }),
        phone: '',
        bio: '',
    });
}

test(
    'putCrew, then getCrew returns the'
    + ' persisted crew',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createRequestContext(db);
        await putCrew(ctx, 'c-1', {
            name: 'Delivery Squad',
            description: '',
            created_at: nowUtc(),
        });
        const crew = await getCrew(
            createRequestContext(db), 'c-1',
        );
        assert.equal(
            crew.nameText(), 'Delivery Squad',
        );
        assert.ok(crew instanceof Crew);
    },
);

test(
    'getCrews returns persisted crews',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCrew(db, 'c-1', 'Squad A');
        await seedCrew(db, 'c-2', 'Squad B');
        const ctx = createRequestContext(db);
        const crews = await getCrews(ctx);
        assert.equal(crews.length, 2);
    },
);

test(
    'addRoleToCrew, then getRolesInCrew'
    + ' returns the role',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCrew(db, 'c-1', 'Squad');
        await seedRole(db, 'r-eng', 'Engineering');
        const ctx = createRequestContext(db);
        await addRoleToCrew(ctx, 'c-1', 'r-eng');
        const roles = await getRolesInCrew(
            createRequestContext(db), 'c-1',
        );
        assert.equal(roles.length, 1);
        assert.equal(
            roles[0].idForLink(), 'r-eng',
        );
    },
);

test(
    'getCrewsContainingRole returns every'
    + ' crew that holds the role',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCrew(db, 'c-1', 'Squad A');
        await seedCrew(db, 'c-2', 'Squad B');
        await seedRole(db, 'r-eng', 'Engineering');
        await addRoleToCrew(
            createRequestContext(db),
            'c-1', 'r-eng',
        );
        await addRoleToCrew(
            createRequestContext(db),
            'c-2', 'r-eng',
        );
        const crews = await getCrewsContainingRole(
            createRequestContext(db), 'r-eng',
        );
        assert.equal(crews.length, 2);
    },
);

test(
    'removeRoleFromCrew removes the role',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCrew(db, 'c-1', 'Squad');
        await seedRole(db, 'r-eng', 'Engineering');
        await addRoleToCrew(
            createRequestContext(db),
            'c-1', 'r-eng',
        );
        const before =
            await db.crewRoleMemberships
                .getAll();
        assert.equal(before.length, 1);
        await removeRoleFromCrew(
            createRequestContext(db),
            before[0].id,
        );
        const after =
            await db.crewRoleMemberships
                .getAll();
        assert.equal(after.length, 0);
    },
);

test(
    'deleteCrew cascades to crew_role_memberships',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCrew(db, 'c-1', 'Squad');
        await seedRole(db, 'r-eng', 'Engineering');
        await seedRole(db, 'r-qa', 'QA');
        const ctx = createRequestContext(db);
        await addRoleToCrew(ctx, 'c-1', 'r-eng');
        await addRoleToCrew(
            createRequestContext(db),
            'c-1', 'r-qa',
        );
        await deleteCrew(
            createRequestContext(db), 'c-1',
        );
        const memberships =
            await db.crewRoleMemberships
                .getAll();
        assert.equal(memberships.length, 0);
        await assert.rejects(
            () => getCrew(
                createRequestContext(db), 'c-1',
            ),
        );
    },
);

test(
    'a crew can contain a user-private role'
    + ' (synthetic id accepted)',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCrew(db, 'c-1', 'Squad');
        await seedPerson(db, 'p-1', 'Sarah');
        await addRoleToCrew(
            createRequestContext(db),
            'c-1',
            userPrivateRoleId('p-1'),
        );
        const roles = await getRolesInCrew(
            createRequestContext(db), 'c-1',
        );
        assert.equal(roles.length, 1);
        assert.equal(
            isUserPrivateRole(roles[0]), true,
        );
        assert.equal(
            roles[0].nameText(), 'Sarah Test',
        );
    },
);

test(
    'addRoleToCrew rejects an unknown role id',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCrew(db, 'c-1', 'Squad');
        const ctx = createRequestContext(db);
        await assert.rejects(
            () => addRoleToCrew(
                ctx, 'c-1', 'no-such-role',
            ),
            /unknown role no-such-role/,
        );
    },
);

test(
    'addRoleToCrew rejects an unknown crew id',
    async () => {
        const db = new MemoryDbAdapter();
        await seedRole(db, 'r-eng', 'Engineering');
        const ctx = createRequestContext(db);
        await assert.rejects(
            () => addRoleToCrew(
                ctx, 'no-crew', 'r-eng',
            ),
            /unknown crew no-crew/,
        );
    },
);

test(
    'addRoleToCrew rejects user-private role'
    + ' that references unknown person',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCrew(db, 'c-1', 'Squad');
        const ctx = createRequestContext(db);
        await assert.rejects(
            () => addRoleToCrew(
                ctx, 'c-1',
                userPrivateRoleId('ghost'),
            ),
            /unknown person ghost/,
        );
    },
);

test(
    'getMembersOfCrew unions every person in'
    + ' every role of the crew, deduplicated',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCrew(db, 'c-1', 'Squad');
        await seedRole(db, 'r-eng', 'Eng');
        await seedRole(db, 'r-qa', 'QA');
        await seedPerson(db, 'p-1', 'Alice');
        await seedPerson(db, 'p-2', 'Bob');
        await addMember(
            createRequestContext(db),
            'r-eng', 'p-1',
        );
        await addMember(
            createRequestContext(db),
            'r-eng', 'p-2',
        );
        await addMember(
            createRequestContext(db),
            'r-qa', 'p-1',
        );
        await addRoleToCrew(
            createRequestContext(db),
            'c-1', 'r-eng',
        );
        await addRoleToCrew(
            createRequestContext(db),
            'c-1', 'r-qa',
        );
        const members = await getMembersOfCrew(
            createRequestContext(db), 'c-1',
        );
        assert.equal(members.size, 2);
        assert.ok(members.has('p-1'));
        assert.ok(members.has('p-2'));
    },
);

test(
    'getMembersOfCrew includes user-private'
    + ' role owners directly',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCrew(db, 'c-1', 'Squad');
        await seedPerson(db, 'p-1', 'Alice');
        await addRoleToCrew(
            createRequestContext(db),
            'c-1',
            userPrivateRoleId('p-1'),
        );
        const members = await getMembersOfCrew(
            createRequestContext(db), 'c-1',
        );
        assert.equal(members.size, 1);
        assert.ok(members.has('p-1'));
    },
);
