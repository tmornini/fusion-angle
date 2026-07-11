import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import {
    currentRolesForInOrganization,
} from '../api/authorization.ts';
import { verifyPassword } from '../shared/password-hash.ts';
import {
    deriveIdeas,
    deriveIdeaSubmissions,
} from '../api/derive-ideas.ts';
import { deriveProjects } from
    '../api/derive-projects.ts';
import {
    deriveBaselineScores,
    deriveActualScores,
} from '../api/derive-project-scores.ts';
import { deriveFlows } from '../api/derive-flows.ts';
import {
    deriveFlowRecords,
} from '../api/derive-flow-records.ts';
import {
    documentCollectionGetHandler,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';
import {
    validateRecordDocumentBody,
    validateRecordAttributeDocumentBody,
    validateObjectiveDocumentBody,
    pickNumber,
} from '../api/validators.ts';
import {
    postRecordDocumentOp,
    postRecordAttributeDocumentOp,
    postObjectiveDocumentOp,
} from '../api/routes.ts';
import type {
    RecordEntity,
    RecordAttributeEntity,
    ObjectiveEntity,
} from '../api/types.ts';
import { handleRequest } from '../api/api.ts';
import { deriveMembershipsForIdentity } from
    '../api/derive-memberships.ts';
import { deriveMemberParents } from
    '../api/derive-members.ts';
import {
    deriveRoleGrants,
    deriveCredentialsFor,
} from '../api/derive-identity-spine.ts';
import { deriveOrganizations } from
    '../api/derive-organizations.ts';
import { organizationToken } from './token-fixtures.ts';
import { buildIdeas } from '../api/mock-data/ideas.ts';
import { assignOrganization } from
    '../api/mock-data/seed-constants.ts';

const RECORDS_WIRING: DocumentFamilyWiring = {
    family: 'records',
    lifecycle: 'trio',
    notFoundTable: 'records',
    validateDocument: validateRecordDocumentBody,
    documentOp: postRecordDocumentOp,
    entityOf: (document, organization) => ({
        id: document.uriId,
        organization_id: organization,
        name: String(document.body['name'] ?? ''),
        description: String(
            document.body['description'] ?? '',
        ),
        position: Number(document.body['position'] ?? 0),
    }),
};

const RECORD_ATTRIBUTES_WIRING: DocumentFamilyWiring = {
    family: 'record-attributes',
    lifecycle: 'stateless',
    notFoundTable: 'record_attributes',
    validateDocument: validateRecordAttributeDocumentBody,
    documentOp: postRecordAttributeDocumentOp,
    entityOf: (document, organization) => ({
        id: document.uriId,
        organization_id: organization,
        ...document.body,
    }),
};

async function derivedRecords(
    db: MemoryDbAdapter, organization: string,
): Promise<RecordEntity[]> {
    return documentCollectionGetHandler(RECORDS_WIRING)(
        db, [], 'current', organization,
    ) as Promise<RecordEntity[]>;
}

async function derivedRecordAttributes(
    db: MemoryDbAdapter, organization: string,
): Promise<RecordAttributeEntity[]> {
    return documentCollectionGetHandler(
        RECORD_ATTRIBUTES_WIRING,
    )(
        db, [], 'current', organization,
    ) as Promise<RecordAttributeEntity[]>;
}

const OBJECTIVES_WIRING: DocumentFamilyWiring = {
    family: 'objectives',
    lifecycle: 'stateless',
    notFoundTable: 'objectives',
    validateDocument: validateObjectiveDocumentBody,
    documentOp: postObjectiveDocumentOp,
    entityOf: (document, organization) => ({
        id: document.uriId,
        organization_id: organization,
        position: pickNumber(document.body, 'position'),
    }),
};

async function derivedObjectives(
    db: MemoryDbAdapter, organization: string,
): Promise<ObjectiveEntity[]> {
    return documentCollectionGetHandler(OBJECTIVES_WIRING)(
        db, [], 'current', organization,
    ) as Promise<ObjectiveEntity[]>;
}

const ORGANIZATION_ONE = '1';
const ORGANIZATION_TWO = '2';

async function seed() {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const creds = await postMockDataLoad(db);
    return { db, creds };
}

// Phase Final Task 2: every membership document on the pair
// plane (both orgs), keyed by identity. Identities ROW half
// stripped — parents alone enumerate directory ids.
async function membershipsByIdentity(
    db: MemoryDbAdapter,
): Promise<Map<string, Set<string>>> {
    const parents = await deriveMemberParents(db);
    const byIdentity = new Map<string, Set<string>>();
    for (const parent of parents) {
        const rows = await deriveMembershipsForIdentity(
            db, parent.id,
        );
        if (rows.length === 0) continue;
        byIdentity.set(
            parent.id,
            new Set(rows.map(m => m.organization_id)),
        );
    }
    return byIdentity;
}

test('current is a member of exactly orgs 1 and 2',
async () => {
    const { db } = await seed();
    // Phase Final Task 2: memberships on the pair plane.
    const organizations = (
        await deriveMembershipsForIdentity(db, 'current')
    )
        .map(m => m.organization_id)
        .sort();
    assert.deepEqual(organizations, ['1', '2']);
    // Phase Final Stage B: roster tables retired.
});

test('current holds admin in both orgs', async () => {
    const { db } = await seed();
    // Phase Final Task 2: role_grants ROW half stripped.
    const grants = await deriveRoleGrants(db);
    assert.ok(
        currentRolesForInOrganization(grants, 'current', ORGANIZATION_ONE)
            .includes('admin'));
    assert.ok(
        currentRolesForInOrganization(grants, 'current', ORGANIZATION_TWO)
            .includes('admin'));
    // Phase Final Stage B: identity spine tables retired.
});

test('both organizations exist with distinct names',
async () => {
    const { db } = await seed();
    // Phase Final Task 2: organizations ROW half stripped.
    const organizations = await deriveOrganizations(db);
    const one = organizations.find(
        o => o.id === ORGANIZATION_ONE,
    );
    const two = organizations.find(
        o => o.id === ORGANIZATION_TWO,
    );
    assert.ok(one, 'org 1 exists');
    assert.ok(two, 'org 2 exists');
    assert.notEqual(one.name, two.name);
    // Phase Final Stage B: organizations table retired.
});

test('each org owns at least one of every org-scoped'
    + ' entity', async () => {
    const { db } = await seed();
    // Phase Final Task 2: ideas + projects + flows derive
    // from the pair plane (row halves stripped).
    for (const organization of [
        ORGANIZATION_ONE, ORGANIZATION_TWO,
    ]) {
        const ideas = await deriveIdeas(db, organization);
        assert.ok(
            ideas.length >= 1,
            `org ${organization} owns no ideas`,
        );
        const projects = await deriveProjects(
            db, organization,
        );
        assert.ok(
            projects.length >= 1,
            `org ${organization} owns no projects`,
        );
        const flows = await deriveFlows(db, organization);
        assert.ok(
            flows.length >= 1,
            `org ${organization} owns no flows`,
        );
    }
    // Phase Final Task 2: records + objectives from the
    // pair plane.
    for (const organization of [
        ORGANIZATION_ONE, ORGANIZATION_TWO,
    ]) {
        const records = await derivedRecords(
            db, organization,
        );
        assert.ok(
            records.length >= 1,
            `org ${organization} owns no records`,
        );
        const objectives = await derivedObjectives(
            db, organization,
        );
        assert.ok(
            objectives.length >= 1,
            `org ${organization} owns no objectives`,
        );
    }
    // Phase Final Stage B: objectives table retired.
});

test('every work order belongs to org 1', async () => {
    const { db } = await seed();
    // Phase Final Task 2: work orders from the pair plane.
    const token = await organizationToken(
        'current', ORGANIZATION_ONE,
    );
    const res = await handleRequest(
        db,
        new Request('http://localhost/work-orders', {
            headers: {
                Authorization: 'Bearer ' + token,
            },
        }),
    );
    assert.equal(res.status, 200);
    const wos = await res.json() as {
        id: string;
        organization_id: string;
    }[];
    assert.ok(wos.length > 0, 'work orders exist');
    for (const wo of wos) {
        assert.equal(wo.organization_id, ORGANIZATION_ONE);
    }
    // Org two carries none.
    const tokenTwo = await organizationToken(
        'current', ORGANIZATION_TWO,
    );
    const empty = await handleRequest(
        db,
        new Request('http://localhost/work-orders', {
            headers: {
                Authorization: 'Bearer ' + tokenTwo,
            },
        }),
    );
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), []);
});

