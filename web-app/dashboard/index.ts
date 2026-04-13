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

    const rendered = gauges.map(g => {
        const p = new GaugePresenter();
        g.presentGaugeInto(p);
        return p.render();
    });
    setHtml(
        container,
        html`${rendered}`,
    );
}
