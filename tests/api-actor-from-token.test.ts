import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, PUT } from '../api/api.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import type { MemberEntity } from '../api/types.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { seedOrgMember } from './root-admin-fixture.ts';

// The author of a state event is the verified token: a body
// that names a member_id is malformed and rejected.
test(
    'a state event body may not name its author',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await assert.rejects(
            () => PUT(db, 'states/ev-forge', {
                entity_id: 'current',
                state: 'active',
                member_id: 'forged',
                at: '2026-01-01T00:00:00.000000Z',
            }, DEV_TOKEN),
        );
    },
);

// With no member_id in the body, the ledger records the
// verified caller as the author.
test(
    'a state event is authored by the token',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await PUT(db, 'states/ev-1', {
            entity_id: 'current',
            state: 'active',
            at: '2026-01-01T00:00:00.000000Z',
        }, DEV_TOKEN);
        const event = await db.states.getById('ev-1');
        assert.equal(event.member_id, 'current');
    },
);

// current-member resolves the CALLER, derived from the token —
// not a hardcoded 'current' id. A token for a different member
// returns that member.
test(
    'current-member resolves the token member',
    async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        await seedHumanMember(db, 'alice', 'Alice');
        await seedOrgMember(db, 'alice');
        const member = await GET<MemberEntity>(
            db, 'current-member', await devToken('alice'),
        );
        assert.equal(member.id, 'alice');
    },
);
