import {
    html,
    SafeHtml,
} from '../safe-html.ts';
import {
    iconDollarSign,
    iconClock,
    iconZap,
} from '../icons.ts';
import type {
    BipolarArc,
    GaugeData,
    GaugeIcon,
    GaugeTheme,
    RatioGauge,
} from '../adapters/dashboard.ts';

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
const ARC_OUTER_HALF = Math.PI * ARC_OUTER_R / 2;
const ARC_INNER_HALF = Math.PI * ARC_INNER_R / 2;
const OUTER_PATH_D =
    'M 25 85 A 65 65 0 0 1 155 85';
const INNER_PATH_D =
    'M 45 85 A 45 45 0 0 1 135 85';
const OUTER_HALF_LEFT_D =
    'M 90 20 A 65 65 0 0 0 25 85';
const OUTER_HALF_RIGHT_D =
    'M 90 20 A 65 65 0 0 1 155 85';
const INNER_HALF_LEFT_D =
    'M 90 40 A 45 45 0 0 0 45 85';
const INNER_HALF_RIGHT_D =
    'M 90 40 A 45 45 0 0 1 135 85';
const ARC_APEX_X = 90;
const OUTER_APEX_Y = 20;
const INNER_APEX_Y = 40;
const ZERO_MARK_R = 4;

interface SvgDims {
    readonly width: number;
    readonly height: number;
}

const SVG_DIMS: Record<
    'large' | 'small',
    SvgDims
> = {
    large: { width: 180, height: 95 },
    small: { width: 100, height: 53 },
};

interface BipolarFill {
    readonly half: 'left' | 'right' | 'zero' | 'none';
    readonly offset: number;
}

function bipolarFill(
    value: number | undefined,
    halfArc: number,
): BipolarFill {
    if (value === undefined) {
        return { half: 'none', offset: 0 };
    }
    if (value === 0) {
        return { half: 'zero', offset: 0 };
    }
    const mag = Math.min(
        100, Math.abs(value),
    ) / 100;
    return {
        half: value < 0 ? 'left' : 'right',
        offset: halfArc - mag * halfArc,
    };
}

function buildBipolarGradient(
    id: string,
    side: 'left' | 'right',
): SafeHtml {
    const x1 = side === 'left' ? '100%' : '0%';
    const x2 = side === 'left' ? '0%' : '100%';
    const extreme = side === 'left'
        ? 'hsl(var(--error))'
        : 'hsl(var(--success))';
    return html`
                <linearGradient
                    id="${id}"
                    x1="${x1}" y1="0%"
                    x2="${x2}" y2="0%">
                    <stop offset="0%"
                        stop-color="${
                            'hsl(var(--warning))'
                        }"
                        stop-opacity="0.6"/>
                    <stop offset="100%"
                        stop-color="${extreme}"
                        stop-opacity="1"/>
                </linearGradient>`;
}

function buildBipolarFillPath(
    fill: BipolarFill,
    leftPathD: string,
    rightPathD: string,
    leftGradId: string,
    rightGradId: string,
    halfArc: number,
    apexY: number,
): SafeHtml {
    if (fill.half === 'none') return html``;
    if (fill.half === 'zero') {
        return html`
            <circle class="gauge-arc-zero-mark"
                cx="${ARC_APEX_X}" cy="${apexY}"
                r="${ZERO_MARK_R}"/>`;
    }
    const d = fill.half === 'left'
        ? leftPathD
        : rightPathD;
    const gradId = fill.half === 'left'
        ? leftGradId
        : rightGradId;
    return html`
            <path class="gauge-arc-bipolar-half"
                d="${d}"
                fill="none"
                stroke="${
                    'url(#' + gradId + ')'
                }"
                stroke-linecap="round"
                stroke-dasharray="${halfArc}"
                stroke-dashoffset="${fill.offset}"
                style="${
                    '--dash-full:' + halfArc
                }"/>`;
}

