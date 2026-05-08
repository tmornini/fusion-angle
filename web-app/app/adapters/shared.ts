import type { DbAdapter } from '../../../api/db.ts';
import {
    GET as httpGet,
    PUT as httpPut,
    DELETE as httpDelete,
    POST as httpPost,
} from '../../../api/api.ts';
import type {
    Id,
    PersonEntity,
    IdeaEntity,
    ProjectEntity,
    FlowEntity,
    RoleEntity,
    RoleMembershipEntity,
    CrewEntity,
    CrewRoleMembershipEntity,
    ModelEntity,
    RoleModelMembershipEntity,
} from '../../../api/types.ts';
import {
    Person,
    Role,
    Crew,
    Model,
} from '../../../api/types.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';
import { getDbAdapter } from './init.ts';
import type { Channel } from '../channels.ts';

export type { Id } from '../../../api/types.ts';
export { Person } from '../../../api/types.ts';

export async function getCurrentPersonRow(
    ctx?: FetchContext,
): Promise<PersonEntity> {
    if (ctx) return ctx.getCurrentPerson();
    return httpGet<PersonEntity>(
        getDbAdapter(), 'current-person',
    );
}

// A unit of write work executed by ctx.commit().
// `put` upserts a row by full state; `delete` removes
// a row by its resource path. Sequenced in order;
// best-effort, no rollback (real atomicity arrives
// with Postgres). notifyChannels fire once after the
// last op succeeds — single batched event per
// channel per logical operation.
export type WriteOp =
    | {
        method: 'put';
        resource: string;
        body: Record<string, unknown>;
    }
    | {
        method: 'delete';
        resource: string;
    };

export interface Transaction {
    readonly ops: readonly WriteOp[];
    readonly notifyChannels?: readonly Channel<void>[];
}

export interface FetchContext {
    readonly requestId: string;
    GET<T>(resource: string): Promise<T>;
    PUT<T>(
        resource: string,
        body: Record<string, unknown>,
    ): Promise<T>;
    DELETE(resource: string): Promise<void>;
    POST<T>(
        resource: string,
        body: Record<string, unknown>,
    ): Promise<T>;
    getPersonMap(): Promise<Map<Id, Person>>;
    getPersonRows(): Promise<PersonEntity[]>;
    getCurrentPerson(): Promise<PersonEntity>;
    getIdeaRows(): Promise<IdeaEntity[]>;
    getProjectRows(
    ): Promise<ProjectEntity[]>;
    getFlowRows(): Promise<FlowEntity[]>;
    getRoleMap(): Promise<Map<Id, Role>>;
    getRoleMembershipRows(
    ): Promise<RoleMembershipEntity[]>;
    getCrewMap(): Promise<Map<Id, Crew>>;
    getCrewRoleMembershipRows(
    ): Promise<CrewRoleMembershipEntity[]>;
    getModelMap(): Promise<Map<Id, Model>>;
    getRoleModelMembershipRows(
    ): Promise<RoleModelMembershipEntity[]>;
    commit(tx: Transaction): Promise<void>;
}

