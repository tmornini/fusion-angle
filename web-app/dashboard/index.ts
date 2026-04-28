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
    getDashboardGauges,
    createFetchContext,
} from '../app/adapters/index.ts';
import {
    GaugePresenter,
} from '../app/presenters/index.ts';

export async function init(
): Promise<void> {
    const container =
        $('#gauge-container', document);
    if (!container) return;

    const ctx = createFetchContext();
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
}
