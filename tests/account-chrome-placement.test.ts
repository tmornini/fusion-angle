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
        assertMatch(desktop, /data-signout/);
        assertMatch(mobile, /data-signout/);
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
