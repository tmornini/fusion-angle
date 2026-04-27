import { $ } from '../app/dom.ts';
import {
    html,
    mutateHtml,
} from '../app/safe-html.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import {
    getDashboardGauges,
} from '../app/adapters/index.ts';
import {
    GaugePresenter,
} from '../app/presenters/index.ts';

export async function init(
): Promise<void> {
    const container =
        $('#gauge-container', document);
    if (!container) return;

    const gauges =
        await withLoadingState(
            container,
            buildSkeleton('card-grid', 3),
            () => getDashboardGauges(),
            () => init(),
        );
    if (!gauges) return;

    const rendered = gauges.map(
        g => new GaugePresenter(g).render(),
    );
    mutateHtml(
        container,
        html`${rendered}`,
    );
}
