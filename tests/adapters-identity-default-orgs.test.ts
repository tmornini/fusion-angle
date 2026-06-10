import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { TABLE_NAMES } from '../api/db.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';

const AT = '2026-06-04T00:00:00.000000Z';

test('TABLE_NAMES includes identity_default_orgs', () => {
    assert.ok(
        TABLE_NAMES.includes('identity_default_orgs'),
        'TABLE_NAMES missing identity_default_orgs',
    );
});

test(
    'MemoryDbAdapter stores and returns a default-org event',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await db.identityDefaultOrgs.put('d1', {
            identity_id: 'i1',
            organization_id: '1',
            at: AT,
        });
        const all = await db.identityDefaultOrgs.getAll();
        assert.equal(all.length, 1);
        assert.equal(all[0]!.id, 'd1');
        assert.equal(all[0]!.identity_id, 'i1');
        assert.equal(all[0]!.organization_id, '1');
        assert.equal(all[0]!.at, AT);
    },
);
