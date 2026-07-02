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

// Fingerprint (or, for a present `password`, PBKDF2-hash)
// each PRESENT field named in `highEntropyFields`, leaving
// every other field untouched and every absent field absent.
// A bodyless message, or a body whose decoded value is not a
// plain JSON object, returns unchanged — redaction never
// invents keys or reshapes an unrelated body. A body that
// fails to parse as JSON throws — never a silent pass-through
// of a body that may still carry a live secret — matching the
// library's own idiom (media-registry.ts's jsonBodyCodec).
// The parse preserves verbatim number text (json-numbers.ts,
// the same primitive json-codec.ts's canonical form uses), so
// an untouched numeric field beyond IEEE-754 safe-integer
// range survives the redact/re-encode round trip unrounded.
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
        const value = source[name];
        if (typeof value === 'string') {
            redacted[name] = await fingerprint(value);
        }
    }
    if (redactPassword) {
        const value = source[PASSWORD_FIELD];
        if (typeof value === 'string') {
            redacted[PASSWORD_FIELD] =
                await hashPassword(value);
        }
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
