import {
    SECONDS_PER_DAY,
    durationInDays,
    formatCompactCurrency,
} from './adapters';

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
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

function formatDateTime(
    iso: string,
): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function toDateInputValue(
    iso: string,
): string {
    if (!iso) return '';
    return iso.slice(0, 10);
}

const DISPLAY_ABSENT = '\u2014';

function displayText(
    value: string,
): string {
    return value !== ''
        ? value
        : DISPLAY_ABSENT;
}

function trimStrings<
    T extends Record<string, unknown>,
>(obj: T): T {
    const r = { ...obj };
    for (const k of Object.keys(r)) {
        const v = r[k as keyof T];
        if (typeof v === 'string') {
            (r as Record<
                string, unknown
            >)[k] = v.trim();
        }
    }
    return r;
}

export {
    DISPLAY_ABSENT,
    displayText,
    formatDate,
    formatDateTime,
    getTimeOfDay,
    initials,
    toDateInputValue,
    trimStrings,
    durationInDays,
    formatCompactCurrency,
    SECONDS_PER_DAY,
};
