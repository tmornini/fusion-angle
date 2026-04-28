export class SafeHtml {
    readonly #value: string;

    constructor(value: string) {
        this.#value = value;
    }

    toString(): string {
        return this.#value;
    }
}

export function trusted(rawHtml: string): SafeHtml {
    return new SafeHtml(rawHtml);
}

export function escapeForHtml(str: string): string {
    let escaped = str.replace(/&/g, '&amp;');
    escaped = escaped.replace(/</g, '&lt;');
    escaped = escaped.replace(/>/g, '&gt;');
    escaped = escaped.replace(/"/g, '&quot;');
    escaped = escaped.replace(/'/g, '&#39;');
    return escaped;
}

function interpolate(value: unknown): string {
    if (value instanceof SafeHtml) return value.toString();
    if (Array.isArray(value)) return value.map(interpolate).join('');
    if (value === null || value === undefined) return '';
    return escapeForHtml(String(value));
}

export function html(
    strings: TemplateStringsArray,
    ...values: unknown[]
): SafeHtml {
    let result = strings[0]!;
    for (let i = 0; i < values.length; i++) {
        result += interpolate(values[i]) + strings[i + 1]!;
    }
    return new SafeHtml(result);
}

export function setHtml(element: HTMLElement, content: SafeHtml): void {
    element.innerHTML = content.toString();
}
