import { HttpMessageError } from './types.ts';
import { Octets } from './octets.ts';

// RFC 9651 Structured Field Values (obsoletes RFC 8941) — the
// general grammar for Item / List / Dictionary plus parameters,
// including inner lists, byte sequences, Dates, and Display
// Strings. One parser drives every registered field; it knows
// nothing about WHICH field is which (that is the registry's
// job).

export type BareValue =
    number | string | boolean | Octets | Date;

export interface SfItem {
    readonly value: BareValue | SfInnerList;
    readonly params: ReadonlyMap<string, BareValue>;
}

export interface SfInnerList {
    readonly items: readonly SfItem[];
    readonly params: ReadonlyMap<string, BareValue>;
}

const NO_PARAMS: ReadonlyMap<string, BareValue> = new Map();

export type SfList = readonly SfItem[];
export type SfDictionary = ReadonlyMap<string, SfItem>;

class Cursor {
    readonly #text: string;
    #pos = 0;

    constructor(text: string) {
        this.#text = text;
    }

    peek(): string | undefined {
        return this.#text[this.#pos];
    }

    next(): string {
        const ch = this.#text[this.#pos];
        if (ch === undefined) {
            throw new HttpMessageError('unexpected end of field');
        }
        this.#pos++;
        return ch;
    }

    expect(ch: string): void {
        if (this.next() !== ch) {
            throw new HttpMessageError('expected ' + ch);
        }
    }

    atEnd(): boolean {
        return this.#pos >= this.#text.length;
    }

    skipOws(): void {
        while (this.peek() === ' ' || this.peek() === '\t') {
            this.#pos++;
        }
    }
}

export function parseItem(text: string): SfItem {
    const cursor = new Cursor(text);
    cursor.skipOws();
    const item = readItem(cursor);
    cursor.skipOws();
    if (!cursor.atEnd()) {
        throw new HttpMessageError('trailing data after item');
    }
    return item;
}

export function parseList(text: string): SfList {
    const cursor = new Cursor(text);
    const members: SfItem[] = [];
    cursor.skipOws();
    if (cursor.atEnd()) return members;
    for (;;) {
        members.push(readMember(cursor));
        cursor.skipOws();
        if (cursor.atEnd()) break;
        cursor.expect(',');
        cursor.skipOws();
        if (cursor.atEnd()) {
            throw new HttpMessageError('trailing comma in list');
        }
    }
    return members;
}

export function parseDictionary(text: string): SfDictionary {
    const cursor = new Cursor(text);
    const dict = new Map<string, SfItem>();
    cursor.skipOws();
    if (cursor.atEnd()) return dict;
    for (;;) {
        const key = readKey(cursor);
        let member: SfItem;
        if (cursor.peek() === '=') {
            cursor.next();
            member = readMember(cursor);
        } else {
            member = { value: true, params: readParameters(cursor) };
        }
        dict.set(key, member);
        cursor.skipOws();
        if (cursor.atEnd()) break;
        cursor.expect(',');
        cursor.skipOws();
        if (cursor.atEnd()) {
            throw new HttpMessageError('trailing comma in dict');
        }
    }
    return dict;
}

function readItem(cursor: Cursor): SfItem {
    const value = readBareItem(cursor);
    const params = readParameters(cursor);
    return { value, params };
}

function readInnerList(cursor: Cursor): SfInnerList {
    cursor.expect('(');
    const items: SfItem[] = [];
    for (;;) {
        cursor.skipOws();
        if (cursor.peek() === ')') {
            cursor.next();
            break;
        }
        items.push(readItem(cursor));
        const next = cursor.peek();
        if (next !== ' ' && next !== '\t' && next !== ')') {
            throw new HttpMessageError(
                'expected SP or ) in inner list',
            );
        }
    }
    const params = readParameters(cursor);
    return { items, params };
}

function readMember(cursor: Cursor): SfItem {
    if (cursor.peek() === '(') {
        return {
            value: readInnerList(cursor),
            params: NO_PARAMS,
        };
    }
    return readItem(cursor);
}

function readBareItem(cursor: Cursor): BareValue {
    const ch = cursor.peek();
    if (ch === undefined) {
        throw new HttpMessageError('expected a bare item');
    }
    if (ch === '-' || isDigit(ch)) return readNumber(cursor);
    if (ch === '"') return readString(cursor);
    if (ch === '?') return readBoolean(cursor);
    if (ch === ':') return readByteSequence(cursor);
    if (ch === '@') return readDate(cursor);
    if (ch === '%') return readDisplayString(cursor);
    if (ch === '*' || isAlpha(ch)) return readToken(cursor);
    throw new HttpMessageError('unexpected bare item: ' + ch);
}

