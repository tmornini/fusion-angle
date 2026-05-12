import {
    SECONDS_PER_HOUR,
    SECONDS_PER_DAY,
} from '../../api/types.ts';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_WEEK   = 604800;

interface Unit {
    readonly threshold: number;
    readonly suffix: string;
}

const LADDER: readonly Unit[] = [
    { threshold: SECONDS_PER_WEEK,   suffix: 'w' },
    { threshold: SECONDS_PER_DAY,    suffix: 'd' },
    { threshold: SECONDS_PER_HOUR,   suffix: 'h' },
    { threshold: SECONDS_PER_MINUTE, suffix: 'm' },
    { threshold: 1,                  suffix: 's' },
];

export function formatMinAscending(seconds: number): string {
    if (seconds < 0) {
        throw new Error('formatMinAscending: negative seconds');
    }
    if (seconds === 0) return '0s';
    for (const unit of LADDER) {
        if (seconds >= unit.threshold) {
            const scaled = seconds / unit.threshold;
            const rendered = scaled >= 10 || Number.isInteger(scaled)
                ? Math.round(scaled).toString()
                : scaled.toFixed(1);
            return `${rendered}${unit.suffix}`;
        }
    }
    return '0s';
}
