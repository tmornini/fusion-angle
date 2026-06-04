import {
    type Id,
    type ClientEntity,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';

export async function getClient(
    ctx: RequestContext,
    id: Id,
): Promise<ClientEntity> {
    return ctx.GET<ClientEntity>(`clients/${id}`);
}

export async function putClient(
    ctx: RequestContext,
    id: Id,
    draft: Omit<ClientEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`clients/${id}`, { ...draft });
}

export async function deleteClient(
    ctx: RequestContext,
    id: Id,
): Promise<void> {
    await ctx.DELETE(`clients/${id}`);
}
