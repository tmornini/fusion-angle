import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import {
    postTestPlanSlices, sliceEntityId,
} from '../api/test-plan-slices.ts';
import { deriveOrganizations } from
    '../api/derive-organizations.ts';
import { deriveIdeas } from
    '../api/derive-ideas.ts';
import { deriveProjects } from
    '../api/derive-projects.ts';
import { deriveDocumentsAt } from
    '../api/derive-documents.ts';
import { canonicalUriCollection } from
    '../api/message-pair.ts';
import { deriveObjectiveRevisions } from
    '../api/derive-objective-revisions.ts';
import { deriveRecordTypeCollection } from
    '../api/derive-record-types.ts';
import { deriveFlows } from
    '../api/derive-flows.ts';
import { deriveFlowWorkOrders } from
    '../api/derive-flow-work-orders.ts';
import { deriveIdentityPii } from
    '../api/derive-identity-spine.ts';
import { deriveMembershipsForIdentity } from
    '../api/derive-memberships.ts';
import { testHashPassword } from
    './mock-seed.ts';
import { SYSTEM_MEMBER_ID } from
    '../api/types.ts';

const PARALLEL = [
    'AA', 'B', 'C', 'D', 'E', 'F', 'F2',
    'FS', 'G', 'H', 'I', 'K', 'R', 'SV',
] as const;

async function seeded() {
    const db = memoryDbAdapter();
    const reveal = await postTestPlanSlices(
        db, { hashPassword: testHashPassword },
    );
    return { db, reveal };
}

const EXPECTED_SLICE_MESSAGE_PAIRS = 507;

test('slices stamp schema last and reveal 14',
async () => {
    const { db, reveal } = await seeded();
    assert.equal(await db.hasSchema(), true);
    assert.equal(reveal.length, 14);
    assert.deepEqual(
        reveal.map((row) => row.section),
        [...PARALLEL],
    );
});

test('AA is bootstrap current + org 1',
async () => {
    const { db, reveal } = await seeded();
    const aa = reveal.find(
        (row) => row.section === 'AA',
    );
    assert.ok(aa);
    assert.equal(aa.organizationId, 'AjdvjuECVZEgZoFajaIEkg');
    assert.equal(
        aa.adminUsername, 'demo@example.com',
    );
    const pii = await deriveIdentityPii(
        db, 'XXZruirZyAOoRpNxaDnpSA',
    );
    assert.equal(pii.name, 'Tony Stark');
    const organizations = await deriveOrganizations(db);
    const stark = organizations.find(
        (o) => o.id === 'AjdvjuECVZEgZoFajaIEkg',
    );
    assert.ok(stark);
    assert.equal(stark.name, 'Stark Industries');
    assert.equal(stark.domain, 'acmecorp.com');
});

test('fourteen organization ids are disjoint',
async () => {
    const { reveal } = await seeded();
    const ids = reveal.map(
        (row) => row.organizationId,
    );
    assert.equal(new Set(ids).size, 14);
});

test('fifteen organization documents exist',
async () => {
    const { db, reveal } = await seeded();
    const organizations = await deriveOrganizations(db);
    assert.equal(organizations.length, 15);
    const stored = new Set(
        organizations.map((row) => row.id),
    );
    const revealed = new Set(
        reveal.map((row) => row.organizationId),
    );
    for (const row of reveal) {
        if (row.secondOrganizationId !== undefined) {
            revealed.add(row.secondOrganizationId);
        }
    }
    assert.deepEqual(
        [...stored].sort(),
        [...revealed].sort(),
    );
    const b = reveal.find(
        (row) => row.section === 'B',
    );
    assert.ok(b);
    const pii = await deriveIdentityPii(
        db, 'JbaPyILUCkLRVIVxJlHMSg',
    );
    assert.equal(pii.name, 'B Admin');
    assert.equal(
        pii.email,
        'b-admin@test-plan.example',
    );
});

test('non-AA admin emails are unique',
async () => {
    const { reveal } = await seeded();
    const emails = reveal.map(
        (row) => row.adminUsername,
    );
    assert.equal(new Set(emails).size, 14);
    for (const row of reveal) {
        if (row.section === 'AA') continue;
        assert.equal(
            row.adminUsername,
            row.section.toLowerCase()
                + '-admin@test-plan.example',
        );
        assert.equal(
            row.organizationId,
            sliceEntityId(
                row.section.toLowerCase() + '-org',
            ),
        );
    }
});

test('AA and thin slices seed no ideas',
async () => {
    const { db, reveal } = await seeded();
    for (const section of [
        'AA', 'F2', 'H', 'I',
    ] as const) {
        const row = reveal.find(
            (s) => s.section === section,
        );
        assert.ok(row);
        const ideas = await deriveIdeas(
            db, row.organizationId,
        );
        assert.equal(
            ideas.length, 0, section,
        );
    }
});

