import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { handleRequest } from '../../api/api.ts';
import { nowUtc } from '../../api/types.ts';
import { STARK_ORGANIZATION } from
    '../../api/mock-data/seed-constants.ts';
import { generateIdentifier } from
    '../../shared/identifier.ts';
import { apiRequest } from '../http-fixtures.ts';
import {
    ADMIN_EMAIL, SECOND_EMAIL, adminToken, signIn,
    startOrigin, useBrowser, type Origin,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const MEMBER_NAME =
    `document.querySelector('#sidebar-member-name')`
    + `?.textContent?.trim() || null`;

// The seed's admin identity (Tony Stark) — a member of
// every seeded org, so it always resolves for
// getMemberMap's submitter lookup regardless of which org
// the created idea lands in.
const ADMIN_MEMBER_ID = 'XXZruirZyAOoRpNxaDnpSA';

// web-app/app/adapters/ideas.ts's getIdeas throws 'Idea has
// no submission: <id>' for any idea row with no matching
// submission document — taking the WHOLE ideas list down
// for every viewer, not just this one. A document PUT alone
// is not a renderable idea, so this helper also writes the
// submission, mirroring the live PUT organizations/:id/
// ideas/:id/submissions/:sid shape proven in
// tests/api-nested-stream.test.ts, then reads the
// submissions collection back to confirm the row landed.
async function createIdea(
    origin: Origin, title: string,
): Promise<void> {
    const ideaId = generateIdentifier();
    const res = await handleRequest(origin.db, apiRequest({
        method: 'PUT',
        path: `/organizations/${STARK_ORGANIZATION}`
            + `/ideas/${ideaId}`,
        token: await adminToken(),
        body: {
            title,
            position: 1,
            problem_statement: 'p',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            state: 'active',
        },
    }));
    assert.equal(res.status, 201);
    const submissionsPath =
        `/organizations/${STARK_ORGANIZATION}`
        + `/ideas/${ideaId}/submissions/`;
    const submissionRes = await handleRequest(
        origin.db, apiRequest({
            method: 'PUT',
            path: submissionsPath + generateIdentifier(),
            token: await adminToken(),
            body: {
                idea_id: ideaId,
                member_id: ADMIN_MEMBER_ID,
                at: nowUtc(),
            },
        }),
    );
    assert.equal(submissionRes.status, 201);
    const readBack = await handleRequest(
        origin.db, apiRequest({
            method: 'GET',
            path: submissionsPath,
            token: await adminToken(),
        }),
    );
    const submissions = await readBack.json() as
        { idea_id: string }[];
    assert.equal(submissions.length, 1);
    assert.equal(submissions[0]?.idea_id, ideaId);
}

test('two contexts hold two identities on one origin',
async () => {
    const origin = await startOrigin();
    const a = await browser.get().newPage();
    const b = await browser.get().newPage();
    try {
        // Positive proof of isolation: B is a fresh
        // context with no cookie at all, so a protected
        // route bounces it to auth before it ever signs
        // in. Same bounce-to-auth idiom as the second
        // test.
        await b.navigate(registryUrl(origin.baseUrl, 'dashboard'));
        await b.until(
            `location.pathname.includes('/auth/')`,
            'B has no cookie before signing in',
        );
        await signIn(a, origin, ADMIN_EMAIL);
        await signIn(b, origin, SECOND_EMAIL);
        assert.equal(
            await a.until<string>(MEMBER_NAME, 'chip A'),
            'Tony Stark',
        );
        assert.equal(
            await b.until<string>(MEMBER_NAME, 'chip B'),
            'Sarah Chen',
        );
        // The chip renders once at boot with no live-
        // refresh path (web-app/app/sidebar-member.ts), so
        // the two reads above only prove each context
        // rendered once before the other ever signed in —
        // not that A stays isolated from B afterwards.
        // Force A to read again now that B has signed in:
        // under a shared cookie jar this re-navigation
        // would render Sarah, not Tony.
        await a.navigate(registryUrl(origin.baseUrl, 'dashboard'));
        await a.ready('dashboard');
        assert.equal(
            await a.until<string>(MEMBER_NAME, 'chip A again'),
            'Tony Stark',
        );
        const title = 'Two jars ' + generateIdentifier();
        await createIdea(origin, title);
        await b.navigate(registryUrl(origin.baseUrl, 'ideas'));
        await b.ready('ideas');
        await b.until(
            `[...document.querySelectorAll('[data-idea-card]')]`
            + `.some(c => c.textContent.includes(${JSON.stringify(title)}))`,
            'idea visible to the second identity',
        );
    } finally {
        // disposeContext closes every target in its
        // context, so page.close() is redundant — and a
        // redundant reject would strand the releases
        // below, including the origin's HTTP listener.
        // Nest each release so it runs even if an earlier
        // one rejects.
        try {
            await browser.get().disposeContext(a.contextId);
        } finally {
            try {
                await browser.get()
                    .disposeContext(b.contextId);
            } finally {
                await origin.close();
            }
        }
    }
});

test('two tabs share the cookie; sign-out in one bounces the other',
async () => {
    const origin = await startOrigin();
    const a = await browser.get().newPage();
    const b = await browser.get().newPageIn(a.contextId);
    try {
        await signIn(a, origin, ADMIN_EMAIL);
        await b.navigate(registryUrl(origin.baseUrl, 'dashboard'));
        await b.ready('dashboard');
        assert.equal(
            await b.until<string>(MEMBER_NAME, 'chip'),
            'Tony Stark',
        );
        await a.click('[data-signout]');
        await a.until(`location.pathname.includes('/auth/')`, 'A on auth');
        await b.navigate(registryUrl(origin.baseUrl, 'dashboard'));
        await b.until(`location.pathname.includes('/auth/')`, 'B bounced');
    } finally {
        try {
            await browser.get().disposeContext(a.contextId);
        } finally {
            await origin.close();
        }
    }
});
