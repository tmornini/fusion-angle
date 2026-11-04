import { assertMatch, assertStrictEquals } from
    '@std/assert';
import {
    sidebarMemberNavigation,
} from '../web-app/app/sidebar-member.ts';

const SESSION_IDENTITY = 'pnXmXrxOWayANgDLdCjuBw';

Deno.test(
    'the identity chip opens identity-detail',
    () => {
        const [page, params] =
            sidebarMemberNavigation(SESSION_IDENTITY);
        assertStrictEquals(page, 'identity-detail');
        assertStrictEquals(
            params.identityId,
            SESSION_IDENTITY,
        );
        assertStrictEquals(
            Object.hasOwn(params, 'memberId'),
            false,
        );
    },
);

Deno.test(
    'the chip no longer opens member-detail',
    () => {
        const src = Deno.readTextFileSync(
            'web-app/app/sidebar-member.ts',
        );
        assertStrictEquals(
            src.includes('member-detail'),
            false,
        );
        assertMatch(src, /identity-detail/);
        assertMatch(src, /sidebarMemberNavigation/);
    },
);
