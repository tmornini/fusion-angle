import {
    SCORE_THRESHOLD_HIGH,
    SCORE_THRESHOLD_MEDIUM,
    SECONDS_PER_DAY,
    durationInDays,
    formatCompactCurrency,
} from '../../api/types';

function initials(name: string): string {
    return name
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0))
        .join('');
}

function getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}

function styleForScore(score: number): string {
    if (score >= SCORE_THRESHOLD_HIGH)
        return 'color:hsl(var(--success))';
    if (score >= SCORE_THRESHOLD_MEDIUM)
        return 'color:hsl(var(--warning))';
    return 'color:hsl(var(--error))';
}

function displayText(value: string): string {
    return value || '\u2014';
}

export {
    displayText,
    formatDate,
    getTimeOfDay,
    initials,
    styleForScore,
    durationInDays,
    formatCompactCurrency,
    SECONDS_PER_DAY,
};
