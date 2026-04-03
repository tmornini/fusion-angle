import { $ } from '../app/dom';
import {
    html,
    setHtml,
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

export async function init(): Promise<void> {
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

    const presenters = gauges.map(
        g => new GaugePresenter(g),
    );
    setHtml(
        container,
        html`${presenters.map(
            g => g.buildGauge(),
        )}`,
    );
}
