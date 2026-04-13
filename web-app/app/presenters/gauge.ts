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
    GaugeReceiver,
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

export class GaugePresenter
    implements GaugeReceiver
{
    #title = '';
    #tone: GaugeTone = 'primary';
    #iconFn: (
        size: number,
        cls: string,
    ) => SafeHtml = iconClock;
    #iconCss = '';
    #outerValue = 0;
    #outerMax = 0;
    #outerLabel = '';
    #outerDisplay = '';
    #innerValue = 0;
    #innerMax = 0;
    #innerLabel = '';
    #innerDisplay = '';
    #hasOverrun = false;

    title(text: string): void {
        this.#title = text;
    }

    theme(name: GaugeTheme): void {
        this.#tone = THEME_TONE[name];
    }

    icon(
        name: GaugeIcon,
        cssClass: string,
    ): void {
        this.#iconFn = ICON_FNS[name];
        this.#iconCss = cssClass;
    }

    outerArc(
        value: number,
        max: number,
        label: string,
        display: string,
    ): void {
        this.#outerValue = value;
        this.#outerMax = max;
        this.#outerLabel = label;
        this.#outerDisplay = display;
    }

    innerArc(
        value: number,
        max: number,
        label: string,
        display: string,
    ): void {
        this.#innerValue = value;
        this.#innerMax = max;
        this.#innerLabel = label;
        this.#innerDisplay = display;
    }

    overrunWarning(
        enabled: boolean,
    ): void {
        this.#hasOverrun = enabled;
    }

    render(): SafeHtml {
        const elementId = this.#title
            .replace(/\s+/g, '-')
            .toLowerCase();
        return html`
    <div class="card gauge-card"
        data-tone="${this.#tone}">
        <div class="${
            'flex items-center gap-3 mb-5'
        }">
            <div class="icon-box"
                data-tone="${this.#tone}">
                ${this.#iconFn(
                    20, this.#iconCss,
                )}
            </div>
            <h3 class="${
                'text-sm font-semibold'
            }">${this.#title}</h3>
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
        const outerPct =
            this.#outerMax > 0
                ? Math.min(
                    (this.#outerValue
                        / this.#outerMax)
                        * 100,
                    100,
                )
                : 0;
        const innerPct =
            this.#innerMax > 0
                ? Math.min(
                    (this.#innerValue
                        / this.#innerMax)
                        * 100,
                    100,
                )
                : 0;
        const outerArc =
            Math.PI * ARC_OUTER_R;
        const innerArc =
            Math.PI * ARC_INNER_R;
        const isOverrun =
            this.#hasOverrun
            && this.#innerValue
                > this.#innerMax;
        const stop0 =
            'hsl(var(--success))';
        const stop1 = isOverrun
            ? 'red'
            : 'hsl(var(--success))';

        let innerClass = 'gauge-arc-inner';
        let innerStyle =
            '--dash-full:' + innerArc;
        if (
            this.#hasOverrun
            && this.#innerMax > 0
        ) {
            const ratio =
                this.#innerValue
                / this.#innerMax;
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
                    >${this.#innerLabel}</span>
                </div>
                <p class="legend-cell-value">${
                    this.#innerDisplay
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
                    >${this.#outerLabel}</span>
                </div>
                <p class="legend-cell-value">${
                    this.#outerDisplay
                }</p>
            </div>
        </div>`;
    }
}
