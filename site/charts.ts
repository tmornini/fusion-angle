// ============================================
// FUSION AI — SVG Chart Rendering
// Bar, Line, Donut, Area charts as SVG strings.
// ============================================

export interface ChartData {
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
  'hsl(217 71% 53%)',
  'hsl(280 65% 60%)',
];

function chartSetup(data: ChartData[], config?: ChartConfig) {
  const w = config?.width ?? 300;
  const h = config?.height ?? 200;
  const pad = config?.padding ?? 40;
  const colors = config?.colors ?? defaultColors;
  const maxVal = Math.max(...data.map(d => d.value));
  const chartH = h - pad * 2;
  return { w, h, pad, colors, maxVal, chartH };
}

function chartPoints(data: ChartData[], w: number, h: number, pad: number, maxVal: number, chartH: number) {
  const stepX = (w - pad * 2) / Math.max(data.length - 1, 1);
  return data.map((d, i) => ({ x: pad + i * stepX, y: h - pad - (d.value / maxVal) * chartH }));
}

function baseline(pad: number, w: number, h: number): string {
  return `<line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="currentColor" stroke-opacity="0.15"/>`;
}

export function barChart(data: ChartData[], config?: ChartConfig): string {
  if (!data.length) return '';
  const { w, h, pad, colors, maxVal, chartH } = chartSetup(data, config);
  const barW = Math.min(40, (w - pad * 2) / data.length - 8);

  let bars = '';
  data.forEach((d, i) => {
    const barH = (d.value / maxVal) * chartH;
    const x = pad + i * ((w - pad * 2) / data.length) + ((w - pad * 2) / data.length - barW) / 2;
    const y = h - pad - barH;
    const color = d.color || colors[i % colors.length];
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${color}" opacity="0.85"/>`;
    if (config?.showLabels !== false) {
      bars += `<text x="${x + barW / 2}" y="${h - pad + 16}" text-anchor="middle" fill="currentColor" font-size="10" opacity="0.6">${d.label}</text>`;
    }
  });

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    ${baseline(pad, w, h)}
    ${bars}
  </svg>`;
}

export function lineChart(data: ChartData[], config?: ChartConfig): string {
  if (!data.length) return '';
  const { w, h, pad, maxVal, chartH } = chartSetup(data, config);
  const color = config?.colors?.[0] ?? 'hsl(var(--primary))';
  const points = chartPoints(data, w, h, pad, maxVal, chartH);

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  let dots = '';
  points.forEach(p => {
    dots += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}"/>`;
  });

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    ${baseline(pad, w, h)}
    <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
  </svg>`;
}

export function donutChart(data: ChartData[], config?: ChartConfig): string {
  const size = config?.width ?? 160;
  const colors = config?.colors ?? defaultColors;
  if (!data.length) return '';

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;
  const strokeW = 20;
  const total = data.reduce((a, d) => a + d.value, 0);
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  let arcs = '';
  data.forEach((d, i) => {
    const pct = d.value / total;
    const dash = pct * circumference;
    const color = d.color || colors[i % colors.length];
    arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"/>`;
    offset += dash;
  });

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${arcs}
  </svg>`;
}

export function areaChart(data: ChartData[], config?: ChartConfig): string {
  if (!data.length) return '';
  const { w, h, pad, maxVal, chartH } = chartSetup(data, config);
  const color = config?.colors?.[0] ?? 'hsl(var(--primary))';
  const points = chartPoints(data, w, h, pad, maxVal, chartH);

  const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = lineD + ` L ${points[points.length - 1]!.x} ${h - pad} L ${points[0]!.x} ${h - pad} Z`;
  const gradId = config?.id ? `area-grad-${config.id}` : `area-grad-${Math.random().toString(36).slice(2, 8)}`;

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
    </linearGradient></defs>
    ${baseline(pad, w, h)}
    <path d="${areaD}" fill="url(#${gradId})"/>
    <path d="${lineD}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
