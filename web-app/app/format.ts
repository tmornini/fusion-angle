import { SCORE_THRESHOLD_HIGH, SCORE_THRESHOLD_MEDIUM } from '../../api/types';

function initials(name: string): string {
  return name.split(' ').map(word => word[0]).join('');
}

function styleForScore(score: number): string {
  if (score >= SCORE_THRESHOLD_HIGH) return 'color:hsl(var(--success))';
  if (score >= SCORE_THRESHOLD_MEDIUM) return 'color:hsl(var(--warning))';
  return 'color:hsl(var(--error))';
}

const SECONDS_PER_DAY = 86400;

function durationInDays(seconds: number): number {
  return Math.ceil(seconds / SECONDS_PER_DAY);
}

function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

export { initials, styleForScore, durationInDays, formatCompactCurrency };
