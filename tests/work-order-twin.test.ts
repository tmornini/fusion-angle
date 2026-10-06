import { assertEquals, assertStrictEquals } from
    '@std/assert';
import { toWorkOrder } from
    '../client/work-orders-queries.ts';
import { responseMessage } from
    './fixtures/response-message.ts';
import type { WorkOrderEntity } from '../shared/types.ts';

const AT = '2026-10-01T09:00:00.000000Z';

function entity(): WorkOrderEntity {
    return {
        id: 'xqcXYHXBJJXcLkRYkRngKA',
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        display_id: 'WO-1',
        flow_graph: {
            name: 'g', lockTimeout: 300, nodes: [], edges: [],
        },
        position: 1,
        state: 'KWpWgeKhKyoyBDEymUgcmg',
        transition: {
            member_id: 'MQFcPtrZPIGjMCRAXtZUnA', at: AT,
        },
        events: [],
    };
}

Deno.test('the twin names its node and the move into it',
() => {
    const twin = toWorkOrder(responseMessage(entity()));
    assertStrictEquals(twin.nodeId, 'KWpWgeKhKyoyBDEymUgcmg');
    assertEquals(twin.transition, {
        memberId: 'MQFcPtrZPIGjMCRAXtZUnA', at: AT,
    });
});

Deno.test('an absent claim is unclaimed', () => {
    assertEquals(
        toWorkOrder(responseMessage(entity())).claim,
        { state: 'unclaimed' },
    );
});

Deno.test('a stored claim is claimed, in camelCase', () => {
    const twin = toWorkOrder(responseMessage({
        ...entity(),
        claim: {
            member_id: 'XXZruirZyAOoRpNxaDnpSA',
            at: AT,
            expires_at: '2026-10-01T09:05:00.000000Z',
        },
    }));
    assertEquals(twin.claim, {
        state: 'claimed',
        memberId: 'XXZruirZyAOoRpNxaDnpSA',
        at: AT,
        expiresAt: '2026-10-01T09:05:00.000000Z',
    });
});
