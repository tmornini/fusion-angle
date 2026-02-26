// ============================================
// FUSION AI — Safe HTML Templating
// Tagged template that auto-escapes interpolated
// values. Makes XSS impossible at compile time.
// ============================================

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

function escapeForHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function interpolate(value: unknown): string {
  if (value instanceof SafeHtml) return value.toString();
  if (Array.isArray(value)) return value.map(interpolate).join('');
  if (value === null || value === undefined) return '';
  return escapeForHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let result = strings[0]!;
  for (let i = 0; i < values.length; i++) {
    result += interpolate(values[i]) + strings[i + 1]!;
  }
  return new SafeHtml(result);
}

// Safe: only accepts SafeHtml (auto-escaped by html tag or explicitly trusted).
// TypeScript rejects plain strings at compile time.
export function setHtml(element: HTMLElement, content: SafeHtml): void {
  element.innerHTML = content.toString();
}
