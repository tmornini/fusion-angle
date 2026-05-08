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
import type { FetchContext } from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';

export {
    Model,
} from '../../../api/types.ts';
export type {
    ModelEntity,
    RoleModelMembershipEntity,
} from '../../../api/types.ts';

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
    ctx: FetchContext,
): Promise<Model[]> {
    const map = await ctx.getModelMap();
    return Array.from(map.values());
}

export async function getModel(
    ctx: FetchContext,
    id: Id,
): Promise<Model> {
    const map = await ctx.getModelMap();
    const model = map.get(id);
    if (!model) {
        throw new Error(
            'getModel: unknown model ' + id,
        );
    }
    return model;
}

export async function putModel(
    ctx: FetchContext,
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
    ctx: FetchContext,
    modelId: Id,
): Promise<void> {
    const memberships =
        await ctx.getRoleModelMembershipRows();
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
    ctx: FetchContext,
    roleId: Id,
): Promise<Model[]> {
    const [memberships, modelMap] =
        await Promise.all([
            ctx.getRoleModelMembershipRows(),
            ctx.getModelMap(),
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
    ctx: FetchContext,
    modelId: Id,
): Promise<Role[]> {
    const [memberships, roleMap] =
        await Promise.all([
            ctx.getRoleModelMembershipRows(),
            ctx.getRoleMap(),
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
    ctx: FetchContext,
    roleId: Id,
    modelId: Id,
): Promise<void> {
    const [roleMap, modelMap] =
        await Promise.all([
            ctx.getRoleMap(),
            ctx.getModelMap(),
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
    ctx: FetchContext,
    membershipId: Id,
): Promise<void> {
    await ctx.DELETE(
        `role-model-memberships/${membershipId}`,
    );
    roleModelMembershipChanges.notify();
}
