// ============================================
// FUSION AI — SVG Chart Rendering
// Bar, Line, Donut, Area charts as SafeHtml.
// ============================================

import { SafeHtml, trusted } from './safe-html';

export interface ChartDatum {
  label: string;
  value: number;
  color?: string;
}

export interface ChartConfig {
  width?: number;
  height?: number;
  colors?: string[];
  showLabels?: boolean;
  padding?: number;
  id?: string;
}

const defaultColors = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--error))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
];

function computeChartLayout(data: ChartDatum[], config?: ChartConfig) {
  const width = config?.width ?? 300;
  const height = config?.height ?? 200;
  const padding = config?.padding ?? 40;
  const colors = config?.colors ?? defaultColors;
  const maxValue = Math.max(...data.map(datum => datum.value));
  const chartHeight = height - padding * 2;
  return { width, height, padding, colors, maxValue, chartHeight };
}

function computeChartPoints(data: ChartDatum[], width: number, height: number, padding: number, maxValue: number, chartHeight: number) {
  const stepWidth = (width - padding * 2) / Math.max(data.length - 1, 1);
  return data.map((datum, index) => ({ x: padding + index * stepWidth, y: height - padding - (datum.value / maxValue) * chartHeight }));
}

function buildBaseline(padding: number, width: number, height: number): string {
  return `<line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="currentColor" stroke-opacity="0.15"/>`;
}

export function buildBarChart(data: ChartDatum[], config?: ChartConfig): SafeHtml {
  if (!data.length) return trusted('');
  const { width, height, padding, colors, maxValue, chartHeight } = computeChartLayout(data, config);
  const barWidth = Math.min(40, (width - padding * 2) / data.length - 8);

  let bars = '';
  data.forEach((datum, index) => {
    const barHeight = (datum.value / maxValue) * chartHeight;
    const x = padding + index * ((width - padding * 2) / data.length) + ((width - padding * 2) / data.length - barWidth) / 2;
    const y = height - padding - barHeight;
    const color = datum.color || colors[index % colors.length];
    bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="${color}" opacity="0.85"/>`;
    if (config?.showLabels !== false) {
      bars += `<text x="${x + barWidth / 2}" y="${height - padding + 16}" text-anchor="middle" fill="currentColor" font-size="10" opacity="0.6">${datum.label}</text>`;
    }
  });

  return trusted(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${buildBaseline(padding, width, height)}
    ${bars}
  </svg>`);
}

export function buildLineChart(data: ChartDatum[], config?: ChartConfig): SafeHtml {
  if (!data.length) return trusted('');
  const { width, height, padding, maxValue, chartHeight } = computeChartLayout(data, config);
  const color = config?.colors?.[0] ?? 'hsl(var(--primary))';
  const points = computeChartPoints(data, width, height, padding, maxValue, chartHeight);

  const pathData = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  let dotMarkup = '';
  points.forEach(point => {
    dotMarkup += `<circle cx="${point.x}" cy="${point.y}" r="3" fill="${color}"/>`;
  });

  return trusted(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${buildBaseline(padding, width, height)}
    <path d="${pathData}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${dotMarkup}
  </svg>`);
}

export function buildDonutChart(data: ChartDatum[], config?: ChartConfig): SafeHtml {
  const size = config?.width ?? 160;
  const colors = config?.colors ?? defaultColors;
  if (!data.length) return trusted('');

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 10;
  const strokeWidth = 20;
  const total = data.reduce((sum, datum) => sum + datum.value, 0);
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  let arcs = '';
  data.forEach((datum, index) => {
    const percentage = datum.value / total;
    const dash = percentage * circumference;
    const color = datum.color || colors[index % colors.length];
    arcs += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"/>`;
    offset += dash;
  });

  return trusted(`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${arcs}
  </svg>`);
}

export function buildAreaChart(data: ChartDatum[], config?: ChartConfig): SafeHtml {
  if (!data.length) return trusted('');
  const { width, height, padding, maxValue, chartHeight } = computeChartLayout(data, config);
  const color = config?.colors?.[0] ?? 'hsl(var(--primary))';
  const points = computeChartPoints(data, width, height, padding, maxValue, chartHeight);

  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = linePath + ` L ${points[points.length - 1]!.x} ${height - padding} L ${points[0]!.x} ${height - padding} Z`;
  if (!config?.id) throw new Error('buildAreaChart requires config.id for a deterministic SVG gradient ID');
  const gradientId = `area-grad-${config.id}`;

  return trusted(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
    </linearGradient></defs>
    ${buildBaseline(padding, width, height)}
    <path d="${areaPath}" fill="url(#${gradientId})"/>
    <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`);
}
