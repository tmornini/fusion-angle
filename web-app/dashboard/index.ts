import { $, $required } from '../app/dom.ts';
import {
    html,
    setHtml,
} from '../app/safe-html.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import {
    sessionContext,
    getDashboardGauges,
    startDashboardScoringReads,
    getObjectiveScoringInputs,
    buildObjectiveAggregates,
    buildObjectiveTrendlines,
    subscribeProjectScoreChanges,
    getCurrentObjectiveDefinitions,
    subscribeObjectiveChanges,
    subscribeProjectChanges,
    type DashboardScoringBundle,
} from '../app/adapters/index.ts';
import {
    GaugePresenter,
    DashboardObjectiveAggregatesPresenter,
} from '../app/presenters/index.ts';
import {
    fetchMeasureName,
    markEnd,
    markStart,
    renderMeasureName,
} from '../app/page-performance.ts';

type ObjectiveDefs = Awaited<
    ReturnType<typeof getCurrentObjectiveDefinitions>
>;

function definitionsFrom(
    ctx: ReturnType<typeof sessionContext>,
    objectivesP: Promise<
        DashboardScoringBundle['objectives']
    >,
): Promise<ObjectiveDefs> {
    return objectivesP.then(objectives =>
        getCurrentObjectiveDefinitions(
            ctx,
            objectives
                .filter(o => o.state === 'active')
                .sort(
                    (a, b) => a.position - b.position,
                )
                .map(o => o.id),
        ),
    );
}

async function fillObjectiveAggregatesCard(
    bundleP: Promise<DashboardScoringBundle>,
    defsP: Promise<ObjectiveDefs>,
): Promise<void> {
    const fetchName = fetchMeasureName(
        'objective-aggregates-card',
    );
    markStart(fetchName);
    const [bundle, defs] = await Promise.all([
        bundleP,
        defsP,
    ]);
    const inputs = getObjectiveScoringInputs(bundle);
    const active = inputs.activeObjectives;
    const aggregates =
        buildObjectiveAggregates(inputs);
    const trendlines =
        buildObjectiveTrendlines(inputs);
    markEnd(fetchName);
    const renderName = renderMeasureName(
        'objective-aggregates-card',
    );
    markStart(renderName);
    setHtml(
        $('#objective-aggregates-card', document)!,
        new DashboardObjectiveAggregatesPresenter(
            active, defs, aggregates, trendlines,
        ).buildCard(),
    );
    markEnd(renderName);
}

async function renderObjectiveAggregates(
): Promise<void> {
    const ctx = sessionContext();
    const { bundleP, objectivesP } =
        startDashboardScoringReads(ctx);
    await fillObjectiveAggregatesCard(
        bundleP,
        definitionsFrom(ctx, objectivesP),
    );
}

export async function init(
): Promise<void> {
    const container = $required(
        '#gauge-container', document,
    );

    const ctx = sessionContext();
    const { bundleP, objectivesP } =
        startDashboardScoringReads(ctx);
    const defsP = definitionsFrom(
        ctx, objectivesP,
    );
    await Promise.all([
        loadInto({
            container,
            skeleton: buildSkeleton('card-grid', 3),
            fetch: async () => getDashboardGauges(
                await bundleP,
            ),
            retry: () => init(),
            onData: gauges => {
                const rendered = gauges.map(
                    g => new GaugePresenter(g)
                        .render(),
                );
                setHtml(
                    container,
                    html`${rendered}`,
                );

                subscribeProjectScoreChanges(
                    renderObjectiveAggregates,
                );
                subscribeObjectiveChanges(
                    renderObjectiveAggregates,
                );
                subscribeProjectChanges(
                    renderObjectiveAggregates,
                );
            },
        }),
        fillObjectiveAggregatesCard(
            bundleP, defsP,
        ),
    ]);
}
