import { parseWire, serializeWire } from './wire-codec.ts';
import { parseJson, serializeJson } from './json-codec.ts';
import { queryModel } from './query.ts';
import {
    appendField,
    deleteField,
    putBody,
    putField,
    putMethod,
    putStatus,
    putTarget,
} from './modify.ts';
import {
    BodyRegistry,
    defaultBodyRegistry,
} from './media-registry.ts';
import { HttpMessageError } from './types.ts';
import type { FieldValue } from './field-value.ts';
import type { MessageModel } from './types.ts';

// The public façade. An immutable message that derives its wire
// and JSON projections lazily and memoizes them — safe because
// the model can never change, so the memo can never stale (this
// is lazy pure derivation, not the Sin of the Cache). The body
// registry is injected (Dependency Inversion) and carried across
// modifications; it defaults to JSON-only so the first use needs
// no configuration.
export class HttpMessage {
    readonly #model: MessageModel;
    readonly #bodyRegistry: BodyRegistry;
    #wire: string | undefined;
    #json: string | undefined;

    private constructor(
        model: MessageModel,
        bodyRegistry: BodyRegistry,
    ) {
        this.#model = model;
        this.#bodyRegistry = bodyRegistry;
    }

    static fromModel(
        model: MessageModel,
        bodyRegistry: BodyRegistry = defaultBodyRegistry(),
    ): HttpMessage {
        return new HttpMessage(model, bodyRegistry);
    }

    static fromWire(
        wire: string,
        bodyRegistry: BodyRegistry = defaultBodyRegistry(),
    ): HttpMessage {
        return new HttpMessage(parseWire(wire), bodyRegistry);
    }

    static fromJson(
        json: string,
        bodyRegistry: BodyRegistry = defaultBodyRegistry(),
    ): HttpMessage {
        return new HttpMessage(parseJson(json), bodyRegistry);
    }

    toWire(): string {
        if (this.#wire === undefined) {
            this.#wire = serializeWire(this.#model);
        }
        return this.#wire;
    }

    toJson(): string {
        if (this.#json === undefined) {
            this.#json = serializeJson(this.#model);
        }
        return this.#json;
    }

    query(dottedKey: string): FieldValue {
        return queryModel(this.#model, this.#bodyRegistry, dottedKey);
    }

    // Modification returns a NEW message; this one is unchanged.
    // withFieldPut overwrites (idempotent — PUT semantics);
    // withFieldAppended is the one ordered, non-idempotent
    // affordance, named loudly.
    withFieldPut(name: string, value: string): HttpMessage {
        return this.#derive(putField(this.#model, name, value));
    }

    withFieldAppended(name: string, value: string): HttpMessage {
        return this.#derive(
            appendField(this.#model, name, value),
        );
    }

    withFieldDeleted(name: string): HttpMessage {
        return this.#derive(deleteField(this.#model, name));
    }

    withMethod(method: string): HttpMessage {
        return this.#derive(putMethod(this.#model, method));
    }

    withTarget(target: string): HttpMessage {
        return this.#derive(putTarget(this.#model, target));
    }

    withStatus(status: number, reason: string): HttpMessage {
        return this.#derive(
            putStatus(this.#model, status, reason),
        );
    }

    withBody(mediaType: string, value: unknown): HttpMessage {
        const codec = this.#bodyRegistry.codecFor(mediaType);
        if (codec === undefined) {
            throw new HttpMessageError(
                'no body codec for media type: ' + mediaType,
            );
        }
        return this.#derive(
            putBody(this.#model, mediaType, codec.encode(value)),
        );
    }

    #derive(model: MessageModel): HttpMessage {
        return new HttpMessage(model, this.#bodyRegistry);
    }
}
