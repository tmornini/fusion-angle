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
    getPortfolioImpactSummary,
    getObjectiveAggregates,
    subscribeProjectScoreChanges,
    getActiveObjectives,
    getCurrentObjectiveDefinition,
    subscribeObjectiveChanges,
    subscribeProjectChanges,
} from '../app/adapters/index.ts';
import {
    GaugePresenter,
    PortfolioImpactPresenter,
    DashboardObjectiveAggregatesPresenter,
} from '../app/presenters/index.ts';

async function renderImpactSurfaces(): Promise<void> {
    const ctx = createRequestContext();
    const [summary, active, aggregates] =
        await Promise.all([
            getPortfolioImpactSummary(ctx),
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
        $('#portfolio-impact-card', document)!,
        new PortfolioImpactPresenter(
            summary,
        ).buildCard(),
    );
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
        renderImpactSurfaces,
    );
    subscribeObjectiveChanges(renderImpactSurfaces);
    subscribeProjectChanges(renderImpactSurfaces);

    await renderImpactSurfaces();
}
