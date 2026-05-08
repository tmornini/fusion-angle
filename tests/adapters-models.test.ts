import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createFetchContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getModels,
    getModel,
    putModel,
    deleteModel,
    getModelsInRole,
    getRolesContainingModel,
    addModelToRole,
    removeModelFromRole,
    subscribeModelChanges,
    subscribeRoleModelMembershipChanges,
} from '../web-app/app/adapters/models.ts';
import { Model, nowUtc } from '../api/types.ts';

async function seedModel(
    db: MemoryDbAdapter,
    id: string,
    name: string,
    provider: string = 'Anthropic',
): Promise<void> {
    await db.models.put(id, {
        name,
        provider,
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

test(
    'putModel persists; getModel returns it',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createFetchContext(db);
        await putModel(ctx, 'm-1', {
            name: 'Claude Opus 4.7 Max',
            provider: 'Anthropic',
            description: 'Flagship.',
            created_at: nowUtc(),
        });
        const fresh = createFetchContext(db);
        const model = await getModel(fresh, 'm-1');
        assert.equal(
            model.nameText(),
            'Claude Opus 4.7 Max',
        );
        assert.ok(model instanceof Model);
    },
);

test(
    'getModel throws on unknown id',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createFetchContext(db);
        await assert.rejects(
            () => getModel(ctx, 'missing'),
            /unknown model missing/,
        );
    },
);

test(
    'getModels returns persisted models',
    async () => {
        const db = new MemoryDbAdapter();
        await seedModel(
            db, 'm-1', 'Opus', 'Anthropic',
        );
        await seedModel(
            db, 'm-2', 'GPT-5.4 Pro', 'OpenAI',
        );
        const ctx = createFetchContext(db);
        const list = await getModels(ctx);
        assert.equal(list.length, 2);
    },
);

test(
    'addModelToRole, then getModelsInRole'
    + ' returns the model',
    async () => {
        const db = new MemoryDbAdapter();
        await seedModel(db, 'm-1', 'Opus');
        await seedRole(db, 'r-eng', 'Engineering');
        const ctx = createFetchContext(db);
        await addModelToRole(ctx, 'r-eng', 'm-1');
        const list = await getModelsInRole(
            createFetchContext(db), 'r-eng',
        );
        assert.equal(list.length, 1);
        assert.equal(
            list[0].idForLink(), 'm-1',
        );
    },
);

test(
    'getRolesContainingModel returns every role'
    + ' that holds the model',
    async () => {
        const db = new MemoryDbAdapter();
        await seedModel(db, 'm-1', 'Opus');
        await seedRole(db, 'r-eng', 'Eng');
        await seedRole(db, 'r-design', 'Design');
        await addModelToRole(
            createFetchContext(db),
            'r-eng', 'm-1',
        );
        await addModelToRole(
            createFetchContext(db),
            'r-design', 'm-1',
        );
        const roles =
            await getRolesContainingModel(
                createFetchContext(db), 'm-1',
            );
        assert.equal(roles.length, 2);
    },
);

test(
    'removeModelFromRole removes the membership',
    async () => {
        const db = new MemoryDbAdapter();
        await seedModel(db, 'm-1', 'Opus');
        await seedRole(db, 'r-eng', 'Eng');
        await addModelToRole(
            createFetchContext(db),
            'r-eng', 'm-1',
        );
        const before =
            await db.roleModelMemberships
                .getAll();
        assert.equal(before.length, 1);
        await removeModelFromRole(
            createFetchContext(db),
            before[0].id,
        );
        const after =
            await db.roleModelMemberships
                .getAll();
        assert.equal(after.length, 0);
    },
);

test(
    'deleteModel cascades to role-model'
    + ' memberships',
    async () => {
        const db = new MemoryDbAdapter();
        await seedModel(db, 'm-1', 'Opus');
        await seedRole(db, 'r-eng', 'Eng');
        await seedRole(db, 'r-design', 'Design');
        const ctx = createFetchContext(db);
        await addModelToRole(ctx, 'r-eng', 'm-1');
        await addModelToRole(
            createFetchContext(db),
            'r-design', 'm-1',
        );
        await deleteModel(
            createFetchContext(db), 'm-1',
        );
        const memberships =
            await db.roleModelMemberships
                .getAll();
        assert.equal(memberships.length, 0);
        await assert.rejects(
            () => getModel(
                createFetchContext(db), 'm-1',
            ),
        );
    },
);

test(
    'addModelToRole rejects an unknown role id',
    async () => {
        const db = new MemoryDbAdapter();
        await seedModel(db, 'm-1', 'Opus');
        const ctx = createFetchContext(db);
        await assert.rejects(
            () => addModelToRole(
                ctx, 'no-role', 'm-1',
            ),
            /unknown role no-role/,
        );
    },
);

test(
    'addModelToRole rejects an unknown model id',
    async () => {
        const db = new MemoryDbAdapter();
        await seedRole(db, 'r-eng', 'Eng');
        const ctx = createFetchContext(db);
        await assert.rejects(
            () => addModelToRole(
                ctx, 'r-eng', 'no-model',
            ),
            /unknown model no-model/,
        );
    },
);

test(
    'subscribeModelChanges fires after putModel'
    + ' and deleteModel',
    async () => {
        const db = new MemoryDbAdapter();
        let count = 0;
        const unsubscribe = subscribeModelChanges(
            () => { count++; },
        );
        await putModel(
            createFetchContext(db), 'm-1', {
                name: 'Opus',
                provider: 'Anthropic',
                description: '',
                created_at: nowUtc(),
            },
        );
        await deleteModel(
            createFetchContext(db), 'm-1',
        );
        unsubscribe();
        assert.ok(
            count >= 2,
            'expected at least 2 notifications',
        );
    },
);

test(
    'subscribeRoleModelMembershipChanges fires'
    + ' after addModelToRole and'
    + ' removeModelFromRole',
    async () => {
        const db = new MemoryDbAdapter();
        await seedModel(db, 'm-1', 'Opus');
        await seedRole(db, 'r-eng', 'Eng');
        let count = 0;
        const unsubscribe =
            subscribeRoleModelMembershipChanges(
                () => { count++; },
            );
        await addModelToRole(
            createFetchContext(db),
            'r-eng', 'm-1',
        );
        const memberships =
            await db.roleModelMemberships
                .getAll();
        await removeModelFromRole(
            createFetchContext(db),
            memberships[0].id,
        );
        unsubscribe();
        assert.ok(
            count >= 2,
            'expected at least 2 notifications',
        );
    },
);
