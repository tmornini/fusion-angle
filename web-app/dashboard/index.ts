import { $ } from '../app/dom.ts';
import {
    html,
    setHtml,
} from '../app/safe-html.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import {
    createRequestContext,
    getDashboardGauges,
    getObjectiveAggregates,
    subscribeProjectScoreChanges,
    getActiveObjectives,
    getCurrentObjectiveDefinition,
    subscribeObjectiveChanges,
    subscribeProjectChanges,
} from '../app/adapters/index.ts';
import {
    GaugePresenter,
    DashboardObjectiveAggregatesPresenter,
} from '../app/presenters/index.ts';

async function renderObjectiveAggregates(
): Promise<void> {
    const ctx = createRequestContext();
    const [active, aggregates] =
        await Promise.all([
            getActiveObjectives(ctx),
            getObjectiveAggregates(ctx),
        ]);
    const defs = new Map<string,
        { name: string; description: string }>();
    for (const o of active) {
        defs.set(o.id,
            await getCurrentObjectiveDefinition(
                ctx, o.id,
            ));
    }
    setHtml(
        $('#objective-aggregates-card', document)!,
        new DashboardObjectiveAggregatesPresenter(
            active, defs, aggregates,
        ).buildCard(),
    );
}

export async function init(
): Promise<void> {
    const container =
        $('#gauge-container', document);
    if (!container) return;

    const ctx = createRequestContext();
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
