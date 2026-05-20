import { html, type SafeHtml } from '../safe-html.ts';
import { iconZap } from '../icons.ts';
import {
    formatSigned,
    toneForScore,
} from '../scoring-format.ts';
import { DISPLAY_ABSENT } from '../format.ts';

interface Summary {
    baselineMean: number | undefined;
    actualMean: number | undefined;
    projectCount: number;
    actualCount: number;
}

const CENTER_X = 90;
const CENTER_Y = 85;
const OUTER_R = 65;
const INNER_R = 45;
const DEG_TO_RAD = Math.PI / 180;

function arcEndpoint(
    value: number,
    radius: number,
): { x: number; y: number; sweep: 0 | 1 } {
    const sign = value >= 0 ? 1 : -1;
    const alphaDeg = (Math.abs(value) / 100) * 90;
    const svgAngleDeg = 270 + sign * alphaDeg;
    const rad = svgAngleDeg * DEG_TO_RAD;
    return {
        x: CENTER_X + radius * Math.cos(rad),
        y: CENTER_Y + radius * Math.sin(rad),
        sweep: sign > 0 ? 1 : 0,
    };
}

function toneFor(v: number | undefined): string {
    return v === undefined
        ? 'muted'
        : toneForScore(v);
}

function displaySigned(v: number | undefined): string {
    return v === undefined
        ? DISPLAY_ABSENT
        : formatSigned(v);
}

export class PortfolioImpactPresenter {
    readonly #s: Summary;

    constructor(s: Summary) {
        this.#s = s;
    }

    buildCard(): SafeHtml {
        const tone = toneFor(this.#s.baselineMean);
        return html`
            <section class="portfolio-impact-card"
                data-tone="${tone}">
                <header class="portfolio-impact-header">
                    <div class="icon-box"
                        data-tone="${tone}">
                        ${iconZap(20, '')}
                    </div>
                    <h3>Portfolio Impact</h3>
                </header>
                ${this.#renderSvg()}
                ${this.#renderLegend()}
            </section>
        `;
    }

    #renderSvg(): SafeHtml {
        const tdcX = CENTER_X;
        const outerTdcY = CENTER_Y - OUTER_R;
        const innerTdcY = CENTER_Y - INNER_R;

        const baselineArc =
            this.#s.baselineMean !== undefined
                ? this.#arcPath(
                    this.#s.baselineMean, OUTER_R,
                    tdcX, outerTdcY,
                )
                : '';
        const actualArc =
            this.#s.actualMean !== undefined
                ? this.#arcPath(
                    this.#s.actualMean, INNER_R,
                    tdcX, innerTdcY,
                )
                : '';
        const baselineTone = toneFor(this.#s.baselineMean);
        const actualTone = toneFor(this.#s.actualMean);

        return html`
            <svg viewBox="0 0 180 95"
                width="180" height="95"
                class="portfolio-impact-svg">
                <path
                    d="M 25 85 A 65 65 0 0 1 155 85"
                    class="portfolio-impact-bg-outer"
                    fill="none" stroke-linecap="round"/>
                <path
                    d="M 45 85 A 45 45 0 0 1 135 85"
                    class="portfolio-impact-bg-inner"
                    fill="none" stroke-linecap="round"/>
                <line x1="90" y1="14" x2="90" y2="24"
                    class="portfolio-impact-tdc"/>
                ${baselineArc
                    ? html`<path d="${baselineArc}"
                        class="portfolio-impact-arc-outer"
                        data-tone="${baselineTone}"
                        fill="none"
                        stroke-linecap="round"/>`
                    : html``}
                ${actualArc
                    ? html`<path d="${actualArc}"
                        class="portfolio-impact-arc-inner"
                        data-tone="${actualTone}"
                        fill="none"
                        stroke-linecap="round"/>`
                    : html``}
            </svg>
        `;
    }

    #arcPath(
        value: number,
        radius: number,
        tdcX: number,
        tdcY: number,
    ): string {
        const ep = arcEndpoint(value, radius);
        return 'M ' + tdcX + ' ' + tdcY
            + ' A ' + radius + ' ' + radius
            + ' 0 0 ' + ep.sweep
            + ' ' + ep.x.toFixed(2)
            + ' ' + ep.y.toFixed(2);
    }

    #renderLegend(): SafeHtml {
        return html`
            <div class="portfolio-impact-legend">
                <div class="legend-cell">
                    <div class="legend-dot"
                        data-tone="${toneFor(
                            this.#s.actualMean,
                        )}"></div>
                    <span>Actual</span>
                    <strong>${displaySigned(
                        this.#s.actualMean,
                    )}</strong>
                </div>
                <div class="legend-cell">
                    <div class="legend-dot"
                        data-tone="${toneFor(
                            this.#s.baselineMean,
                        )}"></div>
                    <span>Baseline</span>
                    <strong>${displaySigned(
                        this.#s.baselineMean,
                    )}</strong>
                </div>
            </div>
        `;
    }
}
