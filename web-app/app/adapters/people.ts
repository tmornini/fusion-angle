import type {
    Id,
    PersonEntity,
} from '../../../api/types.ts';
import { Person } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
export {
    Person,
    USER_STATUS_CONFIG,
    isPersonStatus,
} from '../../../api/types.ts';
export type {
    Id,
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

export async function getPersonRows(
    ctx: RequestContext,
): Promise<PersonEntity[]> {
    return ctx.GET<PersonEntity[]>('people');
}

export async function getPersonMap(
    ctx: RequestContext,
): Promise<Map<Id, Person>> {
    const rows = await getPersonRows(ctx);
    return new Map(
        rows.map(
            entity => [entity.id, new Person(entity)],
        ),
    );
}

export async function getCurrentPerson(
    ctx: RequestContext,
): Promise<PersonEntity> {
    return ctx.GET<PersonEntity>('current-person');
}

export function personName(
    personMap: Map<Id, Person>,
    personId: Id,
): string {
    const person = personMap.get(personId);
    if (!person) {
        throw new Error(
            'personName: unknown person ' + personId,
        );
    }
    return person.fullName();
}

const TOP_PEOPLE_COUNT = 6;

export type PersonAccountStatus =
    | 'active'
    | 'pending'
    | 'deactivated';

export async function getPeople(
    ctx: RequestContext,
): Promise<Person[]> {
    const personMap = await getPersonMap(ctx);
    return Array.from(personMap.values());
}

export function featuredPeople(
    people: Person[],
): Person[] {
    return people
        .filter(person => person.hasDepartment())
        .slice(0, TOP_PEOPLE_COUNT);
}

export async function getPerson(
    ctx: RequestContext,
    id: string,
): Promise<Person> {
    const row = await ctx.GET<PersonEntity>(
        `people/${id}`,
    );
    return new Person(row);
}

export async function getPersonRow(
    ctx: RequestContext,
    id: string,
): Promise<PersonEntity> {
    return ctx.GET<PersonEntity>(
        `people/${id}`,
    );
}

export async function putPerson(
    ctx: RequestContext,
    id: string,
    entity: Omit<PersonEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`people/${id}`, entity);
    personChanges.notify();
}

export async function putPersonStatus(
    ctx: RequestContext,
    id: string,
    next: PersonAccountStatus,
): Promise<void> {
    const rows = await getPersonRows(ctx);
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
