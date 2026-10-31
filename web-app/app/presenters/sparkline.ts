import { html, type SafeHtml } from '../safe-html.ts';
import type { TrendPoint } from
    '../scoring-aggregate.ts';
import { formatDate } from '../format.ts';
import {
    formatSigned,
    toneForScore,
} from '../scoring-format.ts';

const SPARK_HEIGHT = 96;
const SPARK_MID = SPARK_HEIGHT / 2;
const SPARK_PAD = 4;

type Direction = 'up' | 'down' | 'flat';

function directionForDelta(delta: number): Direction {
    if (delta > 0) return 'up';
    if (delta < 0) return 'down';
    return 'flat';
}

export function buildSparkline(
    points: readonly TrendPoint[],
): SafeHtml {
    if (points.length === 0) {
        return html`
            <span class="sparkline-wrap">
                <svg class="sparkline-svg"
                    viewBox="0 0 100 ${SPARK_HEIGHT}"
                    preserveAspectRatio="none">
                    ${axis(SPARK_MID)}
                </svg>
            </span>`;
    }
    const plotted = coords(points);
    const segments = plotted.slice(1).map((c, i) => {
        const prev = plotted[i]!;
        const dir = directionForDelta(
            points[i + 1]!.value - points[i]!.value,
        );
        return html`
            <line class="sparkline-seg"
                data-direction="${dir}"
                x1="${prev.x}" y1="${prev.y}"
                x2="${c.x}" y2="${c.y}"
                vector-effect="non-scaling-stroke"/>`;
    });
    const dots = plotted.map((c, i) =>
        dot(c.x, c.y, points, i));
    return html`
        <span class="sparkline-wrap">
            <svg class="sparkline-svg"
                viewBox="0 0 100 ${SPARK_HEIGHT}"
                preserveAspectRatio="none">
                ${axis(plotted[0]!.y)}
                ${segments}
            </svg>
            ${dots}
        </span>`;
}

function axis(y: number): SafeHtml {
    return html`
        <line class="sparkline-axis"
            x1="0" y1="${y}"
            x2="100" y2="${y}"/>`;
}

function coords(
    points: readonly TrendPoint[],
): { x: number; y: number }[] {
    const values = points.map(p => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const top = SPARK_PAD;
    const bottom = SPARK_HEIGHT - SPARK_PAD;
    return points.map((p, i) => ({
        x: points.length === 1
            ? 50
            : (i / (points.length - 1)) * 100,
        y: span === 0
            ? SPARK_MID
            : bottom
                - ((p.value - min) / span)
                    * (bottom - top),
    }));
}

function dot(
    x: number,
    y: number,
    points: readonly TrendPoint[],
    i: number,
): SafeHtml {
    const p = points[i]!;
    const date = formatDate(p.at);
    const xPct = x.toFixed(2);
    const yPct = (y / SPARK_HEIGHT * 100).toFixed(2);
    const tip = i === 0
        ? baselineTip(date, p.value)
        : changeTip(date, p, points[i - 1]!);
    const label = i === 0
        ? `Baseline ${date}, value ${p.value}`
        : `${date}, ${p.value} / `
            + formatSigned(
                p.value - points[i - 1]!.value,
            );
    const directionAttr = i === 0
        ? html``
        : html`data-direction="${directionForDelta(
            p.value - points[i - 1]!.value,
        )}"`;
    return html`
        <span class="spark-dot" role="img"
            ${directionAttr}
            style="${`--x:${xPct}%;--y:${yPct}%`}"
            tabindex="0"
            aria-label="${label}">
            ${tip}
        </span>`;
}

function baselineTip(
    date: string,
    value: number,
): SafeHtml {
    return html`
        <span class="spark-tip" aria-hidden="true">
            <span class="spark-tip-date">${
                date
            }</span>
            <span class="spark-tip-base">${
                `Baseline · ${value}`
            }</span>
        </span>`;
}

function changeTip(
    date: string,
    p: TrendPoint,
    prev: TrendPoint,
): SafeHtml {
    const change = p.value - prev.value;
    const readout = `${p.value} / ${
        formatSigned(change)
    }`;
    return html`
        <span class="spark-tip" aria-hidden="true">
            <span class="spark-tip-date">${
                date
            }</span>
            <span class="spark-tip-change"
                data-tone="${toneForScore(change)}">${
                readout
            }</span>
        </span>`;
}
