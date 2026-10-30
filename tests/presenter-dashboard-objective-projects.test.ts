import {
    assert,
    assertMatch,
    assertStrictEquals,
} from '@std/assert';
import { buildPageUrl } from
    '../web-app/app/navigation.ts';
import {
    DashboardObjectiveProjectsPresenter,
} from '../web-app/app/presenters/dashboard-objective-projects.ts';
import type { ProjectObjectiveRow } from
    '../web-app/app/scoring-aggregate.ts';

function row(
    projectId: string,
    title: string,
    baseline: number | undefined,
    latestActual: number | undefined,
    values: readonly number[],
): ProjectObjectiveRow {
    return {
        projectId,
        title,
        baseline,
        latestActual,
        points: values.map((value, index) => ({
            at: '2026-05-1'
                + index
                + 'T00:00:00.000000Z',
            value,
        })),
    };
}

function card(
    name: string,
    rows: readonly ProjectObjectiveRow[],
): string {
    return new DashboardObjectiveProjectsPresenter(
        name,
        rows,
    ).buildCard().toString();
}

function sliceRow(html: string, projectId: string): string {
    const start = html.indexOf(
        'data-project-id="' + projectId + '"',
    );
    assert(start >= 0, projectId);
    const slice = html.slice(start);
    return slice.slice(0, slice.indexOf('</li>'));
}

Deno.test(
    'the drilled header is the back button and the name',
    () => {
        const html = card('Raise income', []);
        assert(
            html.includes('objective-aggregates-card'),
        );
        assert(html.includes('objective-drill'));
        assert(html.includes('type="button"'));
        assert(html.includes('data-drill-back'));
        assert(html.includes('← Objectives'));
        assertMatch(
            html,
            /<h3[^>]*>\s*Raise income\s*<\/h3>/,
        );
        const heading = html.match(
            /<h3[^>]*>[\s\S]*?<\/h3>/,
        );
        assert(heading);
        assertStrictEquals(
            heading[0].includes('<a'),
            false,
        );
        assertStrictEquals(
            html.includes('icon-box'),
            false,
        );
        assertStrictEquals(
            html.includes('score-row'),
            false,
        );
        assertStrictEquals(
            html.includes('data-project-id'),
            false,
        );
    },
);

Deno.test(
    'a drilled row links the name and paints the gauge',
    () => {
        const html = card('Raise income', [
            row('p-b', 'Beta', 32, 25, [20, 40, 25]),
            row('p-a', 'Alpha', undefined, 25, []),
        ]);
        assert(
            html.indexOf('Beta') < html.indexOf('Alpha'),
        );
        const beta = sliceRow(html, 'p-b');
        const href = buildPageUrl('project-detail', {
            projectId: 'p-b',
        });
        assert(beta.includes('href="' + href + '"'));
        assert(beta.includes('data-size="small"'));
        assert(beta.includes(
            'id="outer-left-drill-p-b"',
        ));
        assertMatch(
            beta,
            /d="M 90 20 A 65 65 0 0 1 155 85"/,
        );
        assertMatch(
            beta,
            /d="M 90 40 A 45 45 0 0 1 135 85"/,
        );
        assert(beta.includes('data-direction="up"'));
        assert(beta.includes('data-direction="down"'));
        assert(beta.includes('data-empty="false"'));
        const alpha = sliceRow(html, 'p-a');
        assert(alpha.includes('data-empty="true"'));
        assertStrictEquals(
            /d="M 90 20/.test(alpha),
            false,
        );
        assertMatch(
            alpha,
            /d="M 90 40 A 45 45 0 0 1 135 85"/,
        );
    },
);

Deno.test(
    'drilled columns are desktop-only',
    () => {
        const metrics = Deno.readTextFileSync(
            'web-app/app/styles/components-metrics.css',
        );
        const aggregate = metrics.indexOf(
            '.objective-aggregates-card .score-row {\n'
            + '    grid-template-columns:'
            + ' 140px 110px 1fr;\n'
            + '}',
        );
        assert(aggregate >= 0);
        const media = metrics.indexOf(
            '@media (min-width: 768px) {',
        );
        const drilled = metrics.indexOf(
            '.objective-aggregates-card'
            + '.objective-drill .score-row',
        );
        const columns = metrics.indexOf(
            'grid-template-columns:'
            + ' 220px 110px 1fr;',
        );
        assert(media > aggregate);
        assert(drilled > media);
        assert(columns > drilled);
        const responsive = Deno.readTextFileSync(
            'web-app/app/styles/responsive.css',
        );
        assert(responsive.includes(
            '.objective-aggregates-card .score-row {\n'
            + '        grid-template-columns:'
            + ' minmax(0, 1fr) 110px;\n'
            + '    }',
        ));
    },
);
