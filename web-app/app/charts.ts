import {
    SafeHtml,
    trusted,
    escapeForHtml,
} from './safe-html';

const BASELINE_OPACITY = 0.15;
const BAR_FILL_OPACITY = 0.85;
const BAR_LABEL_OPACITY = 0.6;
const BAR_LABEL_FONT_SIZE = 10;
const BAR_LABEL_Y_OFFSET = 16;
const BAR_MAX_WIDTH = 40;
const BAR_GAP = 8;
const BAR_CORNER_RADIUS = 4;
const LINE_DOT_RADIUS = 3;
const LINE_STROKE_WIDTH = 2;
const DONUT_RADIUS_INSET = 10;
const DONUT_STROKE_WIDTH = 20;
const AREA_GRADIENT_TOP_OPACITY = 0.3;
const AREA_GRADIENT_BOTTOM_OPACITY = 0.02;

export interface ChartDatum {
    label: string;
    value: number;
    color: string;
}

export interface ChartConfig {
    width: number;
    height: number;
    colors: string[];
    showLabels: boolean;
    padding: number;
    id: string;
    accessibleLabel: string;
}

function computeChartLayout(
    data: ChartDatum[],
    config: ChartConfig,
) {
    const {
        width, height, padding, colors,
    } = config;
    const maxValue = Math.max(
        ...data.map(datum => datum.value),
    );
    const chartHeight =
        height - padding * 2;
    return {
        width,
        height,
        padding,
        colors,
        maxValue,
        chartHeight,
    };
}

function computeChartPoints(
    data: ChartDatum[],
    width: number,
    height: number,
    padding: number,
    maxValue: number,
    chartHeight: number,
) {
    const stepWidth =
        (width - padding * 2)
        / Math.max(data.length - 1, 1);
    return data.map((datum, index) => ({
        x: padding + index * stepWidth,
        y:
            height
            - padding
            - (datum.value / maxValue)
                * chartHeight,
    }));
}

function buildBaseline(
    padding: number,
    width: number,
    height: number,
): string {
    return '<line'
        + ` x1="${padding}"`
        + ` y1="${height - padding}"`
        + ` x2="${width - padding}"`
        + ` y2="${height - padding}"`
        + ' stroke="currentColor"'
        + ` stroke-opacity="${BASELINE_OPACITY}"/>`;
}

export function buildBarChart(
    data: ChartDatum[],
    config: ChartConfig,
): SafeHtml {
    if (!data.length) return trusted('');
    const {
        width,
        height,
        padding,
        colors,
        maxValue,
        chartHeight,
    } = computeChartLayout(data, config);
    const {
        showLabels, accessibleLabel,
    } = config;
    const barWidth = Math.min(
        BAR_MAX_WIDTH,
        (width - padding * 2)
            / data.length
            - BAR_GAP,
    );

    let bars = '';
    data.forEach((datum, index) => {
        const barHeight =
            (datum.value / maxValue)
            * chartHeight;
        const slotWidth =
            (width - padding * 2)
            / data.length;
        const x =
            padding
            + index * slotWidth
            + (slotWidth - barWidth) / 2;
        const y =
            height - padding - barHeight;
        bars +=
            '<rect'
            + ` x="${x}"`
            + ` y="${y}"`
            + ` width="${barWidth}"`
            + ` height="${barHeight}"`
            + ` rx="${BAR_CORNER_RADIUS}"`
            + ` fill="${datum.color}"`
            + ` opacity="${BAR_FILL_OPACITY}"/>`;
        if (showLabels) {
            bars +=
                '<text'
                + ` x="${x + barWidth / 2}"`
                + ` y="${
                    height - padding
                    + BAR_LABEL_Y_OFFSET
                }"`
                + ' text-anchor="middle"'
                + ' fill="currentColor"'
                + ` font-size="${BAR_LABEL_FONT_SIZE}"`
                + ` opacity="${BAR_LABEL_OPACITY}">`
                + escapeForHtml(datum.label)
                + '</text>';
        }
    });

    const label = escapeForHtml(
        accessibleLabel,
    );
    return trusted(
        '<svg'
        + ` width="${width}"`
        + ` height="${height}"`
        + ` viewBox="0 0 ${width} ${height}"`
        + ' xmlns='
        + '"http://www.w3.org/2000/svg"'
        + ' role="img"'
        + ` aria-label="${label}">`
        + `<title>${label}</title>`
        + buildBaseline(
            padding,
            width,
            height,
        )
        + bars
        + '</svg>',
    );
}