test('system identity exists once',
async () => {
    const { db } = await seeded();
    const requests = await db.messagePairs.getAll();
    const system = requests.filter((r) =>
        r.uri_collection === '/identities/'
        && r.uri_id === SYSTEM_MEMBER_ID,
    );
    assert.equal(system.length, 1);
});

test('B slice has a seated extra member',
async () => {
    const { db, reveal } = await seeded();
    const b = reveal.find(
        (row) => row.section === 'B',
    );
    assert.ok(b);
    assert.equal(
        b.seatUsername,
        'b-member@test-plan.example',
    );
    assert.ok(
        (b.seatPassword ?? '').length >= 16,
    );
    const seats =
        await deriveMembershipsForIdentity(
            db, 'VbxXtvAkgQzhoXQZkbnHVg',
        );
    assert.equal(seats.length, 1);
    assert.equal(seats[0]!.organization_id,
        b.organizationId);
    assert.equal(b.flowId, 'UXOPfjdZZohCcyCLlQWnuQ');
    const flows = await deriveFlows(
        db, b.organizationId,
    );
    assert.equal(flows.length, 1);
    assert.equal(flows[0]!.id, 'UXOPfjdZZohCcyCLlQWnuQ');
    assert.equal(flows[0]!.name, 'B Return Flow');
});

test('G slice has two organizations and an unseated',
async () => {
    const { db, reveal } = await seeded();
    const g = reveal.find(
        (row) => row.section === 'G',
    );
    assert.ok(g);
    assert.equal(g.secondOrganizationId, 'WlkfISpndVJfICRnWksipQ');
    assert.equal(
        g.secondOrganizationName, 'Wayne Enterprises',
    );
    const adminSeats =
        await deriveMembershipsForIdentity(
            db, 'kHaSgLhnsobjMXxNLEzpBw',
        );
    const organizationIds = new Set(
        adminSeats.map(
            (s) => s.organization_id,
        ),
    );
    assert.ok(organizationIds.has(g.organizationId));
    assert.ok(organizationIds.has('WlkfISpndVJfICRnWksipQ'));
    const unseated =
        await deriveMembershipsForIdentity(
            db, 'dtmZgnDBlVcoyjxKzlaKgA',
        );
    assert.equal(unseated.length, 0);
    const memberSeats =
        await deriveMembershipsForIdentity(
            db, 'dmGzDTZwsyIYCQhhRISXrw',
        );
    assert.equal(memberSeats.length, 1);
    assert.equal(
        memberSeats[0]!.organization_id,
        g.organizationId,
    );
    assert.equal(
        g.erasableUsername,
        'g-erasable@test-plan.example',
    );
    assert.ok(
        (g.erasablePassword ?? '').length >= 16,
    );
    const requests = await db.messagePairs.getAll();
    const agents = requests.filter((r) =>
        r.uri_collection === '/ai-agents/'
        && r.uri_id === 'NAWwhciBiPVcuqxjPhXwYA',
    );
    assert.equal(agents.length, 1);
});

test('SV slice has two seated identities',
async () => {
    const { db, reveal } = await seeded();
    const sv = reveal.find(
        (row) => row.section === 'SV',
    );
    assert.ok(sv);
    assert.equal(
        sv.seatUsername,
        'sv-member@test-plan.example',
    );
    const adminSeats =
        await deriveMembershipsForIdentity(
            db, 'hPrdaZfedPOJYevSaGziHw',
        );
    const memberSeats =
        await deriveMembershipsForIdentity(
            db, 'uVgzITlKxKcWZtGSPzmsqA',
        );
    assert.equal(adminSeats.length, 1);
    assert.equal(memberSeats.length, 1);
    assert.equal(
        adminSeats[0]!.organization_id,
        sv.organizationId,
    );
    assert.equal(
        memberSeats[0]!.organization_id,
        sv.organizationId,
    );
});

const GARDEN = [
    'C', 'D', 'E', 'F', 'FS', 'K', 'R',
] as const;

test('garden slices seed four idea states',
async () => {
    const { db, reveal } = await seeded();
    for (const section of GARDEN) {
        const row = reveal.find(
            (s) => s.section === section,
        );
        assert.ok(row, section);
        const ideas = await deriveIdeas(
            db, row.organizationId,
        );
        assert.equal(
            ideas.length, 4, section,
        );
        const states = new Set(
            ideas.map((idea) => idea.state),
        );
        assert.ok(states.has('active'), section);
        assert.ok(
            states.has('in_review'), section,
        );
        assert.ok(
            states.has('sent_back'), section,
        );
        assert.ok(
            states.has('approved'), section,
        );
    }
});

test('garden ideas each have one submission',
async () => {
    const { db, reveal } = await seeded();
    const requests = await db.messagePairs.getAll();
    for (const section of GARDEN) {
        const row = reveal.find(
            (s) => s.section === section,
        );
        assert.ok(row, section);
        const ideas = await deriveIdeas(
            db, row.organizationId,
        );
        assert.equal(ideas.length, 4, section);
        for (const idea of ideas) {
            const submissions = deriveDocumentsAt(
                requests,
                canonicalUriCollection(
                    row.organizationId,
                    '/ideas/' + idea.id
                        + '/submissions/',
                ),
            );
            assert.equal(
                submissions.size, 1, idea.id,
            );
        }
    }
});

