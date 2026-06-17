import { HttpMessageError } from './types.ts';

const MONTHS: Readonly<Record<string, number>> = Object.freeze({
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
});

// IMF-fixdate — "Sun, 06 Nov 1994 08:49:37 GMT" — the one
// format RFC 9110 §5.6.7 mandates for generation. Parsed
// explicitly to an absolute instant via Date.UTC, so the result
// never depends on the host timezone (Office of Time). The two
// obsolete formats (RFC 850, asctime) are deferred until a
// caller needs them.
const IMF_FIXDATE = new RegExp(
    '^[A-Za-z]{3}, (\\d{2}) ([A-Za-z]{3}) (\\d{4}) '
    + '(\\d{2}):(\\d{2}):(\\d{2}) GMT$',
);

export function parseHttpDate(text: string): Date {
    const parts = IMF_FIXDATE.exec(text);
    if (parts === null) {
        throw new HttpMessageError('not an HTTP-date: ' + text);
    }
    const month = MONTHS[parts[2]!];
    if (month === undefined) {
        throw new HttpMessageError('invalid month: ' + parts[2]);
    }
    return new Date(Date.UTC(
        Number(parts[3]!),
        month,
        Number(parts[1]!),
        Number(parts[4]!),
        Number(parts[5]!),
        Number(parts[6]!),
    ));
}
