import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    initApi, resetApi,
} from '../api/api.ts';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    getIdeas,
    getIdea,
    putIdea,
} from '../web-app/app/adapters/ideas.ts';
import type {
    IdeaEntity,
} from '../api/types.ts';

function buildUser(id: string, name: string) {
    return {
        id,
        first_name: name,
        last_name: 'Test',
        email: `${name}@example.com`
            .toLowerCase(),
        phone: '',
        role: 'product_manager' as const,
        availability: 80,
        is_active: 1 as 0 | 1,
        bio: '',
        department: 'Product',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
    };
}

function buildIdea(
    id: string, title: string,
): Omit<IdeaEntity, 'id'> {
    return {
        title,
        position: 1,
        status: 'active',
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        readiness: 'ready',
        risks: '[]',
        assumptions: '[]',
        alignments: '[]',
    };
}

function setupDb(): MemoryDbAdapter {
    const db = new MemoryDbAdapter();
    resetApi();
    initApi(db);
    return db;
}

test('getIdeas returns ideas with submitter', async () => {
    const db = setupDb();
    await db.users.put(
        'u1', buildUser('u1', 'Alice'),
    );
    await db.ideas.put('i1', buildIdea(
        'i1', 'First idea',
    ));
    await db.ideaSubmissions.put('s1', {
        idea_id: 'i1',
        user_id: 'u1',
        created_at: '2026-04-01T00:00:00Z',
    });
    const result = await getIdeas();
    assert.equal(result.length, 1);
    assert.equal(
        result[0]?.idea.titleText(),
        'First idea',
    );
    assert.equal(
        result[0]?.submitterName,
        'Alice Test',
    );
});

test('getIdeas throws when idea has no submission', async () => {
    const db = setupDb();
    await db.users.put(
        'u1', buildUser('u1', 'Alice'),
    );
    await db.ideas.put('i1', buildIdea(
        'i1', 'Orphan',
    ));
    // No submission for i1
    await assert.rejects(
        () => getIdeas(),
        /no submission/,
    );
});

test('getIdea finds submission for one idea', async () => {
    const db = setupDb();
    await db.users.put(
        'u1', buildUser('u1', 'Alice'),
    );
    await db.ideas.put('i1', buildIdea(
        'i1', 'A',
    ));
    await db.ideaSubmissions.put('s1', {
        idea_id: 'i1',
        user_id: 'u1',
        created_at: '2026-04-01T00:00:00Z',
    });
    const result = await getIdea('i1');
    assert.equal(result.idea.titleText(), 'A');
    assert.equal(
        result.submitterName, 'Alice Test',
    );
});

test('getIdea throws on missing submission', async () => {
    const db = setupDb();
    await db.users.put(
        'u1', buildUser('u1', 'Alice'),
    );
    await db.ideas.put(
        'i1', buildIdea('i1', 'A'),
    );
    await assert.rejects(
        () => getIdea('i1'),
        /submission not found/,
    );
});

test('putIdea persists changes', async () => {
    const db = setupDb();
    await db.ideas.put(
        'i1', buildIdea('i1', 'Original'),
    );
    await putIdea('i1', {
        ...buildIdea('i1', 'Updated'),
    });
    const stored =
        await db.ideas.getById('i1');
    assert.equal(stored.title, 'Updated');
});

test('deleted ideas are filtered from getIdeas', async () => {
    const db = setupDb();
    await db.users.put(
        'u1', buildUser('u1', 'Alice'),
    );
    await db.ideas.put(
        'i1', buildIdea('i1', 'Keep'),
    );
    await db.ideaSubmissions.put('s1', {
        idea_id: 'i1',
        user_id: 'u1',
        created_at: '2026-04-01T00:00:00Z',
    });
    await db.ideas.put(
        'i2', buildIdea('i2', 'Delete me'),
    );
    await db.ideaSubmissions.put('s2', {
        idea_id: 'i2',
        user_id: 'u1',
        created_at: '2026-04-01T00:00:00Z',
    });
    await db.ideas.delete('i2');
    const result = await getIdeas();
    assert.equal(result.length, 1);
    assert.equal(
        result[0]?.idea.titleText(), 'Keep',
    );
});
