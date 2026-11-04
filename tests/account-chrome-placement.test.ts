import { assert, assertMatch, assertStrictEquals } from
    '@std/assert';

function read(path: string): string {
    return Deno.readTextFileSync(path);
}

function at(src: string, needle: string): number {
    const found = src.indexOf(needle);
    assert(
        found >= 0,
        'missing ' + needle,
    );
    return found;
}

Deno.test(
    'sidebars keep the chip and drop the organization',
    () => {
        const desktop = read(
            'web-app/app/component-sidebar.html',
        );
        const mobile = read(
            'web-app/app/component-mobile-sidebar.html',
        );
        assertMatch(desktop, /id="sidebar-member-name"/);
        assertMatch(
            mobile,
            /id="mobile-sidebar-member-name"/,
        );
        assertMatch(desktop, /class="sidebar-member"/);
        assertMatch(mobile, /class="sidebar-member"/);
        for (const src of [desktop, mobile]) {
            assertStrictEquals(
                src.includes('sidebar-member-org'),
                false,
            );
            assertStrictEquals(
                src.includes('sidebar-org-switcher'),
                false,
            );
            assertStrictEquals(
                src.includes('org-switcher'),
                false,
            );
        }
        assertStrictEquals(
            desktop.includes('data-signout'),
            false,
        );
        assertStrictEquals(
            mobile.includes('data-signout'),
            false,
        );
    },
);

Deno.test(
    'the mobile header hosts the organization control',
    () => {
        const mobile = read(
            'web-app/app/component-mobile-header.html',
        );
        const title = at(
            mobile, 'mobile-header-title',
        );
        const organization = at(
            mobile, 'mobile-header-organization',
        );
        const search = at(
            mobile, 'mobile-search-toggle',
        );
        assert(title < organization);
        assert(organization < search);
    },
);

Deno.test(
    'the chip no longer loads the organization menu',
    () => {
        const src = read(
            'web-app/app/sidebar-member.ts',
        );
        assertStrictEquals(
            src.includes('organizationSwitcherHtml'),
            false,
        );
        assertStrictEquals(
            src.includes('wireOrganizationSwitcher'),
            false,
        );
        assertStrictEquals(
            src.includes('sidebar-member-org'),
            false,
        );
        assertStrictEquals(
            src.includes('getOrganizations'),
            false,
        );
        assertMatch(src, /sidebarMemberNavigation/);
    },
);

Deno.test(
    'the header paints and wires the organization',
    () => {
        const src = read('web-app/app/header-info.ts');
        assertMatch(src, /headerStatsHtml/);
        assertMatch(
            src, /currentOrganizationControlHtml/,
        );
        assertMatch(
            src, /#mobile-header-organization/,
        );
        assertMatch(src, /wireOrganizationSwitcher/);
        const layout = read('web-app/app/layout.ts');
        assertMatch(
            layout,
            /mutateHeaderInfo\(bootOrganizations\)/,
        );
        assertMatch(
            layout,
            /sessionIsOrganizationScoped\(\)/,
        );
        assertStrictEquals(
            layout.includes(
                'mutateSidebarMember(bootOrganizations)',
            ),
            false,
        );
    },
);

Deno.test(
    'a collapsed sidebar still hides the chip name',
    () => {
        const css = read(
            'web-app/app/styles/layout.css',
        );
        assertMatch(
            css,
            new RegExp(
                '\\.sidebar-collapsed'
                + ' \\.sidebar-member'
                + ' \\.flex-fill'
                + ' \\{ display: none; \\}',
            ),
        );
    },
);

function count(src: string, needle: string): number {
    return src.split(needle).length - 1;
}

Deno.test(
    'Sign out is the last control in both headers',
    () => {
        const top = read(
            'web-app/app/component-top-bar.html',
        );
        const mobile = read(
            'web-app/app/component-mobile-header.html',
        );
        assertStrictEquals(count(top, 'data-signout'), 1);
        assertStrictEquals(
            count(mobile, 'data-signout'), 1,
        );
        assertMatch(top, />Sign out</);
        assertMatch(mobile, />Sign out</);
        assert(
            at(top, 'invitations-bell')
            < at(top, 'data-signout'),
        );
        assert(
            at(mobile, 'mobile-sidebar-open')
            < at(mobile, 'mobile-header-title'),
        );
        assert(
            at(mobile, 'mobile-header-title')
            < at(mobile, 'mobile-header-organization'),
        );
        assert(
            at(mobile, 'mobile-header-organization')
            < at(mobile, 'mobile-search-toggle'),
        );
        assert(
            at(mobile, 'mobile-search-toggle')
            < at(mobile, 'data-signout'),
        );
    },
);

