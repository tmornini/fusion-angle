import { HttpMessageError } from './types.ts';

// RFC 8941 Structured Field Values — the general grammar for
// Item / List / Dictionary plus parameters. One parser drives
// every registered field; it knows nothing about WHICH field is
// which (that is the registry's job). Inner lists and byte
// sequences are deferred until a caller needs them.

export type BareValue = number | string | boolean;

export interface SfItem {
    readonly value: BareValue;
    readonly params: ReadonlyMap<string, BareValue>;
}

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
        rejectInnerList(cursor);
        members.push(readItem(cursor));
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
        let value: BareValue = true;
        if (cursor.peek() === '=') {
            cursor.next();
            rejectInnerList(cursor);
            value = readBareItem(cursor);
        }
        const params = readParameters(cursor);
        dict.set(key, { value, params });
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

function readBareItem(cursor: Cursor): BareValue {
    const ch = cursor.peek();
    if (ch === undefined) {
        throw new HttpMessageError('expected a bare item');
    }
    if (ch === '-' || isDigit(ch)) return readNumber(cursor);
    if (ch === '"') return readString(cursor);
    if (ch === '?') return readBoolean(cursor);
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

function rejectInnerList(cursor: Cursor): void {
    if (cursor.peek() === '(') {
        throw new HttpMessageError('inner lists are not supported');
    }
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
