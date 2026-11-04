import {
    assert,
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import type { DbAdapter } from '../api/db.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    getInvitationOnOrganizationNest,
    getOrganizationInvitations,
} from '../api/invitations-domain.ts';
import { MEMBERSHIPS_PATH } from '../api/memberships.ts';
import { PII_DOCUMENT_NAME } from '../api/message-pair.ts';
import type { Reader } from '../api/served-response.ts';
import type { MessagePairEntity } from '../shared/types.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

// Organization invitation reads take each seat's PII
// history inside the seat transaction, then validate
// after that transaction returns.
const WAYNE = 'BBjWJsjYIDkTRKIIPrzWRw';
const SARAH = 'toccYYkLEABmlbpHJalgtQ';
const NAME = membershipNameOf(WAYNE, SARAH);

interface Boundary {
    open: number;
    generation: number;
    seatReads: number[];
    piiReads: number[];
    bodyReads: number[];
}

function boundary(): Boundary {
    return {
        open: 0,
        generation: 0,
        seatReads: [],
        piiReads: [],
        bodyReads: [],
    };
}

function watchPairs(
    pairs: DbAdapter['messagePairs'],
    note: Boundary,
): DbAdapter['messagePairs'] {
    return new Proxy(pairs, {
        get(target, prop, receiver) {
            if (prop === 'getDocumentHistory') {
                return async (
                    path: string,
                    name: string,
                ): Promise<MessagePairEntity[]> => {
                    if (name === PII_DOCUMENT_NAME) {
                        note.piiReads.push(note.open);
                    }
                    const rows = await target
                        .getDocumentHistory(path, name);
                    if (name !== PII_DOCUMENT_NAME) {
                        return rows;
                    }
                    return rows.map((row) => new Proxy(row, {
                        get(rowTarget, rowProp, rowRecv) {
                            if (rowProp === 'response') {
                                note.bodyReads.push(note.open);
                            }
                            return Reflect.get(
                                rowTarget, rowProp, rowRecv,
                            );
                        },
                    }));
                };
            }
            if (prop === 'getCollectionHeadPairsContaining') {
                return (
                    path: string,
                    contains: Readonly<Record<string, string>>,
                ) => {
                    if (path === MEMBERSHIPS_PATH) {
                        note.seatReads.push(note.open);
                    }
                    return target
                        .getCollectionHeadPairsContaining(
                            path, contains,
                        );
                };
            }
            if (prop === 'getHeadPair') {
                return (path: string, name: string) => {
                    if (path === MEMBERSHIPS_PATH) {
                        note.seatReads.push(note.open);
                    }
                    return target.getHeadPair(path, name);
                };
            }
            const value = Reflect.get(
                target, prop, receiver,
            );
            return typeof value === 'function'
                ? value.bind(target)
                : value;
        },
    });
}

function watchAdapter(
    inner: DbAdapter,
    note: Boundary,
    track: boolean,
): DbAdapter {
    return new Proxy(inner, {
        get(target, prop, receiver) {
            if (prop === 'readTransaction') {
                return function readTransaction<R>(
                    fn: (view: DbAdapter) => Promise<R>,
                ): Promise<R> {
                    const run = (view: DbAdapter) =>
                        fn(watchAdapter(view, note, false));
                    if (!track) {
                        return target.readTransaction(run);
                    }
                    const mine = ++note.generation;
                    note.open = mine;
                    return Promise.resolve(
                        target.readTransaction(run),
                    ).finally(() => {
                        if (note.open === mine) {
                            note.open = 0;
                        }
                    });
                };
            }
            if (prop === 'messagePairs') {
                return watchPairs(
                    target.messagePairs, note,
                );
            }
            const value = Reflect.get(
                target, prop, receiver,
            );
            return typeof value === 'function'
                ? value.bind(target)
                : value;
        },
    });
}

function assertOutside(note: Boundary): void {
    assert(note.seatReads.length > 0);
    assert(note.piiReads.length > 0);
    const seat = note.seatReads[0];
    assert(seat !== undefined && seat !== 0);
    for (const open of note.seatReads) {
        assertStrictEquals(open, seat);
    }
    for (const open of note.piiReads) {
        assertStrictEquals(open, seat);
    }
    assert(note.bodyReads.length > 0);
    for (const open of note.bodyReads) {
        assertStrictEquals(open, 0);
    }
    note.seatReads.length = 0;
    note.piiReads.length = 0;
    note.bodyReads.length = 0;
}

function assertJoined(reader: Reader): void {
    assertStrictEquals(reader.sees, 'joined');
    if (reader.sees !== 'joined') return;
    assertEquals(reader.joined.get(NAME), {
        identity_kind: 'person',
        invitee_name: 'Sarah',
        invitee_email: 'sarah@x.com',
    });
}

Deno.test(
    'organization invitation reads validate PII'
        + ' outside the seat transaction',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await seedPersonIdentity(db, SARAH, {
            name: 'Sarah',
            email: 'sarah@x.com',
            phone: '',
            bio: '',
        });
        await seedSeat(db, WAYNE, SARAH, 'member');
        const note = boundary();
        const watched = watchAdapter(db, note, true);
        const listed = await getOrganizationInvitations(
            watched, [WAYNE], SARAH, WAYNE, ['admin'],
        );
        assertOutside(note);
        assertStrictEquals(listed.kind, 'collection');
        if (listed.kind !== 'collection') return;
        assertJoined(listed.reader);
        const one = await getInvitationOnOrganizationNest(
            watched,
            [WAYNE, NAME],
            SARAH,
            WAYNE,
            ['admin'],
        );
        assertOutside(note);
        assertStrictEquals(one.kind, 'document');
        if (one.kind !== 'document') return;
        assertJoined(one.reader);
    },
);
