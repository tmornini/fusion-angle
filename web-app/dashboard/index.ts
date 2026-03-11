import { $ } from '../app/dom';
import { html, setHtml, SafeHtml } from '../app/safe-html';
import { buildSkeleton, buildErrorState } from '../app/loading-states';
import { iconDollarSign, iconClock, iconZap } from '../app/icons';
import { getDashboardGauges, type GaugeCard } from '../app/adapters';

const gaugeThemeConfig: Record<string, { bg: string; iconBg: string; border: string }> = {
  blue:  { bg: 'background:hsl(var(--primary)/0.04)', iconBg: 'background:linear-gradient(135deg,hsl(var(--primary)/0.2),hsl(var(--primary)/0.1))', border: 'border-color:hsl(var(--primary)/0.15)' },
  green: { bg: 'background:hsl(var(--success)/0.04)', iconBg: 'background:linear-gradient(135deg,hsl(var(--success)/0.2),hsl(var(--success)/0.1))', border: 'border-color:hsl(var(--success)/0.15)' },
  amber: { bg: 'background:hsl(var(--warning)/0.04)', iconBg: 'background:linear-gradient(135deg,hsl(var(--warning)/0.2),hsl(var(--warning)/0.1))', border: 'border-color:hsl(var(--warning)/0.15)' },
};

const gaugeIconConfig: Record<string, (size?: number, cssClass?: string) => SafeHtml> = {
  dollarSign: iconDollarSign, clock: iconClock, zap: iconZap,
};

const GAUGE_THEME_FALLBACK = { bg: 'background:hsl(var(--muted)/0.04)', iconBg: 'background:hsl(var(--muted)/0.1)', border: 'border-color:hsl(var(--muted)/0.15)' };
const GAUGE_ARC_OUTER_RADIUS = 65;
const GAUGE_ARC_INNER_RADIUS = 45;

function buildGauge(card: GaugeCard): SafeHtml {
  const themeStyle = gaugeThemeConfig[card.theme] ?? GAUGE_THEME_FALLBACK;
  const elementId = card.title.replace(/\s+/g, '-').toLowerCase();
  const outerPct = Math.min((card.outer.value / card.outer.max) * 100, 100);
  const innerPct = Math.min((card.inner.value / card.inner.max) * 100, 100);
  const outerArc = Math.PI * GAUGE_ARC_OUTER_RADIUS;
  const innerArc = Math.PI * GAUGE_ARC_INNER_RADIUS;
  const iconFn = gaugeIconConfig[card.icon] || iconDollarSign;

  // Inner arc gradient: green normally, green-to-red on overrun
  const isOverrun = card.hasOverrunWarning && card.inner.value > card.inner.max;
  const innerGradientStop0 = 'hsl(var(--success))';
  const innerGradientStop1 = isOverrun ? 'red' : 'hsl(var(--success))';

  // Flash animation on extreme overrun (>1.5x)
  let innerArcFlashStyle = '';
  if (card.hasOverrunWarning && card.inner.max > 0) {
    const ratio = card.inner.value / card.inner.max;
    if (ratio > 1.5) {
      const duration = Math.max(0.333, 1 - (ratio - 1.5) * 0.667);
      innerArcFlashStyle = `animation:gauge-flash ${duration.toFixed(3)}s infinite`;
    }
  }

  return html`
    <div class="card" style="border:2px solid transparent;${themeStyle.border};${themeStyle.bg};border-radius:0.75rem;padding:1.5rem;transition:all 0.3s">
      <div class="flex items-center gap-3 mb-5">
        <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;${themeStyle.iconBg};display:flex;align-items:center;justify-content:center">
          ${iconFn(20, card.iconCssClass)}
        </div>
        <h3 class="text-sm font-semibold">${card.title}</h3>
      </div>
      <div style="display:flex;justify-content:center;margin-bottom:1.25rem">
        <svg width="180" height="95" viewBox="0 0 180 95" style="overflow:visible">
          <defs>
            <linearGradient id="outer-${elementId}" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="hsl(var(--primary))" stop-opacity="0.4"/>
              <stop offset="100%" stop-color="hsl(var(--primary))" stop-opacity="1"/>
            </linearGradient>
            <linearGradient id="inner-${elementId}" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="${innerGradientStop0}" stop-opacity="0.4"/>
              <stop offset="100%" stop-color="${innerGradientStop1}" stop-opacity="1"/>
            </linearGradient>
          </defs>
          <path d="M 25 85 A 65 65 0 0 1 155 85" fill="none" stroke="hsl(var(--muted))" stroke-width="14" stroke-linecap="round" opacity="0.3"/>
          <path d="M 25 85 A 65 65 0 0 1 155 85" fill="none" stroke="url(#outer-${elementId})" stroke-width="14" stroke-linecap="round" stroke-dasharray="${outerArc}" stroke-dashoffset="${outerArc - (outerPct / 100) * outerArc}"/>
          <path d="M 45 85 A 45 45 0 0 1 135 85" fill="none" stroke="hsl(var(--muted))" stroke-width="14" stroke-linecap="round" opacity="0.3"/>
          <path d="M 45 85 A 45 45 0 0 1 135 85" fill="none" stroke="url(#inner-${elementId})" stroke-width="14" stroke-linecap="round" stroke-dasharray="${innerArc}" stroke-dashoffset="${innerArc - (innerPct / 100) * innerArc}" style="${innerArcFlashStyle}"/>
        </svg>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div style="text-align:center;padding:0.75rem;border-radius:0.5rem;background:hsl(var(--card)/0.8);border:1px solid hsl(var(--border)/0.5)">
          <div class="flex items-center justify-center gap-2" style="margin-bottom:0.25rem">
            <div style="width:0.625rem;height:0.625rem;border-radius:9999px;background:hsl(var(--primary))"></div>
            <span class="text-xs text-muted" style="font-weight:500">${card.outer.label}</span>
          </div>
          <p class="text-2xl font-bold">${card.outer.display}</p>
        </div>
        <div style="text-align:center;padding:0.75rem;border-radius:0.5rem;background:hsl(var(--card)/0.8);border:1px solid hsl(var(--border)/0.5)">
          <div class="flex items-center justify-center gap-2" style="margin-bottom:0.25rem">
            <div style="width:0.625rem;height:0.625rem;border-radius:9999px;background:hsl(var(--success))"></div>
            <span class="text-xs text-muted" style="font-weight:500">${card.inner.label}</span>
          </div>
          <p class="text-2xl font-bold">${card.inner.display}</p>
        </div>
      </div>
    </div>`;
}

export async function init(): Promise<void> {
  const gaugeContainer = $('#gauge-container');
  if (gaugeContainer) setHtml(gaugeContainer, buildSkeleton('card-grid', { count: 3 }));

  let gauges: GaugeCard[];
  try {
    gauges = await getDashboardGauges();
  } catch {
    if (gaugeContainer) {
      setHtml(gaugeContainer, buildErrorState('Failed to load dashboard data.'));
      const retryBtn = gaugeContainer.querySelector('[data-retry-btn]');
      if (retryBtn) retryBtn.addEventListener('click', () => init());
    }
    return;
  }

  if (gaugeContainer) setHtml(gaugeContainer, html`${gauges.map(buildGauge)}`);
}
