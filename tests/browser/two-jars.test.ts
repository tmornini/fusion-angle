import { assertStrictEquals } from '@std/assert';
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
    assertStrictEquals(res.status, 201);
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
    assertStrictEquals(submissionRes.status, 201);
    const readBack = await handleRequest(
        origin.db, apiRequest({
            method: 'GET',
            path: submissionsPath,
            token: await adminToken(),
        }),
    );
    const submissions = await readBack.json() as
        { idea_id: string }[];
    assertStrictEquals(submissions.length, 1);
    assertStrictEquals(submissions[0]?.idea_id, ideaId);
}

Deno.test('two contexts hold two identities on one origin',
async () => {
    // One try per acquisition, so a later failure still
    // releases the earlier resource: a newPage() reject
    // would otherwise strand the origin's HTTP listener.
    // disposeContext closes every target in its context,
    // so page.close() is redundant — and a redundant
    // reject would strand the releases outside it.
    const origin = await startOrigin();
    try {
        const a = await browser.get().newPage();
        try {
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
                assertStrictEquals(
                    await a.until<string>(MEMBER_NAME, 'chip A'),
                    'Tony Stark',
                );
                assertStrictEquals(
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
                assertStrictEquals(
                    await a.until<string>(MEMBER_NAME, 'chip A again'),
                    'Tony Stark',
                );
                const title = 'Two jars ' + generateIdentifier();
                await createIdea(origin, title);
                await b.navigate(registryUrl(origin.baseUrl, 'ideas'));
                await b.ready('ideas');
                await b.until(
                    `[...document.querySelectorAll('[data-idea-card]')]`
                    + `.some(c => c.textContent.includes(`
                    + `${JSON.stringify(title)}))`,
                    'idea visible to the second identity',
                );
            } finally {
                await browser.get()
                    .disposeContext(b.contextId);
            }
        } finally {
            await browser.get()
                .disposeContext(a.contextId);
        }
    } finally {
        await origin.close();
    }
});

Deno.test('two tabs share the cookie; sign-out in one bounces the other',
async () => {
    // One try per acquisition, as above. b is a second tab
    // inside a's context, so a's disposal releases it too —
    // b takes no guard of its own, and a reject from
    // newPageIn still reaches a's.
    const origin = await startOrigin();
    try {
        const a = await browser.get().newPage();
        try {
            const b = await browser.get()
                .newPageIn(a.contextId);
            await signIn(a, origin, ADMIN_EMAIL);
            await b.navigate(
                registryUrl(origin.baseUrl, 'dashboard'),
            );
            await b.ready('dashboard');
            assertStrictEquals(
                await b.until<string>(MEMBER_NAME, 'chip'),
                'Tony Stark',
            );
            await a.click('[data-signout]');
            await a.until(
                `location.pathname.includes('/auth/')`,
                'A on auth',
            );
            await b.navigate(
                registryUrl(origin.baseUrl, 'dashboard'),
            );
            await b.until(
                `location.pathname.includes('/auth/')`,
                'B bounced',
            );
        } finally {
            await browser.get()
                .disposeContext(a.contextId);
        }
    } finally {
        await origin.close();
    }
});
