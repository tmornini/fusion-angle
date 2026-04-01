import {
    SECONDS_PER_DAY,
    durationInDays,
    formatCompactCurrency,
} from '../../api/types';

function initials(name: string): string {
    if (!name) return '';
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

function displayText(
    value: string,
): string {
    return value || '\u2014';
}

export {
    displayText,
    formatDate,
    getTimeOfDay,
    initials,
    durationInDays,
    formatCompactCurrency,
    SECONDS_PER_DAY,
};
