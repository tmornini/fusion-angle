import { assertStrictEquals } from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import type { DbAdapter } from '../api/db.ts';
import type { Id } from '../api/types.ts';
import {
    documentCollectionGetHandler,
    documentFamilyWiring,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const READER: Id = 'XXZruirZyAOoRpNxaDnpSA';

function wiringOf(family: string): DocumentFamilyWiring {
    const wiring = documentFamilyWiring(family);
    if (wiring === undefined) {
        throw new Error('no wiring registered for ' + family);
    }
    return wiring;
}

async function getCollection(
    db: DbAdapter, family: string, organization: Id,
): Promise<{ id: Id; state: string }[]> {
    const rows = await documentCollectionGetHandler(
        wiringOf(family),
    )(db, [organization], READER, organization, []);
    return rows as { id: Id; state: string }[];
}

// The projects sibling of tests/derive-ideas.test.ts: the
// handler-level tombstone guarantee — a lifecycle-deleted project
// is absent from documentCollectionGetHandler's list — that
// tests/drift-projects.test.ts's wire-level GET does not exercise
// (the live wire streams the stored PUT and never reaches this
// handler; a head whose state is `deleted` stays a live PUT
// head there).

const STARK_ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';

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

function projectDocument(
    title: string,
    state: string,
): Record<string, unknown> {
    return {
        title,
        description: 'd',
        progress: 0,
        start_date: '2026-04-01',
        target_end_date: '2026-07-01',
        estimated_cost: 100,
        actual_cost: 0,
        position: 1,
        state,
    };
}

function putProject(
    db: MemoryDbAdapter,
    token: string,
    id: string,
    title: string,
    state: string,
): Promise<Response> {
    return handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + id, token,
        projectDocument(title, state),
    ));
}

// A later PUT that transitions to 'deleted' tombs the project:
// documentCollectionGetHandler drops its id from the collection
// even though the store still carries the deleted head as its
// newest live PUT.
Deno.test(
    'a later deleted PUT tombs the project',
    async () => {
        const db = await seededDb();
        const token = await organizationToken();
        const projectId = generateIdentifier();
        await putProject(
            db, token, projectId, 'Genesis Title', 'submitted',
        );
        const res = await putProject(
            db, token, projectId, 'Tomb Title', 'deleted',
        );
        assertStrictEquals(res.status, 201);
        const projects = await getCollection(
            db, 'projects', STARK_ORGANIZATION,
        );
        assertStrictEquals(
            projects.some(
                (project) => project.id === projectId,
            ),
            false,
        );
    },
);
