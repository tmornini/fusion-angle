import { assertMatch, assertStrictEquals } from
    '@std/assert';

Deno.test(
    'identity detail reads and commits the default',
    () => {
        const src = Deno.readTextFileSync(
            'web-app/identities/detail.ts',
        );
        assertMatch(
            src, /readDefaultOrganizationField/,
        );
        assertMatch(src, /getOrganizations\(ctx\)/);
        assertMatch(
            src, /getIdentityDefaultOrganization\(ctx\)/,
        );
        assertMatch(
            src,
            /log\.warn\(\s*'default organization field omitted'/,
        );
        assertMatch(src, /commitDefaultOrganization/);
        assertMatch(
            src,
            new RegExp(
                'putIdentityDefaultOrganization\\('
                + '\\s*sessionContext\\(\\),'
                + '\\s*organization,?\\s*\\)',
            ),
        );
        assertMatch(
            src, /defaultOrganizationHtml\(currentId\)/,
        );
        assertStrictEquals(
            src.includes('ACTIVE_ORGANIZATION_ID'),
            false,
        );
        assertStrictEquals(
            src.includes('reload'),
            false,
        );
        assertStrictEquals(
            src.includes('org-switcher'),
            false,
        );
    },
);
