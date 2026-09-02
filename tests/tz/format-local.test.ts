import { assertStrictEquals } from '@std/assert';
import {
    formatDate,
    formatCalendarDate,
} from '../../web-app/app/format.ts';

// The Office of Time: instants render to LOCAL time. Under TZ=UTC
// (the main suite) local and UTC agree, so the distinction is
// invisible there — this suite must run under a fixed
// negative-offset zone. ./test launches it with
// TZ=Pacific/Honolulu (UTC-10, no DST). Guard the zone so a stray
// invocation fails loudly instead of asserting nonsense.
Deno.test('runs under the expected UTC-10 zone', () => {
    const offsetMin = new Date('2026-06-01T00:00:00Z')
        .getTimezoneOffset();
    assertStrictEquals(offsetMin, 600);
});

// 05:00Z on Jan 2 is 19:00 on Jan 1 in Honolulu, so an instant
// formatter renders the LOCAL calendar day (Jan 1), not the UTC
// day (Jan 2) the old timeZone:'UTC' forcing produced.
const INSTANT = '2026-01-02T05:00:00.000000Z';

Deno.test('formatDate renders an instant in local time', () => {
    assertStrictEquals(formatDate(INSTANT), 'Jan 1, 2026');
});

// A calendar date is zone-neutral: the same instant string
// renders the UTC day (Jan 2) for every viewer, so a project
// start/end never drifts by a day far from UTC.
Deno.test('formatCalendarDate renders the zone-neutral day', () => {
    assertStrictEquals(formatCalendarDate(INSTANT), 'Jan 2, 2026');
});
