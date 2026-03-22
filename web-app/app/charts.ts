import {
    SafeHtml,
    trusted,
    escapeForHtml,
} from './safe-html';

export interface ChartDatum {
    label: string;
    value: number;
    color?: string;
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
        + ' stroke-opacity="0.15"/>';
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
        40,
        (width - padding * 2)
            / data.length
            - 8,
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
        const color =
            datum.color
            || colors[index % colors.length];
        bars +=
            '<rect'
            + ` x="${x}"`
            + ` y="${y}"`
            + ` width="${barWidth}"`
            + ` height="${barHeight}"`
            + ' rx="4"'
            + ` fill="${color}"`
            + ' opacity="0.85"/>';
        if (showLabels) {
            bars +=
                '<text'
                + ` x="${x + barWidth / 2}"`
                + ` y="${height - padding + 16}"`
                + ' text-anchor="middle"'
                + ' fill="currentColor"'
                + ' font-size="10"'
                + ' opacity="0.6">'
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
            + ' r="3"'
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
        + ' stroke-width="2"'
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
    const radius = size / 2 - 10;
    const strokeWidth = 20;
    const total = data.reduce(
        (sum, datum) => sum + datum.value,
        0,
    );
    const circumference =
        2 * Math.PI * radius;

    let offset = 0;
    let arcs = '';
    data.forEach((datum, index) => {
        const percentage =
            datum.value / total;
        const dash =
            percentage * circumference;
        const color =
            datum.color
            || colors[index % colors.length];
        arcs +=
            '<circle'
            + ` cx="${cx}"`
            + ` cy="${cy}"`
            + ` r="${radius}"`
            + ' fill="none"'
            + ` stroke="${color}"`
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
        + ' stop-opacity="0.3"/>'
        + '<stop offset="100%"'
        + ` stop-color="${color}"`
        + ' stop-opacity="0.02"/>'
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
        + ' stroke-width="2"'
        + ' stroke-linecap="round"'
        + ' stroke-linejoin="round"/>'
        + '</svg>',
    );
}