Deno.test(
    'Sign out leaves both sidebars',
    () => {
        const desktop = read(
            'web-app/app/component-sidebar.html',
        );
        const mobile = read(
            'web-app/app/'
            + 'component-mobile-sidebar.html',
        );
        assertStrictEquals(
            count(desktop, 'data-signout'), 0,
        );
        assertStrictEquals(
            count(mobile, 'data-signout'), 0,
        );
        assertStrictEquals(
            desktop.includes('sidebar-signout'),
            false,
        );
        assertStrictEquals(
            mobile.includes('sidebar-signout'),
            false,
        );
        const css = read(
            'web-app/app/styles/layout.css',
        );
        assertStrictEquals(
            css.includes('sidebar-signout'),
            false,
        );
    },
);

Deno.test(
    'Sign out wears the organization box surface',
    () => {
        const css = read(
            'web-app/app/styles/layout.css',
        );
        const box = css.slice(
            css.indexOf('.header-info {'),
            css.indexOf('.header-info:empty'),
        );
        const signOut = css.slice(
            css.indexOf(
                '.header-actions [data-signout] {',
            ),
            css.indexOf('.page-content {'),
        );
        assertStrictEquals(
            signOut.includes(
                'hsl(var(--muted) / 0.5)',
            ),
            true,
        );
        assertStrictEquals(
            signOut.includes(
                'hsl(var(--border) / 0.5)',
            ),
            true,
        );
        assertStrictEquals(
            box.includes('hsl(var(--muted) / 0.5)'),
            true,
        );
        assertStrictEquals(
            box.includes('hsl(var(--border) / 0.5)'),
            true,
        );
    },
);

Deno.test(
    'Sign out still revokes and then opens auth',
    () => {
        const src = read('web-app/app/layout.ts');
        assertMatch(
            src,
            /postSessionLogout\(sessionContext\(\)\)/,
        );
        assertMatch(
            src,
            /log\.warn\('sign-out revoke failed'/,
        );
        assertMatch(src, /finally \{/);
        assertMatch(src, /navigateTo\('auth'\)/);
        assertMatch(src, /\$\$\('\[data-signout\]'/);
    },
);

Deno.test(
    'stat tiles hide below 1024 and the organization stays',
    () => {
        const css = read(
            'web-app/app/styles/layout.css',
        );
        assertStrictEquals(
            css.includes(
                '#header-stats { display: none; }',
            ),
            false,
        );
        assertMatch(
            css,
            new RegExp(
                '@media \\(max-width: 1023px\\)'
                + ' \\{\\s*'
                + '#header-stats \\.header-stat-item,'
                + '\\s*'
                + '#header-stats'
                + ' \\.header-stat-divider'
                + ' \\{\\s*'
                + 'display: none;\\s*\\}',
            ),
        );
        assertMatch(
            css,
            new RegExp(
                '\\.top-header'
                + ' \\{ display: none !important; \\}',
            ),
        );
        assertMatch(
            css,
            new RegExp(
                '@media \\(min-width: 768px\\)'
                + ' \\{\\s*'
                + '\\.mobile-header'
                + ' \\{ display: none !important; \\}',
            ),
        );
        const responsive = read(
            'web-app/app/styles/responsive.css',
        );
        assertMatch(
            responsive,
            new RegExp(
                '@media \\(max-width: 767px\\)'
                + ' \\{\\s*'
                + '\\.hidden-mobile'
                + ' \\{ display: none !important; \\}',
            ),
        );
        const top = read(
            'web-app/app/component-top-bar.html',
        );
        assertMatch(top, /id="header-stats"/);
        assertMatch(top, /hidden-mobile/);
    },
);