test('every record attribute matches its parent record org',
async () => {
    const { db } = await seed();
    // Phase Final Task 2: records + attributes on pair plane.
    const recordOrganization = new Map<string, string>();
    const allAttrs: RecordAttributeEntity[] = [];
    for (const organization of [
        ORGANIZATION_ONE, ORGANIZATION_TWO,
    ]) {
        for (const r of await derivedRecords(
            db, organization,
        )) {
            recordOrganization.set(r.id, organization);
        }
        allAttrs.push(
            ...await derivedRecordAttributes(
                db, organization,
            ),
        );
    }
    assert.ok(allAttrs.length > 0, 'attributes exist');
    for (const attr of allAttrs) {
        assert.equal(
            attr.organization_id,
            recordOrganization.get(attr.record_id),
            `attribute ${attr.id} org mismatch`);
    }
    // Phase Final Stage B: record_attributes table retired.
});

test('every non-admin seeded human is single-org',
async () => {
    const { db } = await seed();
    const byIdentity = await membershipsByIdentity(db);
    // Phase Final Task 2: identities ROW half stripped —
    // human parents from the pair plane.
    const parents = await deriveMemberParents(db);
    const persons = parents
        .filter(m => m.type === 'human')
        .map(m => m.id);
    for (const id of persons) {
        if (id === 'current') continue;
        const organizations = byIdentity.get(id) ?? new Set();
        assert.ok(
            organizations.size <= 1,
            `non-admin ${id} spans multiple orgs`);
    }
});

