import type {
    Id,
    ModelEntity,
    RoleModelMembershipEntity,
} from '../../../api/types.ts';
import {
    Model,
    Role,
    nowUtc,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';
import {
    getRoleMap,
} from './roles.ts';

export {
    Model,
} from '../../../api/types.ts';
export type {
    ModelEntity,
    RoleModelMembershipEntity,
} from '../../../api/types.ts';

export async function getModelMap(
    ctx: RequestContext,
): Promise<Map<Id, Model>> {
    const rows =
        await ctx.GET<ModelEntity[]>('models');
    return new Map(
        rows.map(
            entity => [entity.id, new Model(entity)],
        ),
    );
}

export async function getRoleModelMembershipRows(
    ctx: RequestContext,
): Promise<RoleModelMembershipEntity[]> {
    return ctx.GET<RoleModelMembershipEntity[]>(
        'role-model-memberships',
    );
}

const modelChanges =
    createSubscriptionChannel([
        'models', 'role_model_memberships',
    ]);

const roleModelMembershipChanges =
    createSubscriptionChannel([
        'role_model_memberships',
    ]);

export function subscribeModelChanges(
    fn: () => void,
): () => void {
    return modelChanges.subscribe(fn);
}

export function subscribeRoleModelMembershipChanges(
    fn: () => void,
): () => void {
    return roleModelMembershipChanges
        .subscribe(fn);
}

export async function getModels(
    ctx: RequestContext,
): Promise<Model[]> {
    const map = await getModelMap(ctx);
    return Array.from(map.values());
}

export async function getModel(
    ctx: RequestContext,
    id: Id,
): Promise<Model> {
    const map = await getModelMap(ctx);
    const model = map.get(id);
    if (!model) {
        throw new Error(
            'getModel: unknown model ' + id,
        );
    }
    return model;
}

export async function putModel(
    ctx: RequestContext,
    id: Id,
    entity: Omit<ModelEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`models/${id}`, entity);
    modelChanges.notify();
}

// Cascade-deletes every role_model_memberships
// row that references this model, then deletes
// the model itself, in a single ctx.commit.
// Article on Atomicity.
export async function deleteModel(
    ctx: RequestContext,
    modelId: Id,
): Promise<void> {
    const memberships =
        await getRoleModelMembershipRows(ctx);
    const cascadeIds = memberships
        .filter(m => m.model_id === modelId)
        .map(m => m.id);
    await ctx.commit({
        ops: [
            ...cascadeIds.map(id => ({
                method: 'delete' as const,
                resource:
                    `role-model-memberships/${id}`,
            })),
            {
                method: 'delete' as const,
                resource: `models/${modelId}`,
            },
        ],
    });
    modelChanges.notify();
    roleModelMembershipChanges.notify();
}

export async function getModelsInRole(
    ctx: RequestContext,
    roleId: Id,
): Promise<Model[]> {
    const [memberships, modelMap] =
        await Promise.all([
            getRoleModelMembershipRows(ctx),
            getModelMap(ctx),
        ]);
    return memberships
        .filter(m => m.role_id === roleId)
        .map(m => {
            const model = modelMap.get(
                m.model_id,
            );
            if (!model) {
                throw new Error(
                    'getModelsInRole: '
                    + 'membership ' + m.id
                    + ' references unknown'
                    + ' model ' + m.model_id,
                );
            }
            return model;
        });
}

export async function getRolesContainingModel(
    ctx: RequestContext,
    modelId: Id,
): Promise<Role[]> {
    const [memberships, roleMap] =
        await Promise.all([
            getRoleModelMembershipRows(ctx),
            getRoleMap(ctx),
        ]);
    const roleIds = new Set(
        memberships
            .filter(m => m.model_id === modelId)
            .map(m => m.role_id),
    );
    return Array.from(roleMap.values())
        .filter(r => roleIds.has(
            r.idForLink(),
        ));
}

export async function addModelToRole(
    ctx: RequestContext,
    roleId: Id,
    modelId: Id,
): Promise<void> {
    const [roleMap, modelMap] =
        await Promise.all([
            getRoleMap(ctx),
            getModelMap(ctx),
        ]);
    if (!roleMap.has(roleId)) {
        throw new Error(
            'addModelToRole: unknown role '
            + roleId,
        );
    }
    if (!modelMap.has(modelId)) {
        throw new Error(
            'addModelToRole: unknown model '
            + modelId,
        );
    }
    const id = generateCryptoSafeBase62();
    await ctx.PUT(
        `role-model-memberships/${id}`,
        {
            role_id: roleId,
            model_id: modelId,
            created_at: nowUtc(),
        },
    );
    roleModelMembershipChanges.notify();
}

export async function removeModelFromRole(
    ctx: RequestContext,
    membershipId: Id,
): Promise<void> {
    await ctx.DELETE(
        `role-model-memberships/${membershipId}`,
    );
    roleModelMembershipChanges.notify();
}
