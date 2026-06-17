import { parseHttpDate } from './http-date.ts';
import { HttpMessageError } from './types.ts';

// The leaf produced by every query. It carries a TYPED value so
// conversions are honest contracts: toNumber on a boolean
// throws rather than coercing, and absence is a first-class
// value (exists() reports it; every toX() on it crashes loudly
// — Design by Contract). Traversal of structured fields and
// bodies happens in the dotted key, not here, so this surface
// stays a small set of leaf conversions.
type Leaf = string | number | boolean;

export class FieldValue {
    readonly #value: Leaf | undefined;

    private constructor(value: Leaf | undefined) {
        this.#value = value;
    }

    static present(value: Leaf): FieldValue {
        return new FieldValue(value);
    }

    static absent(): FieldValue {
        return new FieldValue(undefined);
    }

    exists(): boolean {
        return this.#value !== undefined;
    }

    toText(): string {
        return String(this.#require());
    }

    toString(): string {
        return this.toText();
    }

    toNumber(): number {
        const value = this.#require();
        if (typeof value === 'number') return value;
        if (typeof value === 'string' && value.trim() !== '') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
        }
        throw new HttpMessageError(
            'value is not a number: ' + String(value),
        );
    }

    toBoolean(): boolean {
        const value = this.#require();
        if (typeof value === 'boolean') return value;
        throw new HttpMessageError(
            'value is not a boolean: ' + String(value),
        );
    }

    toDate(): Date {
        const value = this.#require();
        if (typeof value === 'string') {
            return parseHttpDate(value);
        }
        throw new HttpMessageError(
            'value is not a date: ' + String(value),
        );
    }

    #require(): Leaf {
        if (this.#value === undefined) {
            throw new HttpMessageError(
                'queried value does not exist',
            );
        }
        return this.#value;
    }
}
