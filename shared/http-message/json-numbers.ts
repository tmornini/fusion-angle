// Adapter for the ES2025 JSON source-text primitives —
// JSON.rawJSON and the source-access reviver. They preserve a
// number token's exact text through parse -> stringify, so an
// integer or decimal beyond IEEE-754 double range (|n| > 2^53)
// survives a round-trip unrounded instead of being silently
// corrupted. The TS lib targets ES2024 and does not type these
// yet, so this module is the divorce point: the casts are to
// SPECIFIC shapes, localized here, never `any`.

type NumberReviver = (
    key: string,
    value: unknown,
    context: { readonly source: string },
) => unknown;

interface SourceTextJson {
    rawJSON(text: string): unknown;
    isRawJSON(value: unknown): boolean;
}

const sourceTextJson = JSON as unknown as SourceTextJson;

const parseWithReviver = JSON.parse as unknown as (
    text: string,
    reviver: NumberReviver,
) => unknown;

// Parse JSON, wrapping every number as a raw-JSON holder so its
// exact source text is preserved on re-serialization. Throws the
// platform SyntaxError on malformed input (callers gate it).
export function parsePreservingNumbers(text: string): unknown {
    return parseWithReviver(text, (_key, value, context) =>
        typeof value === 'number'
            ? sourceTextJson.rawJSON(context.source)
            : value,
    );
}

export function isRawJson(value: unknown): boolean {
    return sourceTextJson.isRawJSON(value);
}