test('every flow_records join binds same-org flow and'
    + ' record', async () => {
    const { db } = await seed();
    // Phase Final Task 2: flows + records + joins on the
    // pair plane.
    const flowOrganization = new Map<string, string>();
    const recordOrganization = new Map<string, string>();
    const bindings: {
        id: string;
        flow_id: string;
        record_id: string;
    }[] = [];
    for (const organization of [
        ORGANIZATION_ONE, ORGANIZATION_TWO,
    ]) {
        for (const f of await deriveFlows(db, organization)) {
            flowOrganization.set(f.id, organization);
            bindings.push(
                ...await deriveFlowRecords(
                    db, organization, f.id,
                ),
            );
        }
        for (const r of await derivedRecords(
            db, organization,
        )) {
            recordOrganization.set(r.id, organization);
        }
    }
    assert.ok(bindings.length > 0, 'bindings exist');
    for (const b of bindings) {
        assert.equal(
            flowOrganization.get(b.flow_id),
            recordOrganization.get(b.record_id),
            `binding ${b.id} crosses orgs`);
    }
    // Phase Final Stage B: flow_records table retired.
});

test('every idea submission names a submitter in its'
    + " idea's org", async () => {
    const { db } = await seed();
    // Phase Final Task 2: derive ideas + submissions (row
    // halves stripped).
    const ideaOrganization = new Map(
        buildIdeas().map((idea, index) => [
            idea.id, assignOrganization(index),
        ]),
    );
    // Phase Final Task 2: memberships on the pair plane.
    const memberOrganizations = await membershipsByIdentity(db);
    const violations: string[] = [];
    for (const [ideaId, organization] of ideaOrganization) {
        const subs = await deriveIdeaSubmissions(
            db, organization, ideaId,
        );
        for (const s of subs) {
            const organizations =
                memberOrganizations.get(s.member_id)
                    ?? new Set<string>();
            if (!organizations.has(organization)) {
                violations.push(
                    s.id + ': ' + s.member_id
                    + ' not in idea org ' + organization);
            }
        }
    }
    assert.deepEqual(
        violations, [],
        'cross-org submitters: ' + violations.join('; '));
});

test('every project score names an author in its'
    + " project's org", async () => {
    const { db } = await seed();
    // Phase Final Task 2: projects + scores from pair plane.
    const projectOrganization = new Map<string, string>();
    const scores: {
        id: string;
        project_id: string;
        member_id: string;
    }[] = [];
    for (const organization of [
        ORGANIZATION_ONE, ORGANIZATION_TWO,
    ]) {
        const projects = await deriveProjects(
            db, organization,
        );
        for (const p of projects) {
            projectOrganization.set(p.id, organization);
            scores.push(
                ...await deriveBaselineScores(
                    db, organization, p.id,
                ),
                ...await deriveActualScores(
                    db, organization, p.id,
                ),
            );
        }
    }
    // Phase Final Task 2: memberships on the pair plane.
    const memberOrganizations = await membershipsByIdentity(db);
    assert.ok(scores.length > 0, 'scores exist');
    const violations: string[] = [];
    for (const s of scores) {
        const organization = projectOrganization.get(
            s.project_id,
        );
        const organizations = memberOrganizations.get(
            s.member_id,
        ) ?? new Set<string>();
        if (
            organization === undefined
            || !organizations.has(organization)
        ) {
            violations.push(
                s.id + ': ' + s.member_id
                + ' not in project org ' + organization);
        }
    }
    assert.deepEqual(
        violations, [],
        'cross-org score authors: ' + violations.join('; '));
});

test('every seeded human gets a verifiable password',
async () => {
    const { db, creds } = await seed();
    assert.ok(
        creds.identities.length >= 2,
        'multiple humans seeded');
    // Phase Final Task 2: identity_credentials ROW half
    // stripped — verify against pair-plane secrets.
    for (const c of creds.identities) {
        const rows = await deriveCredentialsFor(
            db, c.identityId,
        );
        const row = rows.find(r => r.kind === 'password');
        assert.ok(row, `no password for ${c.identityId}`);
        assert.equal(
            await verifyPassword(c.password, row.secret),
            true);
        assert.match(c.username, /@/);
    }
    // Phase Final Stage B: identity spine tables retired.
});
