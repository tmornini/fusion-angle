import {
    html,
    SafeHtml,
} from '../safe-html';
import {
    iconDollarSign,
    iconClock,
    iconZap,
} from '../icons';
import type {
    GaugeData,
    GaugeIcon,
    GaugeTheme,
} from '../adapters/dashboard';

type GaugeTone =
    'primary' | 'success' | 'warning';

const THEME_TONE: Record<
    GaugeTheme,
    GaugeTone
> = {
    blue: 'primary',
    green: 'success',
    amber: 'warning',
};

const ICON_FNS: Record<
    GaugeIcon,
    (
        size: number,
        cssClass: string,
    ) => SafeHtml
> = {
    dollarSign: iconDollarSign,
    clock: iconClock,
    zap: iconZap,
};

const ARC_OUTER_R = 65;
const ARC_INNER_R = 45;

export class GaugePresenter {
    readonly #data: GaugeData;

    constructor(data: GaugeData) {
        this.#data = data;
    }

    render(): SafeHtml {
        const elementId = this.#data.title
            .replace(/\s+/g, '-')
            .toLowerCase();
        const tone =
            THEME_TONE[this.#data.theme];
        const iconFn =
            ICON_FNS[this.#data.icon];
        return html`
    <div class="card gauge-card"
        data-tone="${tone}">
        <div class="${
            'flex items-center gap-3 mb-5'
        }">
            <div class="icon-box"
                data-tone="${tone}">
                ${iconFn(
                    20,
                    this.#data.iconCssClass,
                )}
            </div>
            <h3 class="${
                'text-sm font-semibold'
            }">${this.#data.title}</h3>
        </div>
        <div class="gauge-arc-container">
            ${this.#renderSvgArcs(elementId)}
        </div>
        ${this.#renderLegend()}
    </div>`;
    }

    #renderSvgArcs(
        elementId: string,
    ): SafeHtml {
        const outer = this.#data.outer;
        const inner = this.#data.inner;
        const hasOverrun =
            this.#data.hasOverrunWarning;
        const outerPct =
            outer.max > 0
                ? Math.min(
                    (outer.value
                        / outer.max)
                        * 100,
                    100,
                )
                : 0;
        const innerPct =
            inner.max > 0
                ? Math.min(
                    (inner.value
                        / inner.max)
                        * 100,
                    100,
                )
                : 0;
        const outerArc =
            Math.PI * ARC_OUTER_R;
        const innerArc =
            Math.PI * ARC_INNER_R;
        const isOverrun =
            hasOverrun
            && inner.value > inner.max;
        const stop0 =
            'hsl(var(--success))';
        const stop1 = isOverrun
            ? 'red'
            : 'hsl(var(--success))';

        let innerClass = 'gauge-arc-inner';
        let innerStyle =
            '--dash-full:' + innerArc;
        if (
            hasOverrun
            && inner.max > 0
        ) {
            const ratio =
                inner.value / inner.max;
            if (ratio > 1.5) {
                const dur = Math.max(
                    0.333,
                    1 - (ratio - 1.5)
                        * 0.667,
                );
                innerClass += ' overrun';
                innerStyle +=
                    ';--flash-speed:'
                    + dur.toFixed(3) + 's';
            }
        }

        const outerOff =
            outerArc
            - (outerPct / 100) * outerArc;
        const innerOff =
            innerArc
            - (innerPct / 100) * innerArc;

        return html`
        <svg width="180" height="95"
            viewBox="0 0 180 95"
            class="overflow-visible">
            <defs>
                <linearGradient
                    id="${
                        'outer-' + elementId
                    }"
                    x1="0%" y1="0%"
                    x2="100%" y2="0%">
                    <stop offset="0%"
                        stop-color="${
                            'hsl(var('
                            + '--primary))'
                        }"
                        stop-opacity="${
                            '0.4'
                        }"/>
                    <stop offset="100%"
                        stop-color="${
                            'hsl(var('
                            + '--primary))'
                        }"
                        stop-opacity="${
                            '1'
                        }"/>
                </linearGradient>
                <linearGradient
                    id="${
                        'inner-' + elementId
                    }"
                    x1="0%" y1="0%"
                    x2="100%" y2="0%">
                    <stop offset="0%"
                        stop-color="${stop0}"
                        stop-opacity="${
                            '0.4'
                        }"/>
                    <stop offset="100%"
                        stop-color="${stop1}"
                        stop-opacity="${
                            '1'
                        }"/>
                </linearGradient>
            </defs>
            <path
                d="${
                    'M 25 85 A 65 65'
                    + ' 0 0 1 155 85'
                }"
                fill="none"
                stroke="${
                    'hsl(var(--muted))'
                }"
                stroke-width="14"
                stroke-linecap="round"
                opacity="0.3"/>
            <path
                class="gauge-arc-outer"
                d="${
                    'M 25 85 A 65 65'
                    + ' 0 0 1 155 85'
                }"
                fill="none"
                stroke="${
                    'url(#outer-'
                    + elementId + ')'
                }"
                stroke-width="14"
                stroke-linecap="round"
                stroke-dasharray="${
                    outerArc
                }"
                stroke-dashoffset="${
                    outerOff
                }"
                style="${
                    '--dash-full:'
                    + outerArc
                }"/>
            <path
                d="${
                    'M 45 85 A 45 45'
                    + ' 0 0 1 135 85'
                }"
                fill="none"
                stroke="${
                    'hsl(var(--muted))'
                }"
                stroke-width="14"
                stroke-linecap="round"
                opacity="0.3"/>
            <path
                class="${innerClass}"
                d="${
                    'M 45 85 A 45 45'
                    + ' 0 0 1 135 85'
                }"
                fill="none"
                stroke="${
                    'url(#inner-'
                    + elementId + ')'
                }"
                stroke-width="14"
                stroke-linecap="round"
                stroke-dasharray="${
                    innerArc
                }"
                stroke-dashoffset="${
                    innerOff
                }"
                style="${innerStyle}"/>
        </svg>`;
    }

    #renderLegend(): SafeHtml {
        const inner = this.#data.inner;
        const outer = this.#data.outer;
        return html`
        <div class="${
            'grid grid-cols-2 gap-4'
        }">
            <div class="legend-cell">
                <div class="${
                    'flex items-center '
                    + 'justify-center gap-2 mb-1'
                }">
                    <div class="legend-dot"
                        data-tone="success">
                    </div>
                    <span
                        class="legend-cell-label"
                    >${inner.label}</span>
                </div>
                <p class="legend-cell-value">${
                    inner.display
                }</p>
            </div>
            <div class="legend-cell">
                <div class="${
                    'flex items-center '
                    + 'justify-center gap-2 mb-1'
                }">
                    <div class="legend-dot"
                        data-tone="primary">
                    </div>
                    <span
                        class="legend-cell-label"
                    >${outer.label}</span>
                </div>
                <p class="legend-cell-value">${
                    outer.display
                }</p>
            </div>
        </div>`;
    }
}
