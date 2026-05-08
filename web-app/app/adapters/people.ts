import type {
    PersonEntity,
} from '../../../api/types.ts';
import { Person } from '../../../api/types.ts';
import type { FetchContext } from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
export {
    Person,
    USER_STATUS_CONFIG,
    isPersonStatus,
} from '../../../api/types.ts';
export type {
    PersonEntity,
    PersonStatus,
} from '../../../api/types.ts';

const personChanges =
    createSubscriptionChannel(['people']);

export function subscribePersonChanges(
    fn: () => void,
): () => void {
    return personChanges.subscribe(fn);
}

export function notifyPersonChange(): void {
    personChanges.notify();
}

const TOP_PEOPLE_COUNT = 6;

export type PersonAccountStatus =
    | 'active'
    | 'pending'
    | 'deactivated';

export async function getPeople(
    ctx: FetchContext,
): Promise<Person[]> {
    const personMap = await ctx.getPersonMap();
    return Array.from(personMap.values());
}

export async function getPersonRows(
    ctx: FetchContext,
): Promise<PersonEntity[]> {
    return ctx.getPersonRows();
}

export function featuredPeople(
    people: Person[],
): Person[] {
    return people
        .filter(person => person.hasDepartment())
        .slice(0, TOP_PEOPLE_COUNT);
}

export async function getPerson(
    ctx: FetchContext,
    id: string,
): Promise<Person> {
    const row = await ctx.GET<PersonEntity>(
        `people/${id}`,
    );
    return new Person(row);
}

export async function getPersonRow(
    ctx: FetchContext,
    id: string,
): Promise<PersonEntity> {
    return ctx.GET<PersonEntity>(
        `people/${id}`,
    );
}

export async function putPerson(
    ctx: FetchContext,
    id: string,
    entity: Omit<PersonEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`people/${id}`, entity);
    personChanges.notify();
}

export async function putPersonStatus(
    ctx: FetchContext,
    id: string,
    next: PersonAccountStatus,
): Promise<void> {
    const rows = await ctx.getPersonRows();
    const row = rows.find(r => r.id === id);
    if (!row) {
        throw new Error(
            `putPersonStatus: unknown person ${id}`,
        );
    }
    const { id: _id, ...rest } = row;
    await ctx.PUT(`people/${id}`, {
        ...rest,
        status: next,
    });
    personChanges.notify();
}
