import { $ } from '../app/dom';
import {
    html,
    mutateHtml,
} from '../app/safe-html';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    getDashboardGauges,
} from '../app/adapters';
import {
    GaugePresenter,
} from '../app/presenters';

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
