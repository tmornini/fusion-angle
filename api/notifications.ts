// The /notifications contract: org- and identity-scoped
// change events replacing the table-name broadcast. The
// transport is an adapter (BroadcastChannel at the browser
// tier, LISTEN/NOTIFY at the server tier); this module owns
// only the event shape and target derivation — Decision 5.
export type NotificationEvent =
    | {
        readonly kind: 'scoped';
        readonly organizationIds: readonly string[];
        readonly identityIds: readonly string[];
    }
    | { readonly kind: 'full' };

export type NotificationPost =
    (event: NotificationEvent) => void;

export function identityTargetsFor(
    routePattern: string,
    params: readonly string[],
    body: Record<string, unknown> | undefined,
): readonly string[] {
    const targets = new Set<string>();
    if (routePattern.startsWith('identities/:id')) {
        const id = params[0];
        if (id !== undefined && id !== '') {
            targets.add(id);
        }
    }
    const bodyIdentity = body?.['identity_id'];
    if (typeof bodyIdentity === 'string'
        && bodyIdentity !== '') {
        targets.add(bodyIdentity);
    }
    return [...targets];
}

function isStringArray(
    value: unknown,
): value is readonly string[] {
    return Array.isArray(value)
        && value.every((v) => typeof v === 'string');
}

export function notificationEventFromWire(
    data: unknown,
): NotificationEvent {
    if (typeof data === 'object' && data !== null) {
        const event = data as Record<string, unknown>;
        if (event.kind === 'full') {
            return { kind: 'full' };
        }
        if (event.kind === 'scoped'
            && isStringArray(event.organizationIds)
            && isStringArray(event.identityIds)) {
            return {
                kind: 'scoped',
                organizationIds: event.organizationIds,
                identityIds: event.identityIds,
            };
        }
    }
    throw new Error(
        'malformed notification event: '
        + JSON.stringify(data),
    );
}
