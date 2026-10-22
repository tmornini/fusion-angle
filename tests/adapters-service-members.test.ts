import {
    assertEquals,
    assertMatch,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { recordedContext } from './in-page-facade.ts';
import { adminContext } from './context-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    postServiceMemberCreation,
    getServiceMember,
    getServiceMemberEntity,
    putServiceMember,
} from '../client/service-members.ts';
import { getMembers } from '../client/members-union.ts';
import type { MembershipEntity } from '../shared/types.ts';
import {
    RequestError,
    HTTP_CONFLICT,
} from '../shared/http-errors.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const STARK = 'AjdvjuECVZEgZoFajaIEkg';

// The Office of Time: RFC-3339 zulu at the fullest
// resolution the environment provides — six digits here.
const ZULU_6 =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

const CI_BOT = { name: 'CI bot', description: 'Builds' };

Deno.test(
    'postServiceMemberCreation posts the memberships'
    + ' statement',
    async () => {
        const { db } = await adminContext();
        const { ctx, sent } = recordedContext(
            db, await organizationToken(),
        );
        const id = generateIdentifier();

        await postServiceMemberCreation(ctx, id, CI_BOT);

        const writes = sent.filter((request) =>
            request.method !== 'GET'
        );
        assertStrictEquals(writes.length, 1);
        const wrote = writes[0]!;
        assertStrictEquals(wrote.method, 'POST');
        assertStrictEquals(
            wrote.path,
            '/api/organizations/' + STARK + '/memberships/',
        );
        assertStrictEquals(wrote.ifMatch, null);
        assertStrictEquals(wrote.ifNoneMatch, null);
        const body = JSON.parse(wrote.body ?? 'null');
        const at = body.membership.at;
        assertMatch(at, ZULU_6);
        assertEquals(body, {
            id,
            kind: 'service',
            membership: { type: 'member', at },
            service: { name: 'CI bot', description: 'Builds' },
        });
    },
);

Deno.test(
    'a second postServiceMemberCreation of one id is 409',
    async () => {
        const { ctx } = await adminContext();
        const id = generateIdentifier();
        await postServiceMemberCreation(ctx, id, CI_BOT);

        const err = await assertRejects(
            () => postServiceMemberCreation(ctx, id, CI_BOT),
            RequestError,
        );

        assertStrictEquals(err.status, HTTP_CONFLICT);
        const accepted = await ctx.GETCollection<
            MembershipEntity
        >(
            'organizations/' + STARK
                + '/memberships/?state=accepted',
        );
        const mine = accepted.filter((part) =>
            part.body().toValue().identity_id === id
        );
        assertStrictEquals(mine.length, 1);
    },
);

Deno.test(
    'getServiceMember reads the document and its membership',
    async () => {
        const { ctx } = await adminContext();
        const id = generateIdentifier();
        await postServiceMemberCreation(ctx, id, CI_BOT);

        const member = await getServiceMember(ctx, id);

        assertStrictEquals(member.kind, 'service');
        assertStrictEquals(member.nameText(), 'CI bot');
        assertStrictEquals(member.descriptionText(), 'Builds');
        assertStrictEquals(
            member.membership.body().toValue().state,
            'accepted',
        );
    },
);

Deno.test(
    'getMembers lists a service member as a service',
    async () => {
        const { ctx } = await adminContext();
        const id = generateIdentifier();
        await postServiceMemberCreation(ctx, id, CI_BOT);

        const members = await getMembers(ctx);

        const kinds = members.map((member) =>
            [member.kind, member.idForLink()]
        );
        assertEquals(
            kinds.filter(([kind]) => kind === 'service'),
            [['service', id]],
        );
    },
);

Deno.test(
    'a service member save latches its read and answers'
    + ' the new head',
    async () => {
        const { db } = await adminContext();
        const { ctx, sent } = recordedContext(
            db, await organizationToken(),
        );
        const id = generateIdentifier();
        await postServiceMemberCreation(ctx, id, CI_BOT);
        const held = await getServiceMemberEntity(ctx, id);
        sent.length = 0;

        const saved = await putServiceMember(ctx, held, {
            name: 'CI bot',
            description: 'Builds v2',
        });

        const writes = sent.filter((request) =>
            request.method !== 'GET'
        );
        assertEquals(
            writes.map((r) => [r.method, r.path, r.ifMatch]),
            [[
                'PUT',
                '/api/organizations/' + STARK + '/services/'
                    + id,
                held.query('header.etag').toText(),
            ]],
        );
        assertEquals(saved.body().toValue(), {
            id,
            name: 'CI bot',
            description: 'Builds v2',
        });
    },
);
