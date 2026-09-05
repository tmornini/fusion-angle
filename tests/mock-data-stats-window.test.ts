import { assert } from '@std/assert';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import { getFlowStats } from
    '../web-app/app/adapters/flow-stats.ts';
import { deriveFlows } from '../api/derive-flows.ts';
import { seededMockDb } from './mock-seed.ts';

const FLOW_NAME = 'Customer Onboarding';

// Measured: a seed clock 120 days behind Date.now() leaves
// only in-flight visits (Data Capture 4, Review 2).
const IN_FLIGHT_ONLY_VISITS = 6;

// The seed follows the calendar: whatever day it is seeded,
// Customer Onboarding's closed sojourns fall inside the
// ninety-day stats window measured from the wall clock. A
// fixed anchor clips every one of them to zero ninety days
// on — the 2026-09-13 cliff this pin retires for good.
Deno.test(
    'the seeded Customer Onboarding flow has completed work'
    + ' inside the live stats window',
    async () => {
        const db = await seededMockDb();
        const flow = (
            await deriveFlows(db, 'AjdvjuECVZEgZoFajaIEkg')
        ).find(f => f.name === FLOW_NAME);
        assert(flow !== undefined, FLOW_NAME + ' not seeded');
        const ctx = createRequestContext(
            db, await organizationToken(),
        );
        const { model } = await getFlowStats(
            ctx, flow.id, Date.now(),
        );
        const visitsInWindow = model.nodes.reduce(
            (sum, node) => sum + node.visitsInWindow, 0,
        );
        assert(
            visitsInWindow > IN_FLIGHT_ONLY_VISITS,
            'no completed sojourn heat inside the window',
        );
    },
);
