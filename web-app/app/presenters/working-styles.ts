import { html, SafeHtml } from '../safe-html';
import {
    iconZap,
    iconTarget,
    iconMessageSquare,
    iconHeart,
    iconStar,
} from '../icons';

const LABELS: Record<string, string> = {
    driver: 'Mover',
    analytical: 'Shaker',
    expressive: 'Prover',
    amiable: 'Maker',
};

const ICONS: Record<
    string,
    (
        size: number,
        cssClass: string,
    ) => SafeHtml
> = {
    driver: iconZap,
    analytical: iconTarget,
    expressive: iconMessageSquare,
    amiable: iconHeart,
};

const ORDER = [
    'driver',
    'analytical',
    'expressive',
    'amiable',
];

export class WorkingStylesPresenter {
    readonly #dimensions:
        Record<string, number>;

    constructor(
        dimensions: Record<string, number>,
    ) {
        this.#dimensions = dimensions;
    }

    buildCard(): SafeHtml {
        return html`
    <div class="card card-hover p-6 mb-6">
        <h3 class="${
            'font-display font-semibold'
            + ' mb-4'
        }">Working Styles</h3>
        ${this.buildRows()}
    </div>`;
    }

    buildRows(): SafeHtml {
        const entries = ORDER
            .filter(
                key => key in this.#dimensions,
            )
            .map(key => [
                key,
                this.#dimensions[key]!,
            ] as [string, number]);
        return html`${entries.map(
            ([key, value]) => this.#buildRow(
                key, value,
            ),
        )}`;
    }

    #buildRow(
        key: string,
        value: number,
    ): SafeHtml {
        const label = LABELS[key] ?? key;
        const icon = ICONS[key] ?? iconStar;
        return html`
            <div class="user-dim-row">
                <div class="${
                    'flex items-center'
                    + ' justify-between mb-2'
                }">
                    <div class="${
                        'flex items-center gap-2'
                    }">
                        ${icon(
                            16,
                            'text-primary',
                        )}
                        <span class="${
                            'text-sm'
                            + ' font-medium'
                        }">${label}</span>
                    </div>
                    <span class="${
                        'text-sm font-bold'
                        + ' text-primary'
                    }">${value}%</span>
                </div>
                <div class="${
                    'progress'
                    + ' user-dim-progress'
                }">
                    <div class="progress-fill"
                        style="${
                            '--progress-fill:'
                            + value + '%'
                        }"></div>
                </div>
            </div>`;
    }
}
