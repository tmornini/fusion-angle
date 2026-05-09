import type {
    Id,
    CrewEntity,
    CrewRoleMembershipEntity,
} from '../../../api/types.ts';
import {
    Crew,
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
    isUserPrivateRoleId,
    personIdFromUserPrivateRoleId,
    userPrivateRoleFor,
    getMembersOfRole,
    getRoleMap,
} from './roles.ts';
import {
    getPersonMap,
} from './people.ts';

export {
    Crew,
} from '../../../api/types.ts';
export type {
    CrewEntity,
    CrewRoleMembershipEntity,
} from '../../../api/types.ts';

const crewChanges =
    createSubscriptionChannel([
        'crews', 'crew_role_memberships',
    ]);

const crewRoleMembershipChanges =
    createSubscriptionChannel([
        'crew_role_memberships',
    ]);

export async function getCrewMap(
    ctx: RequestContext,
): Promise<Map<Id, Crew>> {
    const rows =
        await ctx.GET<CrewEntity[]>('crews');
    return new Map(
        rows.map(
            entity => [entity.id, new Crew(entity)],
        ),
    );
}

export async function getCrewRoleMembershipRows(
    ctx: RequestContext,
): Promise<CrewRoleMembershipEntity[]> {
    return ctx.GET<CrewRoleMembershipEntity[]>(
        'crew-role-memberships',
    );
}

export function subscribeCrewChanges(
    fn: () => void,
): () => void {
    return crewChanges.subscribe(fn);
}

export function subscribeCrewRoleMembershipChanges(
    fn: () => void,
): () => void {
    return crewRoleMembershipChanges
        .subscribe(fn);
}

export async function getCrews(
    ctx: RequestContext,
): Promise<Crew[]> {
    const map = await getCrewMap(ctx);
    return Array.from(map.values());
}

export async function getCrew(
    ctx: RequestContext,
    id: Id,
): Promise<Crew> {
    const map = await getCrewMap(ctx);
    const crew = map.get(id);
    if (!crew) {
        throw new Error(
            'getCrew: unknown crew ' + id,
        );
    }
    return crew;
}

export async function putCrew(
    ctx: RequestContext,
    id: Id,
    entity: Omit<CrewEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`crews/${id}`, entity);
    crewChanges.notify();
}

// Cascade-deletes every crew_role_memberships
// row that references this crew, then deletes
// the crew itself, in a single ctx.commit.
// Article on Atomicity: the transactional
// primitive the platform provides — never
// simulated at the application layer.
export async function deleteCrew(
    ctx: RequestContext,
    crewId: Id,
): Promise<void> {
    const memberships =
        await getCrewRoleMembershipRows(ctx);
    const cascadeIds = memberships
        .filter(m => m.crew_id === crewId)
        .map(m => m.id);
    await ctx.commit({
        ops: [
            ...cascadeIds.map(id => ({
                method: 'delete' as const,
                resource:
                    `crew-role-memberships/${id}`,
            })),
            {
                method: 'delete' as const,
                resource: `crews/${crewId}`,
            },
        ],
    });
    crewChanges.notify();
    crewRoleMembershipChanges.notify();
}

export async function getRolesInCrew(
    ctx: RequestContext,
    crewId: Id,
): Promise<Role[]> {
    const [
        memberships, roleMap, personMap,
    ] = await Promise.all([
        getCrewRoleMembershipRows(ctx),
        getRoleMap(ctx),
        getPersonMap(ctx),
    ]);
    return memberships
        .filter(m => m.crew_id === crewId)
        .map(m => {
            if (isUserPrivateRoleId(m.role_id)) {
                const personId =
                    personIdFromUserPrivateRoleId(
                        m.role_id,
                    );
                const person =
                    personMap.get(personId);
                if (!person) {
                    throw new Error(
                        'getRolesInCrew: '
                        + 'membership ' + m.id
                        + ' references unknown'
                        + ' person ' + personId,
                    );
                }
                return userPrivateRoleFor(
                    person,
                );
            }
            const role = roleMap.get(m.role_id);
            if (!role) {
                throw new Error(
                    'getRolesInCrew: '
                    + 'membership ' + m.id
                    + ' references unknown'
                    + ' role ' + m.role_id,
                );
            }
            return role;
        });
}

export async function getCrewsContainingRole(
    ctx: RequestContext,
    roleId: Id,
): Promise<Crew[]> {
    const [
        memberships, crewMap,
    ] = await Promise.all([
        getCrewRoleMembershipRows(ctx),
        getCrewMap(ctx),
    ]);
    const crewIds = new Set(
        memberships
            .filter(m => m.role_id === roleId)
            .map(m => m.crew_id),
    );
    return Array.from(crewMap.values())
        .filter(c => crewIds.has(c.idForLink()));
}

export async function addRoleToCrew(
    ctx: RequestContext,
    crewId: Id,
    roleId: Id,
): Promise<void> {
    const [crewMap, roleMap, personMap] =
        await Promise.all([
            getCrewMap(ctx),
            getRoleMap(ctx),
            getPersonMap(ctx),
        ]);
    if (!crewMap.has(crewId)) {
        throw new Error(
            'addRoleToCrew: unknown crew '
            + crewId,
        );
    }
    if (isUserPrivateRoleId(roleId)) {
        const personId =
            personIdFromUserPrivateRoleId(
                roleId,
            );
        if (!personMap.has(personId)) {
            throw new Error(
                'addRoleToCrew: user-private'
                + ' role references unknown'
                + ' person ' + personId,
            );
        }
    } else if (!roleMap.has(roleId)) {
        throw new Error(
            'addRoleToCrew: unknown role '
            + roleId,
        );
    }
    const id = generateCryptoSafeBase62();
    await ctx.PUT(
        `crew-role-memberships/${id}`,
        {
            crew_id: crewId,
            role_id: roleId,
            created_at: nowUtc(),
        },
    );
    crewRoleMembershipChanges.notify();
}

export async function removeRoleFromCrew(
    ctx: RequestContext,
    membershipId: Id,
): Promise<void> {
    await ctx.DELETE(
        `crew-role-memberships/${membershipId}`,
    );
    crewRoleMembershipChanges.notify();
}

// Resolves every distinct person who participates
// in a crew via any of its roles, including the
// owner of any user-private role attached to the
// crew. The set is deduplicated; a person who
// belongs to two roles in one crew counts once.
export async function getMembersOfCrew(
    ctx: RequestContext,
    crewId: Id,
): Promise<Set<Id>> {
    const roles = await getRolesInCrew(
        ctx, crewId,
    );
    const personIds = new Set<Id>();
    for (const role of roles) {
        const id = role.idForLink();
        if (isUserPrivateRoleId(id)) {
            personIds.add(
                personIdFromUserPrivateRoleId(id),
            );
            continue;
        }
        const members = await getMembersOfRole(
            ctx, id,
        );
        for (const m of members) {
            personIds.add(
                m.person.idForLink(),
            );
        }
    }
    return personIds;
}