test('garden slices seed three projects',
async () => {
    const { db, reveal } = await seeded();
    for (const section of GARDEN) {
        const row = reveal.find(
            (s) => s.section === section,
        );
        assert.ok(row, section);
        const projects = await deriveProjects(
            db, row.organizationId,
        );
        assert.equal(
            projects.length,
            section === 'K' ? 5 : 3,
            section,
        );
        const approved = projects.filter(
            (p) => p.state === 'approved',
        );
        assert.ok(
            approved.length >= 2, section,
        );
    }
});

test('garden slices seed four objectives',
async () => {
    const { db, reveal } = await seeded();
    const names = [
        'Lower expenses',
        'Increase incomes',
        'Raise customer NPS',
        'Improve employee morale',
    ];
    for (const section of GARDEN) {
        const row = reveal.find(
            (s) => s.section === section,
        );
        assert.ok(row, section);
        const [requests, responses] =
            await Promise.all([
                db.messagePairs.getAll(),
                db.messagePairs.getAll(),
            ]);
        const prefix =
            canonicalUriCollection(
                row.organizationId, '/objectives/',
            );
        const documents = deriveDocumentsAt(requests, prefix);
        assert.equal(
            documents.size, 4, section,
        );
        const got: string[] = [];
        for (const id of documents.keys()) {
            const revs =
                await deriveObjectiveRevisions(
                    db, row.organizationId, id,
                );
            assert.equal(
                revs.length, 1,
                section + ' ' + id,
            );
            got.push(revs[0]!.name);
        }
        assert.deepEqual(
            got.sort(), [...names].sort(),
            section,
        );
    }
});

test('garden slices seed Customer Profile',
async () => {
    const { db, reveal } = await seeded();
    for (const section of GARDEN) {
        const row = reveal.find(
            (s) => s.section === section,
        );
        assert.ok(row, section);
        const records =
            await deriveRecordTypeCollection(
                db, row.organizationId,
            );
        assert.equal(
            records.length,
            section === 'R' ? 2 : 1,
            section,
        );
        assert.ok(
            records.some(
                (r) => r.name === 'Customer Profile',
            ),
            section,
        );
    }
});

test('garden slices seed Customer Onboarding',
async () => {
    const { db, reveal } = await seeded();
    for (const section of GARDEN) {
        const row = reveal.find(
            (s) => s.section === section,
        );
        assert.ok(row, section);
        const flows = await deriveFlows(
            db, row.organizationId,
        );
        assert.equal(
            flows.length,
            section === 'F' ? 2 : 1,
            section,
        );
        const flow = flows.find((entry) =>
            entry.name === 'Customer Onboarding',
        );
        assert.ok(flow, section);
        const nodes = flow.graph['nodes'];
        assert.ok(
            Array.isArray(nodes), section,
        );
        const nodeNames = new Set(
            nodes.map((node) => {
                assert.ok(
                    node !== null
                    && typeof node === 'object',
                    section,
                );
                return String(
                    (node as { name: string })
                        .name,
                );
            }),
        );
        assert.ok(
            nodeNames.has('Create'), section,
        );
        assert.ok(
            nodeNames.has('Data Capture'),
            section,
        );
        assert.ok(
            nodeNames.has('Review'), section,
        );
        assert.ok(
            nodeNames.has('Archive'), section,
        );
    }
});

test('garden onboarding has three work orders',
async () => {
    const { db, reveal } = await seeded();
    for (const section of GARDEN) {
        const row = reveal.find(
            (s) => s.section === section,
        );
        assert.ok(row, section);
        const flows = await deriveFlows(
            db, row.organizationId,
        );
        const flow = flows.find((entry) =>
            entry.name === 'Customer Onboarding',
        );
        assert.ok(flow, section);
        const joins = await deriveFlowWorkOrders(
            db, row.organizationId, flow.id,
        );
        if (section === 'FS') {
            assert.ok(
                joins.length >= 12, section,
            );
            continue;
        }
        assert.equal(
            joins.length, 3, section,
        );
    }
});

test('slice seed pair count is pinned',
async () => {
    const { db } = await seeded();
    const requests =
        await db.messagePairs.getAll();
    assert.equal(
        requests.length, EXPECTED_SLICE_MESSAGE_PAIRS,
    );
});

test('slice seed request hashes are unique',
async () => {
    const { db } = await seeded();
    const requests = await db.messagePairs.getAll();
    const distinctHashes = new Set(
        requests.map((r) => r.request_hash),
    );
    // A collision would silently drop a pair via
    // appendMessagePair's same-hash dedup skip.
    assert.equal(
        distinctHashes.size, requests.length,
    );
});