function readNumber(cursor: Cursor): number {
    let text = '';
    if (cursor.peek() === '-') text += cursor.next();
    if (!isDigit(cursor.peek())) {
        throw new HttpMessageError('expected a digit');
    }
    while (isDigit(cursor.peek())) text += cursor.next();
    if (cursor.peek() === '.') {
        text += cursor.next();
        if (!isDigit(cursor.peek())) {
            throw new HttpMessageError('expected a fraction digit');
        }
        while (isDigit(cursor.peek())) text += cursor.next();
    }
    return Number(text);
}

function readString(cursor: Cursor): string {
    cursor.expect('"');
    let text = '';
    for (;;) {
        const ch = cursor.next();
        if (ch === '\\') {
            const escaped = cursor.next();
            if (escaped !== '"' && escaped !== '\\') {
                throw new HttpMessageError('invalid escape');
            }
            text += escaped;
        } else if (ch === '"') {
            return text;
        } else {
            text += ch;
        }
    }
}

function readBoolean(cursor: Cursor): boolean {
    cursor.expect('?');
    const ch = cursor.next();
    if (ch === '1') return true;
    if (ch === '0') return false;
    throw new HttpMessageError('invalid boolean: ?' + ch);
}

function readByteSequence(cursor: Cursor): Octets {
    cursor.expect(':');
    let b64 = '';
    while (cursor.peek() !== ':') {
        b64 += cursor.next();
    }
    cursor.next();
    return Octets.fromBase64(b64);
}

function readDate(cursor: Cursor): Date {
    cursor.expect('@');
    let text = '';
    if (cursor.peek() === '-') text += cursor.next();
    if (!isDigit(cursor.peek())) {
        throw new HttpMessageError('expected a date integer');
    }
    while (isDigit(cursor.peek())) text += cursor.next();
    if (text.replace('-', '').length > 15) {
        throw new HttpMessageError('sf-date exceeds 15 digits');
    }
    return new Date(Number(text) * 1000);
}

function readDisplayString(cursor: Cursor): string {
    cursor.expect('%');
    cursor.expect('"');
    const bytes: number[] = [];
    for (;;) {
        const ch = cursor.next();
        if (ch === '"') {
            return new TextDecoder().decode(
                Uint8Array.from(bytes),
            );
        }
        if (ch === '%') {
            const hi = cursor.next();
            const lo = cursor.next();
            if (!isLowerHex(hi) || !isLowerHex(lo)) {
                throw new HttpMessageError(
                    'invalid display-string escape',
                );
            }
            bytes.push(Number.parseInt(hi + lo, 16));
        } else {
            bytes.push(ch.charCodeAt(0));
        }
    }
}

function isLowerHex(ch: string): boolean {
    return isDigit(ch) || (ch >= 'a' && ch <= 'f');
}

function readToken(cursor: Cursor): string {
    let text = cursor.next();
    while (isTokenChar(cursor.peek())) text += cursor.next();
    return text;
}

function readParameters(
    cursor: Cursor,
): ReadonlyMap<string, BareValue> {
    const params = new Map<string, BareValue>();
    while (cursor.peek() === ';') {
        cursor.next();
        cursor.skipOws();
        const key = readKey(cursor);
        let value: BareValue = true;
        if (cursor.peek() === '=') {
            cursor.next();
            value = readBareItem(cursor);
        }
        params.set(key, value);
    }
    return params;
}

function readKey(cursor: Cursor): string {
    const ch = cursor.peek();
    if (ch !== '*' && !isLcAlpha(ch)) {
        throw new HttpMessageError('invalid key start');
    }
    let text = cursor.next();
    while (isKeyChar(cursor.peek())) text += cursor.next();
    return text;
}

const TOKEN_CHARS = "!#$%&'*+-.^_`|~:/";

function isDigit(ch: string | undefined): boolean {
    return ch !== undefined && ch >= '0' && ch <= '9';
}

function isAlpha(ch: string | undefined): boolean {
    return ch !== undefined
        && ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z'));
}

function isLcAlpha(ch: string | undefined): boolean {
    return ch !== undefined && ch >= 'a' && ch <= 'z';
}

function isTokenChar(ch: string | undefined): boolean {
    return isAlpha(ch) || isDigit(ch)
        || (ch !== undefined && TOKEN_CHARS.includes(ch));
}

function isKeyChar(ch: string | undefined): boolean {
    return isLcAlpha(ch) || isDigit(ch)
        || ch === '_' || ch === '-' || ch === '.' || ch === '*';
}
