import { html, type SafeHtml } from '../safe-html.ts';
import { buildPageUrl } from '../navigation.ts';
import { buildBipolarGaugeSvg } from './gauge.ts';
import { buildSparkline } from './sparkline.ts';
import type { ProjectObjectiveRow } from
    '../scoring-aggregate.ts';

export class DashboardObjectiveProjectsPresenter {
    readonly #name: string;
    readonly #rows: readonly ProjectObjectiveRow[];

    constructor(
        name: string,
        rows: readonly ProjectObjectiveRow[],
    ) {
        this.#name = name;
        this.#rows = rows;
    }

    buildCard(): SafeHtml {
        return html`
            <div class="${
                'card gauge-card'
                + ' objective-aggregates-card'
                + ' objective-drill'
            }">
                <div class="${
                    'flex items-center'
                    + ' justify-between mb-5'
                }">
                    <h3 class="${
                        'text-sm font-semibold'
                    }">${this.#name}</h3>
                    <button type="button"
                        class="link"
                        data-drill-back
                        aria-label="${
                            'Back to objectives'
                        }">⊗</button>
                </div>
                <ul class="${
                    'objective-aggregates-rows'
                }">
                    ${this.#rows.map(
                        item => this.#row(item),
                    )}
                </ul>
            </div>
        `;
    }

    #row(item: ProjectObjectiveRow): SafeHtml {
        const gauge = buildBipolarGaugeSvg(
            {
                value: item.baseline,
                label: 'Baseline',
                display: '',
            },
            {
                value: item.latestActual,
                label: 'Actual',
                display: '',
            },
            'drill-' + item.projectId,
            'small',
        );
        return html`
            <li class="score-row"
                data-project-id="${item.projectId}"
                data-empty="${
                    item.points.length === 0
                }">
                <span class="score-row-label">
                    <a class="score-row-link" href="${
                        buildPageUrl(
                            'project-detail',
                            {
                                projectId: item.projectId,
                            },
                        )}">${item.title}</a>
                </span>
                <span class="score-row-gauge">
                    ${gauge}
                </span>
                <span class="score-row-sparkline">
                    ${buildSparkline(item.points)}
                </span>
            </li>
        `;
    }
}
