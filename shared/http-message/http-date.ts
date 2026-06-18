import { HttpMessageError } from './types.ts';

const MONTHS: Readonly<Record<string, number>> = Object.freeze({
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
});

const IMF_FIXDATE = new RegExp(
    '^[A-Za-z]{3}, (\\d{2}) ([A-Za-z]{3}) (\\d{4}) '
    + '(\\d{2}):(\\d{2}):(\\d{2}) GMT$',
);

const RFC850_DATE = new RegExp(
    '^[A-Za-z]+, (\\d{2})-([A-Za-z]{3})-(\\d{2}) '
    + '(\\d{2}):(\\d{2}):(\\d{2}) GMT$',
);

const ASCTIME_DATE = new RegExp(
    '^[A-Za-z]{3} ([A-Za-z]{3}) ([ \\d]\\d) '
    + '(\\d{2}):(\\d{2}):(\\d{2}) (\\d{4})$',
);

// Three HTTP-date formats (RFC 9110 §5.6.7): IMF-fixdate (the
// only one a sender may generate) plus the two obsolete formats
// a recipient must accept. Each resolves to an absolute instant
// via Date.UTC, so the result never depends on host timezone.
// Only the RFC 850 two-digit year is relative to a reference.
export function parseHttpDate(
    text: string,
    reference: Date = new Date(),
): Date {
    const imf = IMF_FIXDATE.exec(text);
    if (imf !== null) {
        return fromParts(
            imf[3]!, imf[2]!, imf[1]!,
            imf[4]!, imf[5]!, imf[6]!,
        );
    }
    const rfc850 = RFC850_DATE.exec(text);
    if (rfc850 !== null) {
        const year = resolveTwoDigitYear(rfc850[3]!, reference);
        return fromParts(
            String(year), rfc850[2]!, rfc850[1]!,
            rfc850[4]!, rfc850[5]!, rfc850[6]!,
        );
    }
    const asc = ASCTIME_DATE.exec(text);
    if (asc !== null) {
        return fromParts(
            asc[6]!, asc[1]!, asc[2]!,
            asc[3]!, asc[4]!, asc[5]!,
        );
    }
    throw new HttpMessageError('not an HTTP-date: ' + text);
}

function fromParts(
    year: string, monthName: string, day: string,
    hour: string, minute: string, second: string,
): Date {
    const month = MONTHS[monthName];
    if (month === undefined) {
        throw new HttpMessageError('invalid month: ' + monthName);
    }
    return new Date(Date.UTC(
        Number(year), month, Number(day),
        Number(hour), Number(minute), Number(second),
    ));
}

// A 2-digit year more than 50 years ahead of the reference is
// the most recent past year with those digits (RFC 9110 §5.6.7).
function resolveTwoDigitYear(
    yy: string, reference: Date,
): number {
    const base =
        Math.floor(reference.getUTCFullYear() / 100) * 100;
    const year = base + Number(yy);
    return year > reference.getUTCFullYear() + 50
        ? year - 100
        : year;
}
