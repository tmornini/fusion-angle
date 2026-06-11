// The boot-declared schema-presence marker. root-redirect
// consumes this signal instead of interrogating a storage
// backend's private key layout — the live tier is
// IndexedDB, so localStorage keys never held the schema
// truth. Boot re-declares the marker from the real
// hasSchema on every page load, so a stale value (e.g. a
// wipe with no boot after it) self-heals one hop later:
// the landing boot finds no schema and bounces to
// snapshots, rewriting the marker.
import {
    getPreference,
    putPreference,
    BOOL_STRING_TRUE,
    BOOL_STRING_FALSE,
} from './preferences.ts';

const SCHEMA_PRESENT_KEY =
    'fusion.schema-present';

export function putSchemaPresent(
    present: boolean,
): void {
    putPreference(
        SCHEMA_PRESENT_KEY,
        present
            ? BOOL_STRING_TRUE
            : BOOL_STRING_FALSE,
    );
}

export function getSchemaPresent(): boolean {
    return getPreference(
        SCHEMA_PRESENT_KEY,
    ) === BOOL_STRING_TRUE;
}
