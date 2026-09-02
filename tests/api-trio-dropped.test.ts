import { assert, assertStrictEquals } from '@std/assert';
import { seededMockDb } from './mock-seed.ts';
import { GET } from '../api/api.ts';
import { organizationToken } from
    './token-fixtures.ts';
import { buildIdeas } from
    '../api/mock-data/ideas.ts';
import { buildProjects } from
    '../api/mock-data/projects.ts';
import { OBJECTIVE_SEEDS } from
    '../api/mock-data/objectives.ts';
import { buildRecords } from
    '../api/mock-data/records.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';

function nest(
    family: string,
    id: string,
): string {
    return 'organizations/'
        + STARK_ORGANIZATION
        + '/' + family + '/' + id;
}

Deno.test('idea JSON has no state_at or'
    + ' state_event_id', async () => {
    const db = await seededMockDb();
    const idea = buildIdeas()[0]!;
    const token = await organizationToken();
    const row = await GET<Record<string, unknown>>(
        db,
        nest('ideas', idea.id),
        token,
    );
    assertStrictEquals('state_at' in row, false);
    assertStrictEquals('state_event_id' in row, false);
    assertStrictEquals(typeof row.state, 'string');
});

Deno.test('GET idea versions/ is collection item'
    + ' shape', async () => {
    const db = await seededMockDb();
    const idea = buildIdeas()[0]!;
    const token = await organizationToken();
    const rows = await GET<
        Record<string, unknown>[]
    >(
        db,
        nest('ideas', idea.id) + '/versions/',
        token,
    );
    assert(rows.length >= 1);
    const first = rows[0]!;
    assertStrictEquals('state_at' in first, false);
    assertStrictEquals(typeof first.title, 'string');
    assertStrictEquals(typeof first.state, 'string');
});

Deno.test('project JSON has no state_at or'
    + ' state_event_id', async () => {
    const db = await seededMockDb();
    const project = buildProjects()[0]!;
    const token = await organizationToken();
    const row = await GET<Record<string, unknown>>(
        db,
        nest('projects', project.id),
        token,
    );
    assertStrictEquals('state_at' in row, false);
    assertStrictEquals('state_event_id' in row, false);
    assertStrictEquals(typeof row.state, 'string');
});

Deno.test('GET project versions/ is collection item'
    + ' shape', async () => {
    const db = await seededMockDb();
    const project = buildProjects()[0]!;
    const token = await organizationToken();
    const rows = await GET<
        Record<string, unknown>[]
    >(
        db,
        nest('projects', project.id)
            + '/versions/',
        token,
    );
    assert(rows.length >= 1);
    const first = rows[0]!;
    assertStrictEquals('state_at' in first, false);
    assertStrictEquals(typeof first.title, 'string');
    assertStrictEquals(typeof first.state, 'string');
});

Deno.test('objective JSON has no state_at or'
    + ' state_event_id', async () => {
    const db = await seededMockDb();
    const objective = OBJECTIVE_SEEDS[0]!;
    const token = await organizationToken();
    const row = await GET<Record<string, unknown>>(
        db,
        nest('objectives', objective.id),
        token,
    );
    assertStrictEquals('state_at' in row, false);
    assertStrictEquals('state_event_id' in row, false);
    assertStrictEquals(typeof row.state, 'string');
});

Deno.test('GET objective versions/ is collection'
    + ' item shape', async () => {
    const db = await seededMockDb();
    const objective = OBJECTIVE_SEEDS[0]!;
    const token = await organizationToken();
    const rows = await GET<
        Record<string, unknown>[]
    >(
        db,
        nest('objectives', objective.id)
            + '/versions/',
        token,
    );
    assert(rows.length >= 1);
    const first = rows[0]!;
    assertStrictEquals('state_at' in first, false);
    assertStrictEquals(typeof first.position, 'number');
    assertStrictEquals(typeof first.state, 'string');
});

Deno.test('record-type JSON has no state_at or'
    + ' state_event_id', async () => {
    const db = await seededMockDb();
    const record = buildRecords()[0]!;
    const token = await organizationToken();
    const row = await GET<Record<string, unknown>>(
        db,
        nest('record-types', record.id),
        token,
    );
    assertStrictEquals('state_at' in row, false);
    assertStrictEquals('state_event_id' in row, false);
    assertStrictEquals(typeof row.state, 'string');
});

Deno.test('GET record-type versions/ is collection'
    + ' item shape', async () => {
    const db = await seededMockDb();
    const record = buildRecords()[0]!;
    const token = await organizationToken();
    const rows = await GET<
        Record<string, unknown>[]
    >(
        db,
        nest('record-types', record.id)
            + '/versions/',
        token,
    );
    assert(rows.length >= 1);
    const first = rows[0]!;
    assertStrictEquals('state_at' in first, false);
    assertStrictEquals(typeof first.name, 'string');
    assertStrictEquals(typeof first.state, 'string');
});