export function buildLineChart(
    data: ChartDatum[],
    config: ChartConfig,
): SafeHtml {
    if (!data.length) return trusted('');
    const {
        width,
        height,
        padding,
        maxValue,
        chartHeight,
    } = computeChartLayout(data, config);
    const {
        accessibleLabel, colors,
    } = config;
    const color = colors[0]!;
    const points = computeChartPoints(
        data,
        width,
        height,
        padding,
        maxValue,
        chartHeight,
    );

    const pathData = points
        .map(
            (point, index) =>
                `${index === 0 ? 'M' : 'L'}`
                + ` ${point.x} ${point.y}`,
        )
        .join(' ');
    let dotMarkup = '';
    points.forEach(point => {
        dotMarkup +=
            '<circle'
            + ` cx="${point.x}"`
            + ` cy="${point.y}"`
            + ` r="${LINE_DOT_RADIUS}"`
            + ` fill="${color}"/>`;
    });

    const label = escapeForHtml(
        accessibleLabel,
    );
    return trusted(
        '<svg'
        + ` width="${width}"`
        + ` height="${height}"`
        + ` viewBox="0 0 ${width} ${height}"`
        + ' xmlns='
        + '"http://www.w3.org/2000/svg"'
        + ' role="img"'
        + ` aria-label="${label}">`
        + `<title>${label}</title>`
        + buildBaseline(
            padding,
            width,
            height,
        )
        + `<path d="${pathData}"`
        + ' fill="none"'
        + ` stroke="${color}"`
        + ` stroke-width="${LINE_STROKE_WIDTH}"`
        + ' stroke-linecap="round"'
        + ' stroke-linejoin="round"/>'
        + dotMarkup
        + '</svg>',
    );
}

export function buildDonutChart(
    data: ChartDatum[],
    config: ChartConfig,
): SafeHtml {
    const {
        width: size, colors,
        accessibleLabel,
    } = config;
    if (!data.length) return trusted('');

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - DONUT_RADIUS_INSET;
    const strokeWidth = DONUT_STROKE_WIDTH;
    const total = data.reduce(
        (sum, datum) => sum + datum.value,
        0,
    );
    const circumference =
        2 * Math.PI * radius;

    let offset = 0;
    let arcs = '';
    data.forEach((datum, index) => {
        const percentage = total > 0
            ? datum.value / total
            : 0;
        const dash =
            percentage * circumference;
        arcs +=
            '<circle'
            + ` cx="${cx}"`
            + ` cy="${cy}"`
            + ` r="${radius}"`
            + ' fill="none"'
            + ` stroke="${datum.color}"`
            + ` stroke-width="${strokeWidth}"`
            + ' stroke-dasharray='
            + `"${dash}`
            + ` ${circumference - dash}"`
            + ' stroke-dashoffset='
            + `"${-offset}"`
            + ' transform='
            + `"rotate(-90 ${cx} ${cy})"`
            + ' stroke-linecap="round"/>';
        offset += dash;
    });

    const label = escapeForHtml(
        accessibleLabel,
    );
    return trusted(
        '<svg'
        + ` width="${size}"`
        + ` height="${size}"`
        + ` viewBox="0 0 ${size} ${size}"`
        + ' xmlns='
        + '"http://www.w3.org/2000/svg"'
        + ' role="img"'
        + ` aria-label="${label}">`
        + `<title>${label}</title>`
        + arcs
        + '</svg>',
    );
}

export function buildAreaChart(
    data: ChartDatum[],
    config: ChartConfig,
): SafeHtml {
    if (!data.length) return trusted('');
    const {
        width,
        height,
        padding,
        maxValue,
        chartHeight,
    } = computeChartLayout(data, config);
    const {
        colors, id, accessibleLabel,
    } = config;
    const color = colors[0]!;
    const points = computeChartPoints(
        data,
        width,
        height,
        padding,
        maxValue,
        chartHeight,
    );

    const linePath = points
        .map(
            (point, index) =>
                `${index === 0 ? 'M' : 'L'}`
                + ` ${point.x} ${point.y}`,
        )
        .join(' ');
    const lastPt =
        points[points.length - 1]!;
    const firstPt = points[0]!;
    const areaPath =
        linePath
        + ` L ${lastPt.x}`
        + ` ${height - padding}`
        + ` L ${firstPt.x}`
        + ` ${height - padding} Z`;
    const gradientId =
        `area-grad-${id}`;

    const label = escapeForHtml(
        accessibleLabel,
    );
    return trusted(
        '<svg'
        + ` width="${width}"`
        + ` height="${height}"`
        + ` viewBox="0 0 ${width} ${height}"`
        + ' xmlns='
        + '"http://www.w3.org/2000/svg"'
        + ' role="img"'
        + ` aria-label="${label}">`
        + `<title>${label}</title>`
        + '<defs>'
        + '<linearGradient'
        + ` id="${gradientId}"`
        + ' x1="0" y1="0"'
        + ' x2="0" y2="1">'
        + '<stop offset="0%"'
        + ` stop-color="${color}"`
        + ` stop-opacity="${AREA_GRADIENT_TOP_OPACITY}"/>`
        + '<stop offset="100%"'
        + ` stop-color="${color}"`
        + ` stop-opacity="${AREA_GRADIENT_BOTTOM_OPACITY}"/>`
        + '</linearGradient></defs>'
        + buildBaseline(
            padding,
            width,
            height,
        )
        + `<path d="${areaPath}"`
        + ` fill="url(#${gradientId})"/>`
        + `<path d="${linePath}"`
        + ' fill="none"'
        + ` stroke="${color}"`
        + ` stroke-width="${LINE_STROKE_WIDTH}"`
        + ' stroke-linecap="round"'
        + ' stroke-linejoin="round"/>'
        + '</svg>',
    );
}
