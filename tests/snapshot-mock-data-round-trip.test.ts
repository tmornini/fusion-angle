// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    getSnapshot,
    putSnapshot,
} from '../web-app/app/adapters/snapshots.ts';
import type { DbAdapter } from '../api/db.ts';
import { deriveOrganizations } from '../api/derive-organizations.ts';
import { deriveMemberParents } from '../api/derive-members.ts';
import { deriveIdeas } from '../api/derive-ideas.ts';
import { deriveProjects } from '../api/derive-projects.ts';
import { deriveFlows } from '../api/derive-flows.ts';
import { seededMockDb } from './mock-seed.ts';

// The snapshot a running app exports must re-import.
// seed -> getSnapshot -> putSnapshot is the round trip
// no other test exercises. ai_members.name is a current
// column (api/types.ts AIMemberEntity.name, seeded at
// api/mock-data.ts) — a stale retired-key entry once
// made the exporter emit what the importer rejected.
test(
    'a seeded snapshot re-imports and keeps an AI'
    + ' member name',
    async () => {
        const db = await seededMockDb();
        const ctx = createRequestContext(
            db, await organizationToken(),
        );
        const json = await getSnapshot(ctx);
        await putSnapshot(ctx, json);
        // Phase Final Task 2: ai_members ROW half stripped —
        // name from pair-plane GET.
        const ai = await ctx.GET<{
            id: string; name: string;
        }>('ai-agents/tuJwPxYtBur2KCLquScShB');
        assert.equal(ai.name, 'Claude Opus 4.8');
        // Phase Final Stage B: roster tables retired.
    },
);

// The per-family DERIVED reads the live app actually serves —
// requests/responses pairs reduced through each family's own
// derive-*.ts, NOT the raw table snapshot slice — so THIS is
// what a round trip must reproduce, byte-for-byte, for the
// staleness class Phase 12 Task 6 closes to stay closed.
// Organizations (Task 5's own flip) rides here alongside three
// earlier-flipped families for breadth, per the family ids
// deriveOrganizations itself returns — no hardcoded org id.
async function deriveFamilies(db: DbAdapter): Promise<{
    organizations: unknown;
    members: unknown;
    ideas: unknown;
    projects: unknown;
    flows: unknown;
}> {
    const organizations = await deriveOrganizations(db);
    const members = await deriveMemberParents(db);
    const ideas = (await Promise.all(
        organizations.map((o) => deriveIdeas(db, o.id)),
    )).flat();
    const projects = (await Promise.all(
        organizations.map((o) => deriveProjects(db, o.id)),
    )).flat();
    const flows = (await Promise.all(
        organizations.map((o) => deriveFlows(db, o.id)),
    )).flat();
    return { organizations, members, ideas, projects, flows };
}

// seed -> export -> wipe -> import -> the derived reads match
// pre-export exactly. Drives BOTH gates: getSnapshot/putSnapshot
// are the web-app pair (this file's own precedent, above), so
// the client pre-flight (scanForRetiredKeys) and the server-side
// universal gate (parseAndValidateSnapshot) both run on the
// import call — a stale or unmarked export would reject here,
// not derive silently empty.
//
// THE PURITY ARGUMENT (why 5 families proves all thirteen
// registered families, without building derive scaffolding for
// the other eight): every derive-*.ts is a PURE function of the
// requests/responses tables — no family's derivation reads any
// OTHER table. So if requests and responses round-trip BYTE-
// IDENTICAL (the pair-plane leg below), then EVERY family's
// derived read is preserved by construction — a pure function
// of an unchanged input cannot produce a changed output. The 5
// explicit derives (organizations, members, ideas, projects,
// flows) stay as END-TO-END demonstrations through the real
// reduction, not as the sole proof: they catch a bug in a
// derive-*.ts itself, which byte-equality of the raw tables
// cannot.
test(
    'the snapshot round trip derives clean: every derived'
    + ' family reads back identical after wipe and reimport',
    async () => {
        const db = await seededMockDb();
        const ctx = createRequestContext(
            db, await organizationToken(),
        );
        const before = await deriveFamilies(db);
        const requestsBefore = await db.requests.getAll();
        const responsesBefore = await db.responses.getAll();
        const json = await getSnapshot(ctx);
        await db.deleteSchema();
        assert.equal(
            await db.hasSchema(), false,
            'wipe must clear the schema marker',
        );
        await putSnapshot(ctx, json);
        assert.equal(
            await db.hasSchema(), true,
            'import must restore the schema marker',
        );
        const after = await deriveFamilies(db);
        assert.deepEqual(after, before);
        assert.ok(
            before.organizations.length > 0,
            'the seed must carry at least one organization'
            + ' for this comparison to be meaningful',
        );
        // The pair-plane leg: byte-identical requests/responses
        // extends the 5-family spot-check above to all thirteen
        // registered families by the purity argument in this
        // test's own header comment.
        const requestsAfter = await db.requests.getAll();
        const responsesAfter = await db.responses.getAll();
        assert.deepEqual(requestsAfter, requestsBefore);
        assert.deepEqual(responsesAfter, responsesBefore);
        assert.ok(
            requestsBefore.length > 0,
            'the seed must carry at least one message pair'
            + ' for this comparison to be meaningful',
        );
    },
);
