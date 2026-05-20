import {
    SECONDS_PER_DAY,
    formatCompactCurrency,
} from './adapters/index.ts';

const DISPLAY_ABSENT = '—';

function initials(name: string): string {
    return name
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0))
        .join('');
}

const NOON_HOUR = 12;
const EVENING_HOUR = 18;

function getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < NOON_HOUR) return 'morning';
    if (hour < EVENING_HOUR) return 'afternoon';
    return 'evening';
}

function formatDate(iso: string): string {
    const parsedDate = new Date(iso);
    if (isNaN(parsedDate.getTime())) return DISPLAY_ABSENT;
    return parsedDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

function formatDateTime(
    iso: string,
): string {
    const parsedDate = new Date(iso);
    if (isNaN(parsedDate.getTime())) return DISPLAY_ABSENT;
    return parsedDate.toLocaleString('en-US', {
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

function displayText(
    value: string,
): string {
    return value !== ''
        ? value
        : DISPLAY_ABSENT;
}

function pluralize(
    count: number,
    word: string,
): string {
    return count === 1
        ? word
        : word + 's';
}

function trimStrings<
    T extends object,
>(obj: T): T {
    const copy = { ...obj };
    for (const k of Object.keys(copy)) {
        const v = copy[k as keyof T];
        if (typeof v === 'string') {
            (copy as Record<
                string, unknown
            >)[k] = v.trim();
        }
    }
    return copy;
}

export {
    DISPLAY_ABSENT,
    displayText,
    formatDate,
    formatDateTime,
    getTimeOfDay,
    initials,
    pluralize,
    toDateInputValue,
    trimStrings,
    formatCompactCurrency,
    SECONDS_PER_DAY,
};
