import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('idea JSON has no state_at or'
    + ' state_event_id', async () => {
    const db = await seededMockDb();
    const idea = buildIdeas()[0]!;
    const token = await organizationToken();
    const row = await GET<Record<string, unknown>>(
        db,
        nest('ideas', idea.id),
        token,
    );
    assert.equal('state_at' in row, false);
    assert.equal('state_event_id' in row, false);
    assert.equal(typeof row.state, 'string');
});

test('GET idea versions/ is collection item'
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
    assert.ok(rows.length >= 1);
    const first = rows[0]!;
    assert.equal('state_at' in first, false);
    assert.equal(typeof first.title, 'string');
    assert.equal(typeof first.state, 'string');
});

test('project JSON has no state_at or'
    + ' state_event_id', async () => {
    const db = await seededMockDb();
    const project = buildProjects()[0]!;
    const token = await organizationToken();
    const row = await GET<Record<string, unknown>>(
        db,
        nest('projects', project.id),
        token,
    );
    assert.equal('state_at' in row, false);
    assert.equal('state_event_id' in row, false);
    assert.equal(typeof row.state, 'string');
});

test('GET project versions/ is collection item'
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
    assert.ok(rows.length >= 1);
    const first = rows[0]!;
    assert.equal('state_at' in first, false);
    assert.equal(typeof first.title, 'string');
    assert.equal(typeof first.state, 'string');
});

test('objective JSON has no state_at or'
    + ' state_event_id', async () => {
    const db = await seededMockDb();
    const objective = OBJECTIVE_SEEDS[0]!;
    const token = await organizationToken();
    const row = await GET<Record<string, unknown>>(
        db,
        nest('objectives', objective.id),
        token,
    );
    assert.equal('state_at' in row, false);
    assert.equal('state_event_id' in row, false);
    assert.equal(typeof row.state, 'string');
});

test('GET objective versions/ is collection'
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
    assert.ok(rows.length >= 1);
    const first = rows[0]!;
    assert.equal('state_at' in first, false);
    assert.equal(typeof first.position, 'number');
    assert.equal(typeof first.state, 'string');
});

test('record-type JSON has no state_at or'
    + ' state_event_id', async () => {
    const db = await seededMockDb();
    const record = buildRecords()[0]!;
    const token = await organizationToken();
    const row = await GET<Record<string, unknown>>(
        db,
        nest('record-types', record.id),
        token,
    );
    assert.equal('state_at' in row, false);
    assert.equal('state_event_id' in row, false);
    assert.equal(typeof row.state, 'string');
});

test('GET record-type versions/ is collection'
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
    assert.ok(rows.length >= 1);
    const first = rows[0]!;
    assert.equal('state_at' in first, false);
    assert.equal(typeof first.name, 'string');
    assert.equal(typeof first.state, 'string');
});
