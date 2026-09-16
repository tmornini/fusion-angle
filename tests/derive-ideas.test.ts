import {
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import type { DbAdapter } from '../api/db.ts';
import { EntityNotFoundError } from '../api/db.ts';
import type { Id } from '../api/types.ts';
import {
    documentCollectionGetHandler,
    documentFamilyWiring,
    documentGetHandler,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const STARK_ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';

const READER: Id = 'XXZruirZyAOoRpNxaDnpSA';

function wiringOf(family: string): DocumentFamilyWiring {
    const wiring = documentFamilyWiring(family);
    if (wiring === undefined) {
        throw new Error('no wiring registered for ' + family);
    }
    return wiring;
}

function getDocument(
    db: DbAdapter, family: string, organization: Id, id: Id,
): Promise<unknown> {
    return documentGetHandler(wiringOf(family))(
        db, [organization, id], READER, organization, [],
    );
}

async function getCollection(
    db: DbAdapter, family: string, organization: Id,
): Promise<{ id: Id; state: string }[]> {
    const rows = await documentCollectionGetHandler(
        wiringOf(family),
    )(db, [organization], READER, organization, []);
    return rows as { id: Id; state: string }[];
}

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

function ideaDocument(
    title: string,
    state: string,
): Record<string, unknown> {
    return {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        state,
    };
}

function putIdea(
    db: MemoryDbAdapter,
    token: string,
    id: string,
    title: string,
    state: string,
): Promise<Response> {
    return handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id, token,
        ideaDocument(title, state),
    ));
}

Deno.test('a created idea reads through the handler', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ideaId = generateIdentifier();
    const res = await putIdea(
        db, token, ideaId, 'Fresh Idea', 'active',
    );
    assertStrictEquals(res.status, 201);
    const document = await getDocument(
        db, 'ideas', STARK_ORGANIZATION, ideaId,
    );
    assertEquals(document, {
        id: ideaId,
        organization_id: STARK_ORGANIZATION,
        title: 'Fresh Idea',
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        state: 'active',
    });
});

Deno.test('an edited idea reads the edit body', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ideaId = generateIdentifier();
    await putIdea(
        db, token, ideaId, 'Before Edit', 'active',
    );
    // Same domain state — only the entity fields move.
    const res = await putIdea(
        db, token, ideaId, 'After Edit', 'active',
    );
    assertStrictEquals(res.status, 201);
    const document = await getDocument(
        db, 'ideas', STARK_ORGANIZATION, ideaId,
    ) as { title: string };
    assertStrictEquals(document.title, 'After Edit');
});

Deno.test(
    'a deleted idea disappears from the list and 404s by id',
    async () => {
        const db = await seededDb();
        const token = await organizationToken();
        const ideaId = generateIdentifier();
        await putIdea(
            db, token, ideaId, 'Doomed', 'active',
        );
        const res = await putIdea(
            db, token, ideaId, 'Doomed', 'deleted',
        );
        assertStrictEquals(res.status, 201);

        const ideas = await getCollection(
            db, 'ideas', STARK_ORGANIZATION,
        );
        assertStrictEquals(
            ideas.some((idea) => idea.id === ideaId),
            false,
        );
        await assertRejects(
            () => getDocument(
                db, 'ideas', STARK_ORGANIZATION, ideaId,
            ),
            EntityNotFoundError,
        );
    },
);

Deno.test(
    'a later deleted PUT tombs the idea',
    async () => {
        const db = await seededDb();
        const token = await organizationToken();
        const ideaId = generateIdentifier();
        await putIdea(
            db, token, ideaId, 'Genesis Title',
            'active',
        );
        const res = await putIdea(
            db, token, ideaId, 'Tomb Title',
            'deleted',
        );
        assertStrictEquals(res.status, 201);
        const ideas = await getCollection(
            db, 'ideas', STARK_ORGANIZATION,
        );
        assertStrictEquals(
            ideas.some((idea) => idea.id === ideaId),
            false,
        );
        await assertRejects(
            () => getDocument(
                db, 'ideas', STARK_ORGANIZATION, ideaId,
            ),
            EntityNotFoundError,
        );
    },
);

Deno.test('ordering is oldest live head (at, id)', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const ids = [
        generateIdentifier(),
        generateIdentifier(),
        generateIdentifier(),
    ];
    for (const id of ids) {
        await putIdea(
            db, token, id, 'Order ' + id, 'active',
        );
    }
    const collection = await getCollection(
        db, 'ideas', STARK_ORGANIZATION,
    );
    const observed = collection
        .map((idea) => idea.id)
        .filter((id) => ids.includes(id));
    assertEquals(observed, ids);
});
