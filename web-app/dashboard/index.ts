import { $, $required } from '../app/dom.ts';
import {
    html,
    setHtml,
} from '../app/safe-html.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import {
    sessionContext,
    getDashboardGauges,
    getObjectiveScoringInputs,
    buildObjectiveAggregates,
    buildObjectiveTrendlines,
    subscribeProjectScoreChanges,
    getCurrentObjectiveDefinitions,
    subscribeObjectiveChanges,
    subscribeProjectChanges,
} from '../app/adapters/index.ts';
import {
    GaugePresenter,
    DashboardObjectiveAggregatesPresenter,
} from '../app/presenters/index.ts';

async function renderObjectiveAggregates(
): Promise<void> {
    const ctx = sessionContext();
    const inputs =
        await getObjectiveScoringInputs(ctx);
    const active = inputs.activeObjectives;
    const aggregates =
        buildObjectiveAggregates(inputs);
    const trendlines =
        buildObjectiveTrendlines(inputs);
    const defs =
        await getCurrentObjectiveDefinitions(
            ctx, active.map(o => o.id),
        );
    setHtml(
        $('#objective-aggregates-card', document)!,
        new DashboardObjectiveAggregatesPresenter(
            active, defs, aggregates, trendlines,
        ).buildCard(),
    );
}

export async function init(
): Promise<void> {
    const container = $required(
        '#gauge-container', document,
    );

    const ctx = sessionContext();
    const gauges =
        await withLoadingState(
            container,
            buildSkeleton('card-grid', 3),
            () => getDashboardGauges(ctx),
            () => init(),
        );
    if (!gauges) return;

    const rendered = gauges.map(
        g => new GaugePresenter(g).render(),
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

    await renderObjectiveAggregates();
}
