import type { DbAdapter } from './db.ts';
import type {
    AIAgentEntity,
    Id,
    IdentityProfileFields,
    MessagePairEntity,
    ServiceEntity,
} from '../shared/types.ts';
import type { Route } from './routes.ts';
import {
    requireOrganization,
    withoutId,
} from './document-family.ts';
import { canonicalPath } from './message-pair.ts';
import {
    pickString,
    validateAiAgentDocumentBody,
    validateIdentityEntity,
    validateServiceDocumentBody,
} from './validators.ts';
import {
    isDeletedHead,
    matchingCollection,
    selectHeadsAtPath,
} from './head-reads.ts';
import { servedBodyOf } from './served-response.ts';
import {
    membershipOfHead,
    organizationMembershipHeads,
} from './memberships.ts';

// What a served membership body joins to, each under the
// rule of the GET that serves it to this caller.
export interface MembershipSearchJoins {
    readonly agents: ReadonlyMap<Id, AIAgentEntity>;
    readonly services: ReadonlyMap<Id, ServiceEntity>;
    // identities/:id bodies, read only when the caller
    // holds admin: the identities/:id GET refuses
    // every other caller (MEMBER_VERBS has no row).
    readonly profiles: ReadonlyMap<Id, IdentityProfileFields>;
}

// The memberships QUERY: the collection's own GET select,
// so its ?state= judge and its join are the GET's, then
// each membership matched on what it and its member's
// documents serve this caller.
export function withMembershipSearch(route: Route): Route {
    const select = route.select;
    if (select === undefined) {
        throw new Error('a membership search route has no select');
    }
    return {
        ...route,
        selectMatching: async (
            db, params, actor, organization, roles, query, text,
        ) => {
            const [selection, joins] = await Promise.all([
                select(db, params, actor, organization, roles, query),
                membershipSearchJoinsOf(
                    db, requireOrganization(organization), roles,
                ),
            ]);
            return matchingCollection(selection, text, (body) =>
                membershipSearchFields(body, joins));
        },
    };
}

// Any member may GET the organization's ai-agents/:id and
// services/:id documents; only an organization admin may
// GET identities/:id.
export async function membershipSearchJoinsOf(
    db: DbAdapter,
    organization: Id,
    roles: readonly string[],
): Promise<MembershipSearchJoins> {
    const [agents, services, profiles] = await Promise.all([
        documentsAt(
            db, canonicalPath(organization, '/ai-agents/'),
            (body) => ({
                id: pickString(body, 'id'),
                ...validateAiAgentDocumentBody(withoutId(body))
                    .entity,
            }),
        ),
        documentsAt(
            db, canonicalPath(organization, '/services/'),
            (body) => ({
                id: pickString(body, 'id'),
                ...validateServiceDocumentBody(withoutId(body))
                    .entity,
            }),
        ),
        roles.includes('admin')
            ? seatedProfilesOf(db, organization)
            : new Map<Id, IdentityProfileFields>(),
    ]);
    return { agents, services, profiles };
}

// A membership's own fields, the join's name and email
// when the join served them (an erased PII is not joined),
// and its member's AI, service, or profile document.
export function membershipSearchFields(
    body: Record<string, unknown>,
    joins: MembershipSearchJoins,
): readonly string[] {
    const identityId = pickString(body, 'identity_id');
    const profile = joins.profiles.get(identityId);
    const agent = joins.agents.get(identityId);
    const service = joins.services.get(identityId);
    return [
        pickString(body, 'id'),
        identityId,
        pickString(body, 'identity_kind'),
        pickString(body, 'state'),
        pickString(body, 'type'),
        ...joinedOf(body, 'invitee_name'),
        ...joinedOf(body, 'invitee_email'),
        ...(profile === undefined
            ? []
            : [profile.title, profile.department]),
        ...(agent === undefined
            ? []
            : [
                agent.name, agent.description,
                agent.skill_focus, agent.model,
            ]),
        ...(service === undefined
            ? []
            : [service.name, service.description]),
    ];
}

function joinedOf(
    body: Record<string, unknown>,
    key: string,
): string[] {
    return key in body ? [pickString(body, key)] : [];
}

// A member document's id is its member's identity id.
async function documentsAt<T extends { readonly id: Id }>(
    db: DbAdapter,
    path: string,
    entityOf: (body: Record<string, unknown>) => T,
): Promise<ReadonlyMap<Id, T>> {
    const selection = await selectHeadsAtPath(db, path, 'stateless');
    if (selection.kind !== 'collection') {
        throw new Error(
            'member documents read a collection, not a '
                + selection.kind,
        );
    }
    return new Map(selection.heads
        .filter((head) => !isDeletedHead(head, selection.lifecycle))
        .map((head) => {
            const entity = entityOf(
                servedBodyOf(head, selection.reader),
            );
            return [entity.id, entity];
        }));
}

// The identities/:id GET names an identity other than the
// caller's own only while it holds an accepted seat in the
// caller's organization, so only those seats' profiles
// join; a deleted identity is Gone there, so it joins
// none. Every seat's identity has a document (the seat
// lands in its commit), so one without is the store's bug.
// The transaction awaits only the row reads; the bodies
// decode after it.
async function seatedProfilesOf(
    db: DbAdapter,
    organization: Id,
): Promise<ReadonlyMap<Id, IdentityProfileFields>> {
    const identities = canonicalPath(undefined, '/identities/');
    const heads = await db.readTransaction(async (view) => {
        const seats = await organizationMembershipHeads(
            view, organization, { kind: 'state', state: 'accepted' },
        );
        const read: [Id, MessagePairEntity | null][] = [];
        for (const seat of seats) {
            const identityId = membershipOfHead(seat).identity_id;
            read.push([
                identityId,
                await view.messagePairs.getHeadPair(
                    identities, identityId,
                ),
            ]);
        }
        return read;
    });
    const profiles = new Map<Id, IdentityProfileFields>();
    for (const [identityId, head] of heads) {
        if (head === null) {
            throw new Error('no identity document for ' + identityId);
        }
        if (isDeletedHead(head, 'stateless')) continue;
        const body = servedBodyOf(head, { sees: 'whole' });
        const entity = validateIdentityEntity(withoutId(body));
        if ('title' in entity) {
            profiles.set(identityId, {
                title: entity.title,
                department: entity.department,
                strengths: entity.strengths,
                team_dimensions: entity.team_dimensions,
            });
        }
    }
    return profiles;
}
