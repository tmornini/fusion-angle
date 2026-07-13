import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, PUT } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import type { MemberEntity } from '../api/types.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';

// Actor-stamping for lifecycle rides document trios —
// PUT members/:id stamps requester_identity_id on the
// pair, derived as member_id on GET members/:id/history.
// Member lifecycle via PUT members/:id — the document
// trio is authored by the verified token.
test(
    'a member state change is authored by the token',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo');
        await PUT(db, 'members/current', {
            type: 'human',
            state: 'archived',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-1',
        }, DEV_TOKEN);
        const history = await GET<Array<{
            id: string;
            member_id: string;
        }>>(
            db, 'members/current/history', DEV_TOKEN,
        );
        const event = history.find(e => e.id === 'ev-1');
        assert.ok(event, 'trio event missing from history');
        assert.equal(event!.member_id, 'current');
    },
);

// current-member resolves the CALLER, derived from the token —
// not a hardcoded 'current' id. A token for a different member
// returns that member.
test(
    'current-member resolves the token member',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        await seedHumanMember(db, 'alice', 'Alice');
        await seedOrganizationMember(db, 'alice');
        const member = await GET<MemberEntity>(
            db, 'current-member', await devToken('alice'),
        );
        assert.equal(member.id, 'alice');
    },
);
