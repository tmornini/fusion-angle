import type { DbAdapter } from './db.ts';
import type { Id, MessagePairEntity } from '../shared/types.ts';
import type {
    MatchingSelectHandler,
    SelectHandler,
} from './routes.ts';
import {
    requireOrganization,
    withoutId,
} from './document-family.ts';
import {
    pickString,
    validateIdeaSubmissionEntity,
    validateProjectDocumentBody,
    validateProjectFlowEntity,
} from './validators.ts';
import {
    isDeletedHead,
    matchingCollection,
    wholeCollectionSelection,
    type HeadSelection,
    type MixedPart,
} from './head-reads.ts';
import { servedBodyOf } from './served-response.ts';
import { memberNamesOf, servedBodiesOf } from './member-names.ts';
import { selectOrganizationMemberships } from
    './invitations-domain.ts';
import {
    membershipSearchFields,
    membershipSearchJoinsOf,
} from './membership-search.ts';
import { submissionsUriPrefix } from './derive-ideas.ts';
import { projectFlowsUriPrefix } from './derive-project-flows.ts';

type Collection = Extract<HeadSelection, { kind: 'collection' }>;

// The collection GETs whose heads the organization root
// searches: each family's own select, so its reader and
// lifecycle are the GET's.
export interface OrganizationFamilies {
    readonly ideas: SelectHandler;
    readonly projects: SelectHandler;
}

// The organization-root QUERY: the organization's ideas,
// projects, and people, each family ranked alone and
// answered in that order. Each part matches on what it
// and its joins serve this caller.
export function organizationSearch(
    families: OrganizationFamilies,
): MatchingSelectHandler {
    return async (
        db, params, actor, organization, roles, query, text,
    ) => {
        const organizationId = requireOrganization(organization);
        const [ideas, projects, memberships, memberNames, joins] =
            await Promise.all([
                families.ideas(
                    db, params, actor, organization, roles, query,
                ).then(collectionOf),
                families.projects(
                    db, params, actor, organization, roles, query,
                ).then(collectionOf),
                selectOrganizationMemberships(
                    db, organizationId,
                    { kind: 'state', state: 'accepted' },
                ).then(collectionOf),
                memberNamesOf(db, organizationId),
                membershipSearchJoinsOf(db, organizationId, roles),
            ]);
        const [submissions, bindings] = await Promise.all([
            nestedBodiesOf(db, ideas, (id) =>
                submissionsUriPrefix(organizationId, id)),
            nestedBodiesOf(db, projects, (id) =>
                projectFlowsUriPrefix(organizationId, id)),
        ]);
        const people = peopleOf(memberships);
        return {
            kind: 'mixed',
            parts: [
                ...partsOf(
                    matchingCollection(ideas, text, (body, head) =>
                        ideaFieldsOf(
                            body, nestedAt(submissions, head),
                            memberNames,
                        )),
                    documentPathOf,
                ),
                ...partsOf(
                    matchingCollection(projects, text, (body, head) =>
                        projectFieldsOf(
                            body, nestedAt(bindings, head),
                        )),
                    documentPathOf,
                ),
                ...partsOf(
                    matchingCollection(people, text, (body) =>
                        membershipSearchFields(body, joins)),
                    // A seat's head lies at the body-indexed
                    // store prefix; its document's GET, and
                    // the Location its POST answers, lie under
                    // the organization.
                    (head) => '/organizations/' + organizationId
                        + '/invitations/' + head.name,
                ),
            ],
        };
    };
}

// A document family's head path is its document's GET
// path.
function documentPathOf(head: MessagePairEntity): string {
    return head.path + head.name;
}

function collectionOf(selection: HeadSelection): Collection {
    if (selection.kind !== 'collection') {
        throw new Error(
            'an organization search reads collections, not a '
                + selection.kind,
        );
    }
    return selection;
}

function partsOf(
    selection: HeadSelection,
    locationOf: (head: MessagePairEntity) => string,
): MixedPart[] {
    const collection = collectionOf(selection);
    return collection.heads.map((head) => ({
        head,
        lifecycle: collection.lifecycle,
        reader: collection.reader,
        location: locationOf(head),
    }));
}

// The top bar names a person, never an AI or a service.
function peopleOf(memberships: Collection): Collection {
    return {
        ...memberships,
        heads: memberships.heads.filter((head) =>
            servedBodyOf(head, memberships.reader)['identity_kind']
                === 'person'),
    };
}

// Each live head's nested collection as its GET serves
// it, read in one snapshot: a deleted document's is never
// read, so it joins nothing.
async function nestedBodiesOf(
    db: DbAdapter,
    collection: Collection,
    prefixOf: (id: Id) => string,
): Promise<ReadonlyMap<Id, readonly Record<string, unknown>[]>> {
    const live = collection.heads.filter((head) =>
        !isDeletedHead(head, collection.lifecycle));
    const nested = await db.messagePairs.getCollectionHeadPairsBatch(
        live.map((head) => ({ path: prefixOf(head.name) })),
    );
    return new Map(live.map((head, at) => [
        head.name,
        servedBodiesOf(
            wholeCollectionSelection(nested[at]!, 'stateless'),
        ),
    ]));
}

// Matching reads only live heads, and every live head's
// nested collection was read.
function nestedAt(
    nested: ReadonlyMap<Id, readonly Record<string, unknown>[]>,
    head: MessagePairEntity,
): readonly Record<string, unknown>[] {
    const bodies = nested.get(head.name);
    if (bodies === undefined) {
        throw new Error('no nested read for ' + head.name);
    }
    return bodies;
}

// An idea's submitter rides its submissions: the member
// id, and the name the member's GETs serve.
function ideaFieldsOf(
    body: Record<string, unknown>,
    submissions: readonly Record<string, unknown>[],
    memberNames: ReadonlyMap<Id, string>,
): string[] {
    return [
        pickString(body, 'id'),
        pickString(body, 'title'),
        pickString(body, 'state'),
        ...submissions.flatMap((submission) => {
            const memberId = validateIdeaSubmissionEntity(
                withoutId(submission),
            ).member_id;
            const name = memberNames.get(memberId);
            return name === undefined ? [memberId] : [memberId, name];
        }),
    ];
}

// A project's progress is the number the top bar shows;
// its label and joiner are presentation, never matched.
function projectFieldsOf(
    body: Record<string, unknown>,
    bindings: readonly Record<string, unknown>[],
): string[] {
    const project = validateProjectDocumentBody(withoutId(body));
    return [
        pickString(body, 'id'),
        project.entity.title,
        project.state,
        String(project.entity.progress),
        ...bindings.map((binding) =>
            validateProjectFlowEntity(withoutId(binding)).flow_id),
    ];
}
