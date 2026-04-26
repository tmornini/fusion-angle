import { html, SafeHtml } from '../safe-html';
import {
    iconZap,
    iconTarget,
    iconMessageSquare,
    iconHeart,
} from '../icons';
import {
    isDimensionKey,
    type DimensionKey,
} from '../adapters';

const LABELS: Record<DimensionKey, string> = {
    driver: 'Mover',
    analytical: 'Shaker',
    expressive: 'Prover',
    amiable: 'Maker',
};

const ICONS: Record<
    DimensionKey,
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

const ORDER: readonly DimensionKey[] = [
    'driver',
    'analytical',
    'expressive',
    'amiable',
];

export class WorkingStylesPresenter {
    readonly #dimensions:
        Record<DimensionKey, number>;

    constructor(
        dimensions: Record<string, number>,
    ) {
        const validated:
            Partial<Record<
                DimensionKey, number
            >> = {};
        for (
            const [key, value]
            of Object.entries(dimensions)
        ) {
            if (!isDimensionKey(key)) {
                throw new Error(
                    'Unknown dimension key: '
                    + key,
                );
            }
            validated[key] = value;
        }
        this.#dimensions = validated as Record<
            DimensionKey, number
        >;
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
            ] as [DimensionKey, number]);
        return html`${entries.map(
            ([key, value]) => this.#buildRow(
                key, value,
            ),
        )}`;
    }

    #buildRow(
        key: DimensionKey,
        value: number,
    ): SafeHtml {
        const label = LABELS[key]!;
        const icon = ICONS[key]!;
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