export function createFetchContext(
    adapter: DbAdapter = getDbAdapter(),
): FetchContext {
    // Per-request memoization: each table is
    // fetched at most once per ctx. The promise
    // is captured the first time the getter is
    // called.
    let personRowsPromise:
        Promise<PersonEntity[]> | null = null;
    let personMapPromise:
        Promise<Map<Id, Person>> | null = null;
    let currentPersonPromise:
        Promise<PersonEntity> | null = null;
    let ideaRowsPromise:
        Promise<IdeaEntity[]> | null = null;
    let projectRowsPromise:
        Promise<ProjectEntity[]> | null = null;
    let flowRowsPromise:
        Promise<FlowEntity[]> | null = null;
    let roleMapPromise:
        Promise<Map<Id, Role>> | null = null;
    let roleMembershipRowsPromise:
        Promise<RoleMembershipEntity[]>
        | null = null;
    let crewMapPromise:
        Promise<Map<Id, Crew>> | null = null;
    let crewRoleMembershipRowsPromise:
        Promise<CrewRoleMembershipEntity[]>
        | null = null;
    let modelMapPromise:
        Promise<Map<Id, Model>> | null = null;
    let roleModelMembershipRowsPromise:
        Promise<RoleModelMembershipEntity[]>
        | null = null;
    const ctx: FetchContext = {
        requestId: generateCryptoSafeBase62(),
        GET: <T>(resource: string) =>
            httpGet<T>(adapter, resource),
        PUT: <T>(
            resource: string,
            body: Record<string, unknown>,
        ) => httpPut<T>(adapter, resource, body),
        DELETE: (resource: string) =>
            httpDelete(adapter, resource),
        POST: <T>(
            resource: string,
            body: Record<string, unknown>,
        ) => httpPost<T>(adapter, resource, body),
        getPersonRows: () => {
            if (!personRowsPromise) {
                personRowsPromise =
                    ctx.GET<PersonEntity[]>(
                        'people',
                    );
            }
            return personRowsPromise;
        },
        getPersonMap: () => {
            if (!personMapPromise) {
                personMapPromise = (async () => {
                    const rows =
                        await ctx.getPersonRows();
                    return new Map(
                        rows.map(
                            entity => [
                                entity.id,
                                new Person(entity),
                            ],
                        ),
                    );
                })();
            }
            return personMapPromise;
        },
        getCurrentPerson: () => {
            if (!currentPersonPromise) {
                currentPersonPromise =
                    ctx.GET<PersonEntity>(
                        'current-person',
                    );
            }
            return currentPersonPromise;
        },
        getIdeaRows: () => {
            if (!ideaRowsPromise) {
                ideaRowsPromise =
                    ctx.GET<IdeaEntity[]>(
                        'ideas',
                    );
            }
            return ideaRowsPromise;
        },
        getProjectRows: () => {
            if (!projectRowsPromise) {
                projectRowsPromise =
                    ctx.GET<ProjectEntity[]>(
                        'projects',
                    );
            }
            return projectRowsPromise;
        },
        getFlowRows: () => {
            if (!flowRowsPromise) {
                flowRowsPromise =
                    ctx.GET<FlowEntity[]>(
                        'flows',
                    );
            }
            return flowRowsPromise;
        },
        getRoleMap: () => {
            if (!roleMapPromise) {
                roleMapPromise = (async () => {
                    const rows = await ctx
                        .GET<RoleEntity[]>(
                            'roles',
                        );
                    return new Map(
                        rows.map(
                            entity => [
                                entity.id,
                                new Role(entity),
                            ],
                        ),
                    );
                })();
            }
            return roleMapPromise;
        },
        getRoleMembershipRows: () => {
            if (!roleMembershipRowsPromise) {
                roleMembershipRowsPromise =
                    ctx.GET<
                        RoleMembershipEntity[]
                    >('role-memberships');
            }
            return roleMembershipRowsPromise;
        },
        getCrewMap: () => {
            if (!crewMapPromise) {
                crewMapPromise = (async () => {
                    const rows = await ctx
                        .GET<CrewEntity[]>(
                            'crews',
                        );
                    return new Map(
                        rows.map(
                            entity => [
                                entity.id,
                                new Crew(entity),
                            ],
                        ),
                    );
                })();
            }
            return crewMapPromise;
        },
        getCrewRoleMembershipRows: () => {
            if (
                !crewRoleMembershipRowsPromise
            ) {
                crewRoleMembershipRowsPromise =
                    ctx.GET<
                        CrewRoleMembershipEntity[]
                    >('crew-role-memberships');
            }
            return crewRoleMembershipRowsPromise;
        },
        getModelMap: () => {
            if (!modelMapPromise) {
                modelMapPromise = (async () => {
                    const rows = await ctx
                        .GET<ModelEntity[]>(
                            'models',
                        );
                    return new Map(
                        rows.map(
                            entity => [
                                entity.id,
                                new Model(entity),
                            ],
                        ),
                    );
                })();
            }
            return modelMapPromise;
        },
        getRoleModelMembershipRows: () => {
            if (
                !roleModelMembershipRowsPromise
            ) {
                roleModelMembershipRowsPromise =
                    ctx.GET<
                        RoleModelMembershipEntity[]
                    >('role-model-memberships');
            }
            return roleModelMembershipRowsPromise;
        },
        commit: async (
            tx: Transaction,
        ): Promise<void> => {
            for (const op of tx.ops) {
                if (op.method === 'put') {
                    await ctx.PUT(
                        op.resource,
                        op.body,
                    );
                } else {
                    await ctx.DELETE(op.resource);
                }
            }
            if (tx.notifyChannels) {
                for (
                    const ch of tx.notifyChannels
                ) {
                    ch.send();
                }
            }
        },
    };
    return ctx;
}

export async function getPersonMap(
    ctx?: FetchContext,
): Promise<Map<Id, Person>> {
    if (ctx) return ctx.getPersonMap();
    return createFetchContext().getPersonMap();
}

export function personName(
    personMap: Map<Id, Person>,
    personId: Id,
): string {
    const person = personMap.get(personId);
    if (!person) {
        throw new Error(
            'personName: unknown person '
                + personId,
        );
    }
    return person.fullName();
}
