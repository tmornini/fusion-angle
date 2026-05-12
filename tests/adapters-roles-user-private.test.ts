import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getRoles,
    getRolesForPerson,
    addMember,
    isUserPrivateRole,
    userPrivateRoleFor,
} from '../web-app/app/adapters/roles.ts';
import {
    userPrivateRoleId,
    isUserPrivateRoleId,
    personIdFromUserPrivateRoleId,
} from '../api/types.ts';
import {
    Person,
    jsonArrayField,
    jsonObjectField,
    nowUtc,
} from '../api/types.ts';

function buildPerson(
    id: string,
    first: string = 'Alice',
    status: 'active' | 'pending' | 'deactivated'
        = 'active',
): Person {
    return new Person({
        id,
        first_name: first,
        last_name: 'Test',
        email:
            `${first}@example.com`.toLowerCase(),
        title: 'Engineer',
        department: 'Eng',
        status,
        strengths: jsonArrayField([]),
        team_dimensions:
            jsonObjectField({ driver: 50 }),
        phone: '',
        bio: '',
    });
}

async function seedPerson(
    db: MemoryDbAdapter,
    id: string,
    first: string = 'Alice',
    status: 'active' | 'pending' | 'deactivated'
        = 'active',
): Promise<void> {
    const p = buildPerson(id, first, status);
    await db.people.put(id, {
        first_name: p.firstNameText(),
        last_name: p.lastNameText(),
        email: p.emailAddress(),
        title: p.titleLabel(),
        department: p.departmentLabel(),
        status: p.statusValue(),
        strengths: jsonArrayField([]),
        team_dimensions:
            jsonObjectField({ driver: 50 }),
        phone: '',
        bio: '',
    });
}

test(
    'userPrivateRoleId/'
    + 'personIdFromUserPrivateRoleId'
    + ' round-trip',
    () => {
        const id = userPrivateRoleId('person-1');
        assert.equal(
            personIdFromUserPrivateRoleId(id),
            'person-1',
        );
    },
);

test(
    'isUserPrivateRoleId returns true only for'
    + ' ids with the user-private prefix',
    () => {
        assert.equal(
            isUserPrivateRoleId(
                'user-private:abc',
            ),
            true,
        );
        assert.equal(
            isUserPrivateRoleId('plain-role-id'),
            false,
        );
        assert.equal(
            isUserPrivateRoleId(''),
            false,
        );
    },
);

test(
    'personIdFromUserPrivateRoleId rejects'
    + ' non-private ids',
    () => {
        assert.throws(
            () => personIdFromUserPrivateRoleId(
                'persisted-role-id',
            ),
            /not a user-private/,
        );
    },
);

test(
    'userPrivateRoleFor builds a Role with the'
    + ' synthetic id and the person fullName',
    () => {
        const p = buildPerson(
            'p-1', 'Sarah',
        );
        const role = userPrivateRoleFor(p);
        assert.equal(
            role.idForLink(),
            'user-private:p-1',
        );
        assert.equal(
            role.nameText(), 'Sarah Test',
        );
        assert.equal(
            isUserPrivateRole(role), true,
        );
    },
);

test(
    'getRoles includes one user-private role'
    + ' per active person',
    async () => {
        const db = new MemoryDbAdapter();
        await seedPerson(db, 'p-1', 'Alice');
        await seedPerson(db, 'p-2', 'Bob');
        const ctx = createRequestContext(db);
        const roles = await getRoles(ctx);
        const userPrivate = roles.filter(
            r => isUserPrivateRole(r),
        );
        assert.equal(userPrivate.length, 2);
    },
);

test(
    'getRoles does NOT include user-private'
    + ' roles for deactivated people',
    async () => {
        const db = new MemoryDbAdapter();
        await seedPerson(
            db, 'p-1', 'Alice', 'deactivated',
        );
        await seedPerson(db, 'p-2', 'Bob');
        const ctx = createRequestContext(db);
        const roles = await getRoles(ctx);
        const userPrivate = roles.filter(
            r => isUserPrivateRole(r),
        );
        assert.equal(userPrivate.length, 1);
        assert.equal(
            userPrivate[0].idForLink(),
            'user-private:p-2',
        );
    },
);

test(
    'getRolesForPerson includes the person\'s'
    + ' own user-private role at the end',
    async () => {
        const db = new MemoryDbAdapter();
        await seedPerson(db, 'p-1');
        await db.roles.put('r-eng', {
            name: 'Engineering',
            description: '',
            created_at: nowUtc(),
        });
        await addMember(
            createRequestContext(db),
            'r-eng', 'p-1',
        );
        const fresh = createRequestContext(db);
        const roles = await getRolesForPerson(
            fresh, 'p-1',
        );
        assert.equal(roles.length, 2);
        assert.equal(
            roles[0].idForLink(), 'r-eng',
        );
        assert.equal(
            isUserPrivateRole(roles[1]), true,
        );
    },
);

test(
    'getRolesForPerson returns empty list for'
    + ' unknown personId (no synthetic added)',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createRequestContext(db);
        const roles = await getRolesForPerson(
            ctx, 'no-such-person',
        );
        assert.equal(roles.length, 0);
    },
);

test(
    'addMember to a user-private role id'
    + ' throws',
    async () => {
        const db = new MemoryDbAdapter();
        await seedPerson(db, 'p-1');
        await seedPerson(db, 'p-2', 'Bob');
        const ctx = createRequestContext(db);
        await assert.rejects(
            () => addMember(
                ctx,
                userPrivateRoleId('p-1'),
                'p-2',
            ),
            /user-private roles are not editable/,
        );
    },
);
