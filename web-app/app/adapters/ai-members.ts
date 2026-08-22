import type {
    MemberId,
    MemberEntity,
    AIAgentEntity,
} from '../../../api/types.ts';
import { AIMember } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';

export {
    AIMember,
} from '../../../api/types.ts';
export type {
    AIMemberEntity,
} from '../../../api/types.ts';

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

export function buildAIMemberMap(
    parents: readonly MemberEntity[],
    details: readonly AIAgentEntity[],
): Map<MemberId, AIMember> {
    const detailById = new Map(
        details.map(d => [d.id, d]),
    );
    const map = new Map<MemberId, AIMember>();
    for (const parent of parents) {
        if (parent.type !== 'ai') continue;
        const detail = detailById.get(parent.id);
        if (detail === undefined) {
            throw new Error(
                'no AI detail for member ' + parent.id,
            );
        }
        map.set(
            parent.id,
            new AIMember(
                parent, {
                    id: detail.id,
                    name: detail.name,
                    description: detail.description,
                    skill_focus: detail.skill_focus,
                    model: detail.model,
                },
            ),
        );
    }
    return map;
}

export function buildAIAgentMap(
    agents: readonly AIAgentEntity[],
): Map<MemberId, AIMember> {
    const map = new Map<MemberId, AIMember>();
    for (const agent of agents) {
        map.set(
            agent.id,
            new AIMember(
                agentParent(agent.id),
                {
                    id: agent.id,
                    name: agent.name,
                    description: agent.description,
                    skill_focus: agent.skill_focus,
                    model: agent.model,
                },
            ),
        );
    }
    return map;
}

export async function getAIMemberMap(
    ctx: RequestContext,
): Promise<Map<MemberId, AIMember>> {
    const agents = await ctx.GET<AIAgentEntity[]>(
        'ai-agents/',
    );
    return buildAIAgentMap(agents);
}

export async function getAIMembers(
    ctx: RequestContext,
): Promise<AIMember[]> {
    const map = await getAIMemberMap(ctx);
    return Array.from(map.values());
}

export async function getAIMember(
    ctx: RequestContext,
    id: MemberId,
): Promise<AIMember> {
    const agent = await ctx.GET<AIAgentEntity>(
        `ai-agents/${id}`,
    );
    return new AIMember(
        agentParent(id),
        {
            id: agent.id,
            name: agent.name,
            description: agent.description,
            skill_focus: agent.skill_focus,
            model: agent.model,
        },
    );
}

export async function getAIMemberEntity(
    ctx: RequestContext,
    id: MemberId,
): Promise<AIAgentEntity> {
    return ctx.GET<AIAgentEntity>(
        `ai-agents/${id}`,
    );
}

export async function putAIMember(
    ctx: RequestContext,
    id: MemberId,
    input: AIMemberDraft,
): Promise<void> {
    await ctx.PUT(`ai-agents/${id}`, {
        name: input.name,
        description: input.description,
        skill_focus: input.skill_focus,
        model: input.model,
    });
    aiMemberChanges.notify();
}

export async function postAIMemberCreation(
    ctx: RequestContext,
    id: MemberId,
    input: AIMemberDraft,
): Promise<void> {
    await ctx.PUT(`ai-agents/${id}`, {
        name: input.name,
        description: input.description,
        skill_focus: input.skill_focus,
        model: input.model,
    });
    aiMemberChanges.notify();
}
