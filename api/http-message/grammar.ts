// RFC 9110 / 9112 lexical predicates over start-line and field
// text. Pure, allocation-free — the building blocks of the
// parse gate.

// token = 1*tchar
// tchar = "!#$%&'*+-.^_`|~" / DIGIT / ALPHA
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function isToken(text: string): boolean {
    return TOKEN.test(text);
}

// HTTP-version = "HTTP/" DIGIT "." DIGIT
const HTTP_VERSION = /^HTTP\/[0-9]\.[0-9]$/;

export function isHttpVersion(text: string): boolean {
    return HTTP_VERSION.test(text);
}

// status-code = 3DIGIT. 100..599 are the registered classes;
// codes outside that band are rejected.
const THREE_DIGITS = /^[0-9]{3}$/;

export function isStatusCode(value: number): boolean {
    return Number.isInteger(value)
        && value >= 100
        && value <= 599;
}

export function isStatusCodeText(text: string): boolean {
    return THREE_DIGITS.test(text) && isStatusCode(Number(text));
}
