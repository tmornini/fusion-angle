import { levenshteinDistance } from './levenshtein-distance.ts';

// A query word this long or shorter tolerates SHORT_WORD_EDITS;
// a longer one tolerates LONG_WORD_EDITS.
export const SHORT_WORD_MAX_LENGTH = 4;
export const SHORT_WORD_EDITS = 1;
export const LONG_WORD_EDITS = 2;

// A QUERY's search text, in characters. Each query word
// that misses as a substring is measured against every
// field word of every head, so the gate bounds the text
// rather than letting one request stall the event loop.
export const QUERY_TEXT_MAX_LENGTH = 256;

export type SearchMatch =
    | { readonly kind: 'matched'; readonly edits: number }
    | { readonly kind: 'missed' };

export function searchWordsOf(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word !== '');
}

// Every query word must match some field: as a substring of a
// field's text with no edits, else as the nearest field word
// within its edit tolerance. A whole-query substring hit
// matches first, so a symbol-only query such as `@` (which
// has no words) still finds what a plain substring search
// would.
export function searchMatchOf(
    query: string,
    fields: readonly string[],
): SearchMatch {
    const phrase = query.trim().toLowerCase();
    if (phrase === '') return { kind: 'missed' };
    const texts = fields.map((field) => field.toLowerCase());
    if (texts.some((text) => text.includes(phrase))) {
        return { kind: 'matched', edits: 0 };
    }
    const queryWords = searchWordsOf(phrase);
    if (queryWords.length === 0) return { kind: 'missed' };
    const fieldWords = texts.flatMap(searchWordsOf);
    let edits = 0;
    for (const word of queryWords) {
        const match = wordMatchOf(word, texts, fieldWords);
        if (match.kind === 'missed') return match;
        edits += match.edits;
    }
    return { kind: 'matched', edits };
}

function wordMatchOf(
    word: string,
    texts: readonly string[],
    fieldWords: readonly string[],
): SearchMatch {
    if (texts.some((text) => text.includes(word))) {
        return { kind: 'matched', edits: 0 };
    }
    const tolerance = word.length <= SHORT_WORD_MAX_LENGTH
        ? SHORT_WORD_EDITS
        : LONG_WORD_EDITS;
    const tolerated = fieldWords
        .map((fieldWord) => levenshteinDistance(word, fieldWord))
        .filter((distance) => distance <= tolerance);
    if (tolerated.length === 0) return { kind: 'missed' };
    return { kind: 'matched', edits: Math.min(...tolerated) };
}

// Array.prototype.sort is stable, so items with equal edits
// keep their input order: the resource's GET order.
export function rankedBySearch<T>(
    items: readonly T[],
    query: string,
    fieldsOf: (item: T) => readonly string[],
): T[] {
    return items
        .flatMap((item) => {
            const match = searchMatchOf(query, fieldsOf(item));
            return match.kind === 'matched'
                ? [{ item, edits: match.edits }]
                : [];
        })
        .sort((a, b) => a.edits - b.edits)
        .map(({ item }) => item);
}