export function buildBipolarGaugeSvg(
    outer: BipolarArc,
    inner: BipolarArc,
    elementId: string,
    size: 'large' | 'small',
): SafeHtml {
    const outerFill = bipolarFill(
        outer.value, ARC_OUTER_HALF,
    );
    const innerFill = bipolarFill(
        inner.value, ARC_INNER_HALF,
    );
    const dims = SVG_DIMS[size];
    const ol = 'outer-left-' + elementId;
    const or = 'outer-right-' + elementId;
    const il = 'inner-left-' + elementId;
    const ir = 'inner-right-' + elementId;
    return html`
        <svg width="${dims.width}"
            height="${dims.height}"
            viewBox="0 0 180 95"
            class="overflow-visible"
            data-size="${size}">
            <defs>
                ${buildBipolarGradient(ol, 'left')}
                ${buildBipolarGradient(or, 'right')}
                ${buildBipolarGradient(il, 'left')}
                ${buildBipolarGradient(ir, 'right')}
            </defs>
            <path class="gauge-arc-track"
                d="${OUTER_PATH_D}"
                fill="none"
                stroke="${
                    'hsl(var(--muted))'
                }"
                stroke-linecap="round"
                opacity="0.3"/>
            ${buildBipolarFillPath(
                outerFill,
                OUTER_HALF_LEFT_D,
                OUTER_HALF_RIGHT_D,
                ol, or, ARC_OUTER_HALF,
                OUTER_APEX_Y,
            )}
            <path class="gauge-arc-track"
                d="${INNER_PATH_D}"
                fill="none"
                stroke="${
                    'hsl(var(--muted))'
                }"
                stroke-linecap="round"
                opacity="0.3"/>
            ${buildBipolarFillPath(
                innerFill,
                INNER_HALF_LEFT_D,
                INNER_HALF_RIGHT_D,
                il, ir, ARC_INNER_HALF,
                INNER_APEX_Y,
            )}
        </svg>`;
}

function buildRatioGaugeSvg(
    data: RatioGauge,
    elementId: string,
): SafeHtml {
    const outer = data.outer;
    const inner = data.inner;
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
        inner.value > inner.max;
    const stop0 =
        'hsl(var(--success))';
    const stop1 = isOverrun
        ? 'hsl(var(--error))'
        : 'hsl(var(--success))';

    let innerClass = 'gauge-arc-inner';
    let innerStyle =
        '--dash-full:' + innerArc;
    if (inner.max > 0) {
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
            <path class="gauge-arc-track"
                d="${OUTER_PATH_D}"
                fill="none"
                stroke="${
                    'hsl(var(--muted))'
                }"
                stroke-linecap="round"
                opacity="0.3"/>
            <path
                class="gauge-arc-outer"
                d="${OUTER_PATH_D}"
                fill="none"
                stroke="${
                    'url(#outer-'
                    + elementId + ')'
                }"
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
            <path class="gauge-arc-track"
                d="${INNER_PATH_D}"
                fill="none"
                stroke="${
                    'hsl(var(--muted))'
                }"
                stroke-linecap="round"
                opacity="0.3"/>
            <path
                class="${innerClass}"
                d="${INNER_PATH_D}"
                fill="none"
                stroke="${
                    'url(#inner-'
                    + elementId + ')'
                }"
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

export class GaugePresenter {
    readonly #data: GaugeData;

    constructor(data: GaugeData) {
        this.#data = data;
    }

    render(): SafeHtml {
        const data = this.#data;
        const elementId = data.title
            .replace(/\s+/g, '-')
            .toLowerCase();
        const tone = THEME_TONE[data.theme];
        const iconFn = ICON_FNS[data.icon];
        const svgArcs = data.kind === 'ratio'
            ? buildRatioGaugeSvg(
                data, elementId,
            )
            : buildBipolarGaugeSvg(
                data.outer,
                data.inner,
                elementId,
                'large',
            );
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
                    data.iconCssClass,
                )}
            </div>
            <h3 class="${
                'text-sm font-semibold'
            }">${data.title}</h3>
        </div>
        <div class="gauge-arc-container">
            ${svgArcs}
        </div>
        ${this.#renderLegend()}
    </div>`;
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
