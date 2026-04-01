import { html, SafeHtml } from '../safe-html';
import {
    iconDollarSign,
    iconClock,
    iconZap,
} from '../icons';
import type {
    GaugeCard,
    GaugeIcon,
} from '../adapters/dashboard';

type ThemeStyle = {
    bg: string;
    iconBg: string;
    border: string;
};
const THEME_CONFIG: Record<
    GaugeCard['theme'],
    ThemeStyle
> = {
    blue: {
        bg:
            'background:'
            + 'hsl(var(--primary)/0.04)',
        iconBg:
            'background:linear-gradient('
            + '135deg,'
            + 'hsl(var(--primary)/0.2),'
            + 'hsl(var(--primary)/0.1))',
        border:
            'border-color:'
            + 'hsl(var(--primary)/0.15)',
    },
    green: {
        bg:
            'background:'
            + 'hsl(var(--success)/0.04)',
        iconBg:
            'background:linear-gradient('
            + '135deg,'
            + 'hsl(var(--success)/0.2),'
            + 'hsl(var(--success)/0.1))',
        border:
            'border-color:'
            + 'hsl(var(--success)/0.15)',
    },
    amber: {
        bg:
            'background:'
            + 'hsl(var(--warning)/0.04)',
        iconBg:
            'background:linear-gradient('
            + '135deg,'
            + 'hsl(var(--warning)/0.2),'
            + 'hsl(var(--warning)/0.1))',
        border:
            'border-color:'
            + 'hsl(var(--warning)/0.15)',
    },
};

const ICON_CONFIG: Record<
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
    readonly #theme: GaugeCard['theme'];
    readonly #title: string;
    readonly #icon: GaugeIcon;
    readonly #iconCssClass: string;
    readonly #outerValue: number;
    readonly #outerMax: number;
    readonly #outerLabel: string;
    readonly #outerDisplay: string;
    readonly #innerValue: number;
    readonly #innerMax: number;
    readonly #innerLabel: string;
    readonly #innerDisplay: string;
    readonly #hasOverrunWarning: boolean;

    constructor(card: GaugeCard) {
        this.#theme = card.theme;
        this.#title = card.title;
        this.#icon = card.icon;
        this.#iconCssClass =
            card.iconCssClass;
        this.#outerValue = card.outer.value;
        this.#outerMax = card.outer.max;
        this.#outerLabel = card.outer.label;
        this.#outerDisplay =
            card.outer.display;
        this.#innerValue = card.inner.value;
        this.#innerMax = card.inner.max;
        this.#innerLabel = card.inner.label;
        this.#innerDisplay =
            card.inner.display;
        this.#hasOverrunWarning =
            card.hasOverrunWarning;
    }

    buildGauge(): SafeHtml {
        const ts =
            THEME_CONFIG[this.#theme];
        const elementId = this.#title
            .replace(/\s+/g, '-')
            .toLowerCase();
        const iconFn =
            ICON_CONFIG[this.#icon]!;
        return html`
    <div class="card" style="${
        'border:2px solid transparent;'
        + ts.border + ';'
        + ts.bg + ';'
        + 'border-radius:0.75rem;'
        + 'padding:1.5rem;'
        + 'transition:all 0.3s'
    }">
        <div class="${
            'flex items-center gap-3 mb-5'
        }">
            <div style="${
                'width:2.5rem;'
                + 'height:2.5rem;'
                + 'border-radius:0.5rem;'
                + ts.iconBg + ';'
                + 'display:flex;'
                + 'align-items:center;'
                + 'justify-content:center'
            }">
                ${iconFn(
                    20, this.#iconCssClass,
                )}
            </div>
            <h3 class="${
                'text-sm font-semibold'
            }">${this.#title}</h3>
        </div>
        <div style="${
            'display:flex;'
            + 'justify-content:center;'
            + 'margin-bottom:1.25rem'
        }">
            ${this.#buildSvgArcs(elementId)}
        </div>
        ${this.#buildLegend()}
    </div>`;
    }

    #buildSvgArcs(
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
            this.#hasOverrunWarning
            && this.#innerValue
                > this.#innerMax;
        const stop0 =
            'hsl(var(--success))';
        const stop1 = isOverrun
            ? 'red'
            : 'hsl(var(--success))';

        let flashStyle = '';
        if (
            this.#hasOverrunWarning
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
                flashStyle =
                    'animation:gauge-flash '
                    + dur.toFixed(3)
                    + 's infinite';
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
            style="overflow:visible">
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
                style="${flashStyle}"/>
        </svg>`;
    }

    #buildLegend(): SafeHtml {
        const cellStyle =
            'text-align:center;'
            + 'padding:0.75rem;'
            + 'border-radius:0.5rem;'
            + 'background:'
            + 'hsl(var(--card)/0.8);'
            + 'border:1px solid '
            + 'hsl(var(--border)/0.5)';
        const dotBase =
            'width:0.625rem;'
            + 'height:0.625rem;'
            + 'border-radius:9999px;';
        return html`
        <div style="${
            'display:grid;'
            + 'grid-template-columns:'
            + '1fr 1fr;'
            + 'gap:1rem'
        }">
            <div style="${cellStyle}">
                <div class="${
                    'flex items-center '
                    + 'justify-center gap-2'
                }" style="${
                    'margin-bottom:0.25rem'
                }">
                    <div style="${
                        dotBase
                        + 'background:'
                        + 'hsl(var(--primary))'
                    }"></div>
                    <span class="${
                        'text-xs text-muted'
                    }" style="${
                        'font-weight:500'
                    }">${
                        this.#outerLabel
                    }</span>
                </div>
                <p class="${
                    'text-2xl font-bold'
                }">${
                    this.#outerDisplay
                }</p>
            </div>
            <div style="${cellStyle}">
                <div class="${
                    'flex items-center '
                    + 'justify-center gap-2'
                }" style="${
                    'margin-bottom:0.25rem'
                }">
                    <div style="${
                        dotBase
                        + 'background:'
                        + 'hsl(var(--success))'
                    }"></div>
                    <span class="${
                        'text-xs text-muted'
                    }" style="${
                        'font-weight:500'
                    }">${
                        this.#innerLabel
                    }</span>
                </div>
                <p class="${
                    'text-2xl font-bold'
                }">${
                    this.#innerDisplay
                }</p>
            </div>
        </div>`;
    }
}
