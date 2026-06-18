import { FieldValue } from './field-value.ts';
import { CONTENT_LENGTH, TRANSFER_ENCODING } from './framing.ts';
import { kindOf } from './field-registry.ts';
import { navigateValue } from './navigate.ts';
import type { BodyRegistry } from './media-registry.ts';
import {
    parseDictionary,
    parseItem,
    parseList,
    type BareValue,
    type SfInnerList,
    type SfItem,
} from './structured-fields.ts';
import type {
    FieldLine,
    MessageModel,
    StartLine,
} from './types.ts';

// Resolve a dotted key against a message, returning a FieldValue
// (never null/undefined). Start-line fields are top-level roots;
// header/trailer descend into the field sections. The derived
// framing fields are synthesized here from the body and trailer.

const START_LINE_ROOTS: ReadonlySet<string> = new Set([
    'method', 'target', 'version', 'status', 'reason',
]);

export function queryModel(
    model: MessageModel,
    registry: BodyRegistry,
    dottedKey: string,
): FieldValue {
    const segments = dottedKey.split('.');
    const root = segments[0]!;
    if (START_LINE_ROOTS.has(root)) {
        return queryStartLine(
            model.startLine,
            root,
            segments.length,
        );
    }
    if (root === 'header') {
        return queryHeader(model, segments.slice(1));
    }
    if (root === 'trailer') {
        return queryTrailer(model, segments.slice(1));
    }
    if (root === 'body') {
        return queryBody(model, registry, segments.slice(1));
    }
    return FieldValue.absent();
}

function queryBody(
    model: MessageModel,
    registry: BodyRegistry,
    path: readonly string[],
): FieldValue {
    if (model.body === undefined) return FieldValue.absent();
    const contentType = model.fields.find(
        (field) => field.name === 'content-type',
    );
    if (contentType === undefined) return FieldValue.absent();
    const codec = registry.codecFor(contentType.value);
    if (codec === undefined) return FieldValue.absent();
    let parsed: unknown;
    try {
        parsed = codec.decode(model.body);
    } catch {
        return FieldValue.absent();
    }
    return navigateValue(parsed, path);
}

function queryStartLine(
    line: StartLine,
    root: string,
    segmentCount: number,
): FieldValue {
    if (segmentCount > 1) {
        return FieldValue.absent();
    }
    if (line.kind === 'request') {
        if (root === 'method') return FieldValue.present(line.method);
        if (root === 'target') return FieldValue.present(line.target);
        if (root === 'version') {
            return FieldValue.present(line.version);
        }
        return FieldValue.absent();
    }
    if (root === 'version') return FieldValue.present(line.version);
    if (root === 'status') return FieldValue.present(line.status);
    if (root === 'reason') return FieldValue.present(line.reason);
    return FieldValue.absent();
}

function queryHeader(
    model: MessageModel,
    rest: readonly string[],
): FieldValue {
    const name = rest[0];
    if (name === undefined) return FieldValue.absent();
    // Mirror the serializer's framing rule exactly: a trailer
    // means chunked framing (no Content-Length); otherwise a
    // body is Content-Length framed.
    if (name === CONTENT_LENGTH) {
        return model.body !== undefined
            && model.trailer === undefined
            ? FieldValue.present(model.body.byteLength())
            : FieldValue.absent();
    }
    if (name === TRANSFER_ENCODING) {
        return model.trailer !== undefined
            ? FieldValue.present('chunked')
            : FieldValue.absent();
    }
    return resolveField(name, model.fields, rest.slice(1));
}

function queryTrailer(
    model: MessageModel,
    rest: readonly string[],
): FieldValue {
    const name = rest[0];
    if (name === undefined || model.trailer === undefined) {
        return FieldValue.absent();
    }
    return resolveField(name, model.trailer, rest.slice(1));
}

function resolveField(
    name: string,
    fields: readonly FieldLine[],
    rest: readonly string[],
): FieldValue {
    const lines = fields.filter((field) => field.name === name);
    if (lines.length === 0) return FieldValue.absent();
    const kind = kindOf(name);
    const text = combine(lines);
    if (kind === 'item') return navigateItem(text, rest);
    if (kind === 'list') return navigateList(text, rest, lines);
    if (kind === 'dictionary') {
        return navigateDictionary(text, rest);
    }
    return navigateRaw(lines, rest);
}

function navigateRaw(
    lines: readonly FieldLine[],
    rest: readonly string[],
): FieldValue {
    if (rest.length === 0) {
        return FieldValue.present(combine(lines));
    }
    const index = Number(rest[0]);
    if (
        Number.isInteger(index)
        && index >= 0
        && index < lines.length
    ) {
        return FieldValue.present(lines[index]!.value);
    }
    return FieldValue.absent();
}

function navigateItem(
    text: string,
    rest: readonly string[],
): FieldValue {
    let item: SfItem;
    try {
        item = parseItem(text);
    } catch {
        return FieldValue.present(text);
    }
    if (rest.length === 0) return leaf(item.value);
    return parameter(item, rest);
}

function navigateList(
    text: string,
    rest: readonly string[],
    lines: readonly FieldLine[],
): FieldValue {
    let members: readonly SfItem[];
    try {
        members = parseList(text);
    } catch {
        return navigateRaw(lines, rest);
    }
    if (rest.length === 0) return FieldValue.present(text);
    const index = Number(rest[0]);
    if (
        !Number.isInteger(index)
        || index < 0
        || index >= members.length
    ) {
        return FieldValue.absent();
    }
    const member = members[index]!;
    if (rest.length === 1) return leaf(member.value);
    if (isInnerList(member.value)) {
        return navigateInnerList(member.value, rest.slice(1));
    }
    return parameter(member, rest.slice(1));
}

function navigateDictionary(
    text: string,
    rest: readonly string[],
): FieldValue {
    let dict: ReadonlyMap<string, SfItem>;
    try {
        dict = parseDictionary(text);
    } catch {
        return FieldValue.present(text);
    }
    if (rest.length === 0) return FieldValue.present(text);
    const member = dict.get(rest[0]!);
    if (member === undefined) return FieldValue.absent();
    if (rest.length === 1) return leaf(member.value);
    return parameter(member, rest.slice(1));
}

function isInnerList(
    value: BareValue | SfInnerList,
): value is SfInnerList {
    return typeof value === 'object'
        && value !== null
        && 'items' in value;
}

// An inner list has no scalar leaf; a bare value presents.
function leaf(value: BareValue | SfInnerList): FieldValue {
    return isInnerList(value)
        ? FieldValue.absent()
        : FieldValue.present(value);
}

function navigateInnerList(
    inner: SfInnerList,
    rest: readonly string[],
): FieldValue {
    const index = Number(rest[0]);
    if (
        !Number.isInteger(index)
        || index < 0
        || index >= inner.items.length
    ) {
        return FieldValue.absent();
    }
    const item = inner.items[index]!;
    if (rest.length === 1) return leaf(item.value);
    return parameter(item, rest.slice(1));
}

// After a value is selected, a single remaining segment names a
// parameter; anything deeper has no leaf to reach.
function parameter(
    item: SfItem,
    rest: readonly string[],
): FieldValue {
    if (rest.length !== 1) return FieldValue.absent();
    const value = item.params.get(rest[0]!);
    return value === undefined
        ? FieldValue.absent()
        : FieldValue.present(value);
}

function combine(lines: readonly FieldLine[]): string {
    return lines.map((line) => line.value).join(', ');
}
