import { assert, assertMatch, assertStrictEquals } from
    '@std/assert';
import {
    currentOrganizationControlHtml,
    headerHostsFromReads,
    headerStatsHtml,
} from '../web-app/app/header-info.ts';

const STARK = {
    id: 'AjdvjuECVZEgZoFajaIEkg',
    name: 'Stark',
};
const WAYNE = {
    id: 'BBjWJsjYIDkTRKIIPrzWRw',
    name: 'Wayne',
};

Deno.test(
    'two organizations render the switcher',
    () => {
        const out = currentOrganizationControlHtml(
            [STARK, WAYNE],
        ).toString();
        assertMatch(out, /class="org-switcher"/);
        assertMatch(
            out,
            /aria-label="Switch organization"/,
        );
        assertMatch(
            out,
            /value="AjdvjuECVZEgZoFajaIEkg"/,
        );
        assertMatch(
            out,
            /value="BBjWJsjYIDkTRKIIPrzWRw"/,
        );
        assertStrictEquals(
            out.includes('header-stat-label'),
            false,
        );
        assertStrictEquals(
            out.includes('org-set-default'),
            false,
        );
    },
);

Deno.test(
    'one organization renders the name as text',
    () => {
        const out = currentOrganizationControlHtml(
            [STARK],
        ).toString();
        assertMatch(
            out,
            /class="header-stat-label">Stark</,
        );
        assertStrictEquals(
            out.includes('<select'),
            false,
        );
    },
);

Deno.test(
    'no organization renders an empty control',
    () => {
        assertStrictEquals(
            currentOrganizationControlHtml([])
                .toString(),
            '',
        );
    },
);

Deno.test(
    'stat tiles follow the organization control',
    () => {
        const out = headerStatsHtml(
            currentOrganizationControlHtml(
                [STARK, WAYNE],
            ),
            [{ value: 3, label: 'Ideas' }],
        ).toString();
        const selectAt = out.indexOf('org-switcher');
        const tileAt = out.indexOf(
            'header-stat-item',
        );
        assert(selectAt >= 0);
        assert(tileAt > selectAt);
        assertMatch(out, />3</);
        assertMatch(out, /Ideas/);
        assertMatch(out, /header-stat-divider/);
    },
);

Deno.test(
    'one organization keeps the name and the tiles',
    () => {
        const out = headerStatsHtml(
            currentOrganizationControlHtml([STARK]),
            [{ value: 1, label: 'Members' }],
        ).toString();
        assertMatch(out, />Stark</);
        assertMatch(out, /header-stat-item/);
        assertStrictEquals(
            out.includes('<select'),
            false,
        );
    },
);

const IDEAS = { value: 3, label: 'Ideas' };

Deno.test(
    'a failed stats read keeps the switcher',
    () => {
        const paint = headerHostsFromReads(
            [STARK, WAYNE], null,
        );
        const desktop = paint.desktop;
        const mobile = paint.mobile;
        assert(desktop !== null);
        assert(mobile !== null);
        const out = desktop.toString();
        assertMatch(out, /class="org-switcher"/);
        assertStrictEquals(
            out.includes('header-stat-item'),
            false,
        );
        assertMatch(
            mobile.toString(),
            /class="org-switcher"/,
        );
        assertStrictEquals(
            mobile.toString().includes(
                'header-stat-item',
            ),
            false,
        );
    },
);

Deno.test(
    'a failed stats read keeps one name',
    () => {
        const paint = headerHostsFromReads(
            [STARK], null,
        );
        const desktop = paint.desktop;
        assert(desktop !== null);
        const out = desktop.toString();
        assertMatch(
            out,
            /class="header-stat-label">Stark</,
        );
        assertStrictEquals(
            out.includes('header-stat-item'),
            false,
        );
        assertStrictEquals(
            out.includes('org-switcher'),
            false,
        );
    },
);

Deno.test(
    'a failed organization read keeps the tiles',
    () => {
        const paint = headerHostsFromReads(
            null, [IDEAS],
        );
        const desktop = paint.desktop;
        assert(desktop !== null);
        const out = desktop.toString();
        assertMatch(out, /class="header-stat-item"/);
        assertMatch(out, />3</);
        assertMatch(out, /Ideas/);
        assertStrictEquals(
            out.includes('org-switcher'),
            false,
        );
        assertStrictEquals(paint.mobile, null);
    },
);

Deno.test(
    'both reads keep the control before the tiles',
    () => {
        const paint = headerHostsFromReads(
            [STARK, WAYNE], [IDEAS],
        );
        const desktop = paint.desktop;
        const mobile = paint.mobile;
        assert(desktop !== null);
        assert(mobile !== null);
        const out = desktop.toString();
        const selectAt = out.indexOf('org-switcher');
        const tileAt = out.indexOf(
            'header-stat-item',
        );
        assert(selectAt >= 0);
        assert(tileAt > selectAt);
        assertMatch(
            mobile.toString(),
            /class="org-switcher"/,
        );
        assertStrictEquals(
            mobile.toString().includes(
                'header-stat-item',
            ),
            false,
        );
    },
);

Deno.test(
    'both failed reads paint nothing',
    () => {
        const paint = headerHostsFromReads(null, null);
        assertStrictEquals(paint.desktop, null);
        assertStrictEquals(paint.mobile, null);
    },
);

Deno.test(
    'an empty organization list is empty markup',
    () => {
        const paint = headerHostsFromReads([], null);
        const desktop = paint.desktop;
        const mobile = paint.mobile;
        assert(desktop !== null);
        assert(mobile !== null);
        assertStrictEquals(desktop.toString(), '');
        assertStrictEquals(mobile.toString(), '');
        assertStrictEquals(
            desktop.toString().includes(
                'org-switcher',
            ),
            false,
        );
    },
);

Deno.test(
    'mutateHeaderInfo settles each header read',
    async () => {
        const src = await Deno.readTextFile(
            'web-app/app/header-info.ts',
        );
        const at = src.indexOf(
            'async function mutateHeaderInfo',
        );
        assert(at >= 0);
        const body = src.slice(at);
        assert(body.includes('Promise.allSettled'));
        assert(
            body.includes(
                'organization list failed to load',
            ),
        );
        assert(
            body.includes(
                'header stats failed to load',
            ),
        );
    },
);
