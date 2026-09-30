// The `at` of every server log record. Date resolves only to
// milliseconds; Temporal reads the wall clock finer, so the
// stamp keeps the microseconds the Office of Time asks for.
// Wall clock, not the monotonic one: a stamp names an
// instant other systems' logs must correlate with.
export function logStampUtc(): string {
    return Temporal.Now.instant().toString({
        fractionalSecondDigits: 6,
    });
}
