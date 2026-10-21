import type {
    MemberId,
    MemberEntity,
    AIAgentEntity,
    MembershipEntity,
} from '../shared/types.ts';
import { AIMember } from '../shared/types.ts';
import type { RequestContext } from './request-context.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import {
    createSubscriptionChannel,
} from './channels.ts';
import { requireOrganization } from './members.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import {
    RequestError,
    HTTP_NOT_FOUND,
} from '../shared/http-errors.ts';

const aiMemberChanges =
    createSubscriptionChannel();

export function subscribeAIMemberChanges(
    fn: () => void,
): () => void {
    return aiMemberChanges.subscribe(fn);
}

export type AIMemberDraft =
    Omit<AIAgentEntity, 'id'>;

function agentParent(id: MemberId): MemberEntity {
    return { id, type: 'ai' };
}

function aiAgentsPath(ctx: RequestContext): string {
    return 'organizations/' + requireOrganization(ctx)
        + '/ai-agents/';
}

function acceptedMembershipsPath(
    ctx: RequestContext,
): string {
    return 'organizations/' + requireOrganization(ctx)
        + '/memberships/?state=accepted';
}

function membershipItemPath(
    ctx: RequestContext,
    id: MemberId,
): string {
    const organization = requireOrganization(ctx);
    return 'organizations/' + organization
        + '/invitations/'
        + membershipNameOf(organization, id);
}

function aiMemberOf(
    agent: AIAgentEntity,
    membership: HttpMessage<MembershipEntity>,
): AIMember {
    return new AIMember(
        agentParent(agent.id),
        {
            id: agent.id,
            name: agent.name,
            description: agent.description,
            skill_focus: agent.skill_focus,
            model: agent.model,
        },
        membership,
    );
}

// An AI is a member while its membership is accepted: an
// agent document with no seat among the memberships given
// is not a member.
export function buildAIAgentMap(
    agents: readonly AIAgentEntity[],
    memberships: readonly HttpMessage<MembershipEntity>[],
): Map<MemberId, AIMember> {
    const seats = new Map(memberships.map(
        (membership) => [
            membership.body().toValue().identity_id,
            membership,
        ],
    ));
    const map = new Map<MemberId, AIMember>();
    for (const agent of agents) {
        const membership = seats.get(agent.id);
        if (membership === undefined) continue;
        map.set(agent.id, aiMemberOf(agent, membership));
    }
    return map;
}

export async function getAIMemberMap(
    ctx: RequestContext,
): Promise<Map<MemberId, AIMember>> {
    const [memberships, agents] = await Promise.all([
        ctx.GETCollection<MembershipEntity>(
            acceptedMembershipsPath(ctx),
        ),
        ctx.GETCollection<AIAgentEntity>(
            aiAgentsPath(ctx),
        ).then((parts) => parts.map((m) => m.body().toValue())),
    ]);
    return buildAIAgentMap(agents, memberships);
}

export async function getAIMembers(
    ctx: RequestContext,
): Promise<AIMember[]> {
    const map = await getAIMemberMap(ctx);
    return Array.from(map.values());
}

// A membership that is not accepted is absence, as a
// missing document is.
export async function getAIMember(
    ctx: RequestContext,
    id: MemberId,
): Promise<AIMember> {
    const [agent, membership] = await Promise.all([
        ctx.GET<AIAgentEntity>(aiAgentsPath(ctx) + id),
        ctx.GET<MembershipEntity>(
            membershipItemPath(ctx, id),
        ),
    ]);
    if (membership.body().toValue().state !== 'accepted') {
        throw new RequestError(
            'no live AI member ' + id,
            HTTP_NOT_FOUND,
            membership,
        );
    }
    return aiMemberOf(agent.body().toValue(), membership);
}

export function getAIMemberEntity(
    ctx: RequestContext,
    id: MemberId,
): Promise<HttpMessage<AIAgentEntity>> {
    return ctx.GET<AIAgentEntity>(aiAgentsPath(ctx) + id);
}

// A save from the held agent names the head it replaces,
// so a write over a newer head is refused rather than lost.
export async function putAIMember(
    ctx: RequestContext,
    held: HttpMessage<AIAgentEntity>,
    input: AIMemberDraft,
): Promise<HttpMessage<AIAgentEntity>> {
    const saved = await ctx.PUT<AIAgentEntity>(
        aiAgentsPath(ctx) + held.body().toValue().id,
        {
            name: input.name,
            description: input.description,
            skill_focus: input.skill_focus,
            model: input.model,
        },
        [held],
    );
    aiMemberChanges.notify();
    return saved;
}

export async function postAIMemberCreation(
    ctx: RequestContext,
    id: MemberId,
    input: AIMemberDraft,
): Promise<void> {
    await ctx.PUT(aiAgentsPath(ctx) + id, {
        name: input.name,
        description: input.description,
        skill_focus: input.skill_focus,
        model: input.model,
    });
    aiMemberChanges.notify();
}
