import { assert, assertStrictEquals } from '@std/assert';
import { handleRequest } from '../../api/api.ts';
import { nowUtc } from '../../shared/types.ts';
import { STARK_ORGANIZATION } from
    '../../api/mock-data/seed-constants.ts';
import { membershipNameOf } from
    '../../shared/membership-name.ts';
import { apiRequest } from '../http-fixtures.ts';
import {
    adminToken, signIn, startOrigin, useBrowser,
    withTimeout,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
// A seeded Wayne-only human: Stark can invite him.
const DAVID_EMAIL = 'david.martinez@company.com';
const DAVID = 'DAjUkaBUIZbXSQeoLDZEXQ';
const INVITATIONS =
    `/organizations/${STARK_ORGANIZATION}/invitations/`;
const ACCEPT = '[data-invitation-action="accept"]';

Deno.test('an accept over a revoke paints the row'
+ ' revoked (V10)', async () => {
    await withTimeout((async () => {
        // One try per acquisition, so a later failure
        // still releases the earlier resource.
        const origin = await startOrigin();
        try {
            const granted = await handleRequest(
                origin.db, apiRequest({
                    method: 'POST',
                    path: INVITATIONS,
                    token: await adminToken(),
                    body: {
                        email: DAVID_EMAIL,
                        grantAt: nowUtc(),
                    },
                }),
            );
            assertStrictEquals(granted.status, 201);
            await granted.body?.cancel();
            const etag = granted.headers.get('etag');
            assert(etag !== null);
            const page = await browser.get().newPage();
            try {
                await signIn(page, origin, DAVID_EMAIL);
                await page.navigate(registryUrl(
                    origin.baseUrl, 'invitations',
                ));
                await page.ready('invitations');
                await page.waitFor(ACCEPT);
                // The admin revokes while the invitee's
                // page still holds the pending head.
                const revoked = await handleRequest(
                    origin.db, apiRequest({
                        method: 'PUT',
                        path: INVITATIONS
                            + membershipNameOf(
                                STARK_ORGANIZATION, DAVID,
                            ),
                        token: await adminToken(),
                        body: {
                            state: 'revoked',
                            at: nowUtc(),
                        },
                        headers: { 'If-Match': etag },
                    }),
                );
                assertStrictEquals(revoked.status, 200);
                await revoked.body?.cancel();
                await page.click(ACCEPT);
                await page.until(
                    `document.querySelector(`
                    + `'#invitations-list').textContent`
                    + `.includes('Revoked')`,
                    'row painted revoked',
                );
                assertStrictEquals(
                    await page.evaluate<number>(
                        `document.querySelectorAll(`
                        + `'[data-invitation-action]')`
                        + `.length`,
                    ),
                    0,
                );
                assert(
                    await page.until<boolean>(
                        `[...document.querySelectorAll(`
                        + `'.toast')].some(t =>`
                        + ` t.textContent.includes(`
                        + `'This invitation changed'))`,
                        'changed toast',
                    ),
                );
            } finally {
                await browser.get()
                    .disposeContext(page.contextId);
            }
        } finally {
            await origin.close();
        }
    })(), 'V10 revoked accept');
});
