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
import type { FetchContext } from './shared.ts';
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
} from './roles.ts';

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
    ctx: FetchContext,
): Promise<Crew[]> {
    const map = await ctx.getCrewMap();
    return Array.from(map.values());
}

export async function getCrew(
    ctx: FetchContext,
    id: Id,
): Promise<Crew> {
    const map = await ctx.getCrewMap();
    const crew = map.get(id);
    if (!crew) {
        throw new Error(
            'getCrew: unknown crew ' + id,
        );
    }
    return crew;
}

export async function putCrew(
    ctx: FetchContext,
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
    ctx: FetchContext,
    crewId: Id,
): Promise<void> {
    const memberships =
        await ctx.getCrewRoleMembershipRows();
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
    ctx: FetchContext,
    crewId: Id,
): Promise<Role[]> {
    const [
        memberships, roleMap, personMap,
    ] = await Promise.all([
        ctx.getCrewRoleMembershipRows(),
        ctx.getRoleMap(),
        ctx.getPersonMap(),
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
    ctx: FetchContext,
    roleId: Id,
): Promise<Crew[]> {
    const [
        memberships, crewMap,
    ] = await Promise.all([
        ctx.getCrewRoleMembershipRows(),
        ctx.getCrewMap(),
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
    ctx: FetchContext,
    crewId: Id,
    roleId: Id,
): Promise<void> {
    const [crewMap, roleMap, personMap] =
        await Promise.all([
            ctx.getCrewMap(),
            ctx.getRoleMap(),
            ctx.getPersonMap(),
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
    ctx: FetchContext,
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
    ctx: FetchContext,
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
