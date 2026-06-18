import { navigateValue } from './navigate.ts';
import type { FieldValue } from './field-value.ts';

// A decoded structured body (a parsed JSON value). It descends
// through the SAME navigation engine the message query uses, so
// a dotted path means one thing whether you reach it via
// message.query('body.x.y') or body().decoded().query('x.y').
// Scalar conversions read the value itself as a leaf.
export class Decoded {
    readonly #value: unknown;

    private constructor(value: unknown) {
        this.#value = value;
    }

    static of(value: unknown): Decoded {
        return new Decoded(value);
    }

    query(path: string): FieldValue {
        return navigateValue(this.#value, path.split('.'));
    }

    toText(): string {
        return this.#leaf().toText();
    }

    toNumber(): number {
        return this.#leaf().toNumber();
    }

    toBoolean(): boolean {
        return this.#leaf().toBoolean();
    }

    toDate(): Date {
        return this.#leaf().toDate();
    }

    #leaf(): FieldValue {
        return navigateValue(this.#value, []);
    }
}
