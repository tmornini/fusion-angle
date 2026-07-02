import {
    HttpMessage,
} from '../shared/http-message/http-message.ts';
import {
    parseJson,
} from '../shared/http-message/json-codec.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';
import {
    HttpMessageError,
    type MessageModel,
} from '../shared/http-message/types.ts';
import { putField } from '../shared/http-message/modify.ts';
import {
    parsePreservingNumbers,
} from '../shared/http-message/json-numbers.ts';
import { sortJsonKeys } from '../shared/http-message/canonical.ts';
import { sha256Hex } from '../shared/digest.ts';
import { hashPassword } from '../shared/password-hash.ts';

const JSON_MEDIA_TYPE = 'application/json';
const PASSWORD_FIELD = 'password';

// Field lists per Decision 4 (C1): the /authentication
// message pairs carry live secrets in BOTH directions;
// every token-class field is fingerprinted before hashing
// and storage — the ledger never holds a live secret.
const REDACTED_HEADERS = ['authorization', 'cookie'];
const HIGH_ENTROPY_REQUEST_FIELDS = [
    'refresh_token', 'subject_token', 'actor_token',
    'client_assertion', 'code',
];
const HIGH_ENTROPY_RESPONSE_FIELDS = [
    'access_token', 'refresh_token', 'code',
];
const AUTHENTICATION_ROUTE_PATTERNS = new Set([
    'authentication/token', 'authentication/authorize',
]);

// The same modelOf round trip as message-form.ts: HttpMessage
// has no model accessor, so rebuilding a MessageModel after a
// withBody derivation goes through the library's own
// canonical JSON, keeping this module's declared
// MessageModel-in/out interface intact.
function modelOf(message: HttpMessage): MessageModel {
    return parseJson(
        message.toJson(), defaultBodyRegistry(),
    );
}

async function fingerprint(value: string): Promise<string> {
    return 'sha256:' + await sha256Hex(value);
}

// The DETERMINISTIC text a non-string field's value fingerprints
// over: sortJsonKeys (canonical.ts) orders any nested object's
// keys ASCII-ascending, and the ES2025 raw-JSON holders
// (json-numbers.ts's parsePreservingNumbers, already applied to
// `value`'s ancestor decode) carry a number's EXACT source text
// through JSON.stringify unrounded — both compose at every depth
// of the tree, including when `value` itself is a raw holder
// (a bare top-level number). Determinism is REQUIRED, not a
// nicety: this text feeds the same fingerprint on every call for
// the same input, which in turn feeds message_hash
// (message-form.ts) — a value that serialized differently across
// two identical requests would silently break the byte-identical
// -resend contract every wired route's idempotency fast path
// relies on (message-pair.ts's storedResponseFor).
function canonicalFieldText(value: unknown): string {
    return JSON.stringify(sortJsonKeys(value));
}

// The fingerprint input for a PRESENT high-entropy field: the
// value itself when it is a string (unchanged from before), else
// its canonicalFieldText — see that function for why determinism
// matters. A stray field a given grant never reads (the redactor
// applies ONE static field list per route, across every grant
// that route dispatches to) still redacts cleanly instead of
// forcing a 400/500 the domain itself never raised for it.
async function fingerprintField(value: unknown): Promise<string> {
    return fingerprint(
        typeof value === 'string' ? value : canonicalFieldText(value),
    );
}

export async function redactHeaderCredentials(
    model: MessageModel,
): Promise<MessageModel> {
    let out = model;
    for (const field of model.fields) {
        if (REDACTED_HEADERS.includes(field.name)) {
            out = putField(
                out, field.name,
                await fingerprint(field.value),
            );
        }
    }
    return out;
}

// Fingerprint (or, for a present `password`, PBKDF2-hash) each
// PRESENT field named in `highEntropyFields`, leaving every
// other field untouched and every absent field absent. A
// PRESENT field is ALWAYS redacted, whatever its type — a
// string fingerprints directly (unchanged from before); a
// non-string fingerprints over its canonicalFieldText. NEVER a
// throw and NEVER a pass-through for a present field: the
// redactor applies ONE static field list per ROUTE (every
// grant_type/method that route dispatches to shares it), so a
// valid request for one grant can carry a field only a SIBLING
// grant reads — e.g. an authorization_code exchange carrying a
// stray, unused `refresh_token` — and that field's type is not
// this module's business to police; only its SECRECY is. A
// throw here would turn a request the domain accepts (200) into
// a 500 this module invented, for a field the domain never even
// looked at. A bodyless message, or a body whose decoded value
// is not a plain JSON object, returns unchanged — redaction
// never invents keys or reshapes an unrelated body. A body that
// FAILS TO PARSE as JSON is the one remaining throw
// (HttpMessageError) — never a silent pass-through of a body
// that may still carry a live secret — matching the library's
// own idiom (media-registry.ts's jsonBodyCodec); this is a
// structurally malformed message, not a field-level type
// question, so it stays a throw. The parse preserves verbatim
// number text (json-numbers.ts, the same primitive
// json-codec.ts's canonical form uses), so an untouched numeric
// field beyond IEEE-754 safe-integer range survives the
// redact/re-encode round trip unrounded, and a REDACTED numeric
// field fingerprints over that same exact text (canonicalFieldText).
async function redactBody(
    model: MessageModel,
    highEntropyFields: readonly string[],
    redactPassword: boolean,
): Promise<MessageModel> {
    const message = HttpMessage.fromModel(model);
    if (!message.body().exists()) return model;
    let decoded: unknown;
    try {
        decoded = parsePreservingNumbers(
            message.body().toText(),
        );
    } catch {
        throw new HttpMessageError('malformed JSON body');
    }
    if (
        typeof decoded !== 'object'
        || decoded === null
        || Array.isArray(decoded)
    ) {
        return model;
    }
    const source = decoded as Record<string, unknown>;
    const redacted: Record<string, unknown> = { ...source };
    for (const name of highEntropyFields) {
        if (!(name in source)) continue;
        redacted[name] = await fingerprintField(source[name]);
    }
    if (redactPassword && PASSWORD_FIELD in source) {
        const value = source[PASSWORD_FIELD];
        redacted[PASSWORD_FIELD] = typeof value === 'string'
            ? await hashPassword(value)
            : await hashPassword(canonicalFieldText(value));
    }
    return modelOf(
        message.withBody(JSON_MEDIA_TYPE, redacted),
    );
}

export async function redactAuthenticationRequest(
    routePattern: string, model: MessageModel,
): Promise<MessageModel> {
    if (!AUTHENTICATION_ROUTE_PATTERNS.has(routePattern)) {
        return model;
    }
    return redactBody(
        model, HIGH_ENTROPY_REQUEST_FIELDS, true,
    );
}

export async function redactAuthenticationResponse(
    routePattern: string, model: MessageModel,
): Promise<MessageModel> {
    if (!AUTHENTICATION_ROUTE_PATTERNS.has(routePattern)) {
        return model;
    }
    return redactBody(
        model, HIGH_ENTROPY_RESPONSE_FIELDS, false,
    );
}
