import type {
    WorkOrderEntity,
    FlowWorkOrderEntity,
    StateEntity,
} from '../types.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../types.ts';
import { daysFromNow } from './seed-kit.ts';
import { buildFlows } from './flows.ts';

// The seeded work orders, their flow-work-order joins, and
// their state-event history — moved verbatim out of
// postMockDataLoadIn (mock-data.ts) so this file's pass-1
// invocation list (seed-message-pairs.ts) and that file's
// pass-2 writes share ONE declaration apiece, mirroring the
// ideas.ts / flows.ts / records.ts hoist idiom. Fixed data;
// the composition root assigns organization_id at write time.
// woFlowGraph/prcFlowGraph read the live Customer Onboarding /
// Layout Test flow graphs off a local buildFlows() call — a
// second, provably identical call to the same pure builder
// mock-data.ts and seed-message-pairs.ts each already make of
// their own, so every seeded work-order snapshot matches the
// live flow_graph shape without a shared mutable reference.
const mockFlows = buildFlows();

const woId =
    'xqcXYHXBJJXcLkRYkRngKA';
const woFlowGraph =
    mockFlows[0]!.graph;
const woCreated = daysFromNow(-14, 10, 0);
const woNodeNew =
    'laXQcGGyWrbEiExtgkyCcw';
const woNodeCapture =
    'KWpWgeKhKyoyBDEymUgcmg';
const woNodeReview =
    'xmghdGZDgLKilxByetrBoA';
const woNodeComplete =
    'DkyhupXfDAcrWBojIzHlRQ';
const woPersonSarah =
    'MQFcPtrZPIGjMCRAXtZUnA';
const woPersonEmily =
    'CJrglMsNBxOWWfbihHQSeg';
// Data Capture node members: Marcus and the
// current user (the in-clan members)
const woPersonMarcus =
    'SsVAZghfSzMZRZmxNKIizw';
const woPersonCurrent = 'XXZruirZyAOoRpNxaDnpSA';
// Read once so every seeded WO snapshot matches
// the live flow_graph shape without redundant
// walks of the native flow graph object.
const woGraphParsed = woFlowGraph as {
    nodes: unknown; edges: unknown;
};
function woGraph(): Record<string, unknown> {
    return {
        name:
            'Customer Onboarding',
        lockTimeout:
            DEFAULT_LOCK_TIMEOUT,
        nodes: woGraphParsed.nodes,
        edges: woGraphParsed.edges,
    };
}

// Read once so all prc WO snapshots match the
// live flow_graph shape.
const prcFlowGraph =
    mockFlows[2]!.graph;
const prcGraphParsed = prcFlowGraph as {
    nodes: unknown; edges: unknown;
};
function prcGraph(): Record<string, unknown> {
    return {
        name:
            'Layout Test: Proposal'
            + ' Review Cycle',
        lockTimeout:
            DEFAULT_LOCK_TIMEOUT,
        nodes: prcGraphParsed.nodes,
        edges: prcGraphParsed.edges,
    };
}

const prcNodeStart =
    'rLwBHMzOGoGQzUcRgYwSMQ';
const prcNodeDraft =
    'MelwPladvnAMEuMwjUiRfg';
const prcNodeSubmit =
    'RCkRIKgSrRXeLFJFIIEWvw';
const prcNodeTriage =
    'ODtydttdBiCPLFyxqvJsSg';
const prcNodeQuickRev =
    'NlcdFRgrFGDkHirNJrjVXw';
const prcNodeDecision =
    'rTMOibpdwsbFUfauowfyPg';
const prcNodeApproved =
    'CHekPYKmopdmcKTuHxquaw';
const prcNodeRevise =
    'DyyunbBYDwJxrTOhvRhYYw';
const prcNodeArchive =
    'EaERqxsxebTdSPoZvihWjg';

export function buildWorkOrders():
    Omit<WorkOrderEntity, 'organization_id'>[] {
    return [
        {
            id: woId,
            display_id: 'a7c3e1f9',
            flow_graph: {
                name:
                    'Customer Onboarding',
                lockTimeout:
                    DEFAULT_LOCK_TIMEOUT,
                nodes: woGraphParsed.nodes,
                edges: woGraphParsed.edges,
            },
            position: 1,
        },
        // ── happy-path runs (WO02-WO23) ──────────
        // Create → Data Capture → Review → Archive.
        // Sojourn in Data Capture varies 1–9 days
        // with a fat right tail so Data Capture is
        // the hot node in heat stats.
        {
            id: 'krzCXtfVNOLvbGcYnSrhng',
            display_id: 'b2d4f6a8',
            flow_graph: woGraph(),
            position: 2,
        },
        {
            id: 'uxTjfwTdFboxQRRfLQBfjA',
            display_id: 'c3e5g7b9',
            flow_graph: woGraph(),
            position: 3,
        },
        {
            id: 'JwjCJbRVYCGojtDDMbFISw',
            display_id: 'd4f6h8c0',
            flow_graph: woGraph(),
            position: 4,
        },
        {
            id: 'VdkdxziHStBwGlqXMplgzg',
            display_id: 'e5g7i9d1',
            flow_graph: woGraph(),
            position: 5,
        },
        {
            id: 'SEHtXAFBwzspwfqzUgLOGg',
            display_id: 'f6h8j0e2',
            flow_graph: woGraph(),
            position: 6,
        },
        {
            id: 'EXifLeJkIZYAFlniPDbnyw',
            display_id: 'g7i9k1f3',
            flow_graph: woGraph(),
            position: 7,
        },
        {
            id: 'XNCcLuvJJIMafjqfDQcysA',
            display_id: 'h8j0l2g4',
            flow_graph: woGraph(),
            position: 8,
        },
        {
            id: 'kuHSbxoxnsegYoJpuziaIA',
            display_id: 'i9k1m3h5',
            flow_graph: woGraph(),
            position: 9,
        },
        {
            id: 'ZIKwhTVQUmZbzpUElPynGg',
            display_id: 'j0l2n4i6',
            flow_graph: woGraph(),
            position: 10,
        },
        {
            id: 'eGKKhdvQWwAgjMJCmOiWsg',
            display_id: 'k1m3o5j7',
            flow_graph: woGraph(),
            position: 11,
        },
        {
            id: 'kwfRAQskBMDhxupBJSXBXg',
            display_id: 'l2n4p6k8',
            flow_graph: woGraph(),
            position: 12,
        },
        {
            id: 'FPRJDMIESNrhvDpngiVgAA',
            display_id: 'm3o5q7l9',
            flow_graph: woGraph(),
            position: 13,
        },
        {
            id: 'HEEYmJQUuZTwpwZwEvDHIA',
            display_id: 'n4p6r8m0',
            flow_graph: woGraph(),
            position: 14,
        },
        {
            id: 'AgBUgTINNElBAvqwWMUegw',
            display_id: 'o5q7s9n1',
            flow_graph: woGraph(),
            position: 15,
        },
        {
            id: 'SwOSfDtxXEdmGGuHaNzXAQ',
            display_id: 'p6r8t0o2',
            flow_graph: woGraph(),
            position: 16,
        },
        {
            id: 'swamOcwhrDmLKzRKlqunFw',
            display_id: 'q7s9u1p3',
            flow_graph: woGraph(),
            position: 17,
        },
        {
            id: 'TRzdRYgxAuHFJsJxdGtngw',
            display_id: 'r8t0v2q4',
            flow_graph: woGraph(),
            position: 18,
        },
        {
            id: 'QfOuwFUXrsWqHFnJgTSDCg',
            display_id: 's9u1w3r5',
            flow_graph: woGraph(),
            position: 19,
        },
        {
            id: 'GJyTGedIrFfonBxkniEylA',
            display_id: 't0v2x4s6',
            flow_graph: woGraph(),
            position: 20,
        },
        {
            id: 'BqOPvRjANCSRrdRwRGbyUw',
            display_id: 'u1w3y5t7',
            flow_graph: woGraph(),
            position: 21,
        },
        {
            id: 'UegjcqnhNlWGJMWYjRMgCQ',
            display_id: 'v2x4z6u8',
            flow_graph: woGraph(),
            position: 22,
        },
        {
            id: 'QtuoBiqabeXfgMIMUgMUaQ',
            display_id: 'w3y5a7v9',
            flow_graph: woGraph(),
            position: 23,
        },
        // ── needs-revision loops (WO24-WO29) ─────
        // … → Data Capture → Review → Data Capture
        // → Review → Archive. Exercises revisit
        // rate and the Review→Capture branch split.
        {
            id: 'NQLhTgeebJflEfLNiIKRbw',
            display_id: 'x4z6b8w0',
            flow_graph: woGraph(),
            position: 24,
        },
        {
            id: 'FEDdQbmpanDFVZdPnUbwWg',
            display_id: 'y5a7c9x1',
            flow_graph: woGraph(),
            position: 25,
        },
        {
            id: 'OAvDqHdtlzUeHVxrxlcFgg',
            display_id: 'z6b8d0y2',
            flow_graph: woGraph(),
            position: 26,
        },
        {
            id: 'yuPIkpaXrJNwIzfKMytkfg',
            display_id: 'a7c9e1z3',
            flow_graph: woGraph(),
            position: 27,
        },
        {
            id: 'xiekvzKePoUXMiQlySGHag',
            display_id: 'b8d0f2a4',
            flow_graph: woGraph(),
            position: 28,
        },
        {
            id: 'BRDKCttpdvJSFqPxmPEAxg',
            display_id: 'c9e1g3b5',
            flow_graph: woGraph(),
            position: 29,
        },
        // in-flight runs (WO30-WO34):
        // Last transition lands in Data Capture or
        // Review with no Archive; exercises WIP and
        // incompleteWorkOrderCount.
        {
            id: 'gButmqAicxcpsNuiTYQNKA',
            display_id: 'd0f2h4c6',
            flow_graph: woGraph(),
            position: 30,
        },
        {
            id: 'AbRcGuaSMFbUfPAexnegfw',
            display_id: 'e1g3i5d7',
            flow_graph: woGraph(),
            position: 31,
        },
        {
            id: 'nTIlwHvYCLLpcgDPpZfJsw',
            display_id: 'f2h4j6e8',
            flow_graph: woGraph(),
            position: 32,
        },
        {
            id: 'HxoTWjMKYqZWVZZGzxYjXA',
            display_id: 'g3i5k7f9',
            flow_graph: woGraph(),
            position: 33,
        },
        {
            id: 'qMXousWjIHczNUwqWDGsXg',
            display_id: 'h4j6l8g0',
            flow_graph: woGraph(),
            position: 34,
        },
        // ── out-of-clan runs (WO35-WO36) ─────────
        // OUT-transition from Data Capture is by
        // Sarah or Mike — neither is among that
        // node's members, so topProducer.inCurrentClan
        // is false.
        {
            id: 'JSKYLSrCcNBvfdHXrPNOWw',
            display_id: 'i5k7m9h1',
            flow_graph: woGraph(),
            position: 35,
        },
        {
            id: 'zvwXWNSafFwBskEQVfnfaw',
            display_id: 'j6l8n0i2',
            flow_graph: woGraph(),
            position: 36,
        },
        // old runs (WO37-WO38):
        // Created ~105 days ago, outside the
        // trailing-90-day stats window — so heat
        // values for their node visits are clipped.
        {
            id: 'DELkFWgEyhoqyuyrbnQuEA',
            display_id: 'k7m9o1j3',
            flow_graph: woGraph(),
            position: 37,
        },
        {
            id: 'GybPgWucvmsPHNwjNAyOiw',
            display_id: 'l8n0p2k4',
            flow_graph: woGraph(),
            position: 38,
        },
        // Proposal Review Cycle (prc01-prc06):
        // second flow demo -- 4 happy-path, 1
        // revisit, 1 in-flight.
        {
            id: 'fCGVSSzsRHDgDLvPXbYkDw',
            display_id: 'CVEXKOCDSjDmnTqpSknTuw',
            flow_graph: prcGraph(),
            position: 39,
        },
        {
            id: 'MMbQqbhcKfHVHWhnsjIqnA',
            display_id: 'ULfkJZlbqdHVlWfVLUijog',
            flow_graph: prcGraph(),
            position: 40,
        },
        {
            id: 'oqpwipJxpRbKzypGkStjjw',
            display_id: 'JMmkmIRZgKoymnSUsSjnYg',
            flow_graph: prcGraph(),
            position: 41,
        },
        {
            id: 'TMRENIJdzgBtLiMyuxUkNg',
            display_id: 'BUFsyZgBRCNYqZRollYBIw',
            flow_graph: prcGraph(),
            position: 42,
        },
        // prc05: revisit -- Decision sends back
        // to Revise then Draft before completing.
        {
            id: 'zOSyhzfDZMJDhZPsOvFwRg',
            display_id: 'vMvcjAuxIBaZnmGoaRwCrg',
            flow_graph: prcGraph(),
            position: 43,
        },
        // prc06: in-flight -- stuck at Decision.
        {
            id: 'FCEBEWzmelSFTOlqcZsbdQ',
            display_id: 'RPrxMUsXnqqYTxKaHAKdOg',
            flow_graph: prcGraph(),
            position: 44,
        },
        // Gate violation case: sits at Data Capture
        // with no values captured. Leaving Capture
        // (submit → Review) trips the property-test
        // gate on Company Name + Contact Email (both
        // Required on the CURRENT node, both null) —
        // the fillable browser-testing case (R13/R14).
        {
            id: 'eOlNZpGQfmCdpSFWXGkzFQ',
            display_id: 'gate0001',
            flow_graph: woGraph(),
            position: 45,
        },
    ];
}

export function buildFlowWorkOrderJoins():
    FlowWorkOrderEntity[] {
    return [
        {
            id: 'FgmTGuWPpgNQxeUvjYBjZA',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id: woId,
            at: woCreated,
        },
        // happy-path
        {
            id: 'lClkJuwXjBuuPHzdpxwSiA',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'krzCXtfVNOLvbGcYnSrhng',
            at: daysFromNow(-88, 9, 0),
        },
        {
            id: 'HPVDhAWMQrIhjSRKxuExpg',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'uxTjfwTdFboxQRRfLQBfjA',
            at: daysFromNow(-82, 10, 0),
        },
        {
            id: 'xIVUUcUaDfTsDpuLIZgTGQ',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'JwjCJbRVYCGojtDDMbFISw',
            at: daysFromNow(-76, 8, 30),
        },
        {
            id: 'fToUGwGKwMApahWvZBXbKw',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'VdkdxziHStBwGlqXMplgzg',
            at: daysFromNow(-71, 9, 0),
        },
        {
            id: 'RnplPuxMfADIpOKCKjHfeA',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'SEHtXAFBwzspwfqzUgLOGg',
            at: daysFromNow(-66, 11, 0),
        },
        {
            id: 'JSVFXhBcjTwteiveLhtUVQ',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'EXifLeJkIZYAFlniPDbnyw',
            at: daysFromNow(-61, 9, 30),
        },
        {
            id: 'oEOCeKNKAMdrXYiqJxzXPw',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'XNCcLuvJJIMafjqfDQcysA',
            at: daysFromNow(-57, 8, 0),
        },
        {
            id: 'NwARrtRfrfezzUDikJTHWg',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'kuHSbxoxnsegYoJpuziaIA',
            at: daysFromNow(-52, 10, 0),
        },
        {
            id: 'wVsjXhLvLnKSzWAkkwRaLg',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'ZIKwhTVQUmZbzpUElPynGg',
            at: daysFromNow(-48, 9, 0),
        },
        {
            id: 'HSHPhFFgEboGEDMdceaApA',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'eGKKhdvQWwAgjMJCmOiWsg',
            at: daysFromNow(-44, 10, 30),
        },
        {
            id: 'CNigXTPkAKmTXkOdXsuwaw',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'kwfRAQskBMDhxupBJSXBXg',
            at: daysFromNow(-40, 9, 0),
        },
        {
            id: 'vJQxpNbbjeBuDrYrtbwdwA',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'FPRJDMIESNrhvDpngiVgAA',
            at: daysFromNow(-37, 8, 0),
        },
        {
            id: 'QQnXpdfCDtMRHNhSAZEOOQ',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'HEEYmJQUuZTwpwZwEvDHIA',
            at: daysFromNow(-33, 9, 30),
        },
        {
            id: 'tBzQNLjCJDUHIJABTDTldQ',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'AgBUgTINNElBAvqwWMUegw',
            at: daysFromNow(-29, 10, 0),
        },
        {
            id: 'JEnNYzzgANXnVwrHDqZbhw',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'SwOSfDtxXEdmGGuHaNzXAQ',
            at: daysFromNow(-26, 9, 0),
        },
        {
            id: 'WevUhSVPchrwVdWsRPdRJw',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'swamOcwhrDmLKzRKlqunFw',
            at: daysFromNow(-23, 8, 30),
        },
        {
            id: 'IsIdkcItauPhDQBggaYspQ',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'TRzdRYgxAuHFJsJxdGtngw',
            at: daysFromNow(-20, 10, 0),
        },
        {
            id: 'zHqvuDqtYpXxKxzgazTidg',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'QfOuwFUXrsWqHFnJgTSDCg',
            at: daysFromNow(-17, 9, 0),
        },
        {
            id: 'FVwztFeffcPEAJjVefVccA',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'GJyTGedIrFfonBxkniEylA',
            at: daysFromNow(-14, 8, 0),
        },
        {
            id: 'ecvGkvQUzvKbfrUaLvGDzA',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'BqOPvRjANCSRrdRwRGbyUw',
            at: daysFromNow(-11, 10, 30),
        },
        {
            id: 'QACKgBkYKXEWUSrgcEZCVw',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'UegjcqnhNlWGJMWYjRMgCQ',
            at: daysFromNow(-9, 9, 0),
        },
        {
            id: 'fmWjVMGyeJOgNgzEKuelIg',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'QtuoBiqabeXfgMIMUgMUaQ',
            at: daysFromNow(-6, 11, 0),
        },
        // needs-revision
        {
            id: 'EPEpHkhBlDpiRzubFJiQMw',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'NQLhTgeebJflEfLNiIKRbw',
            at: daysFromNow(-77, 9, 0),
        },
        {
            id: 'xmUaSYugtrqUaSgiukFmyw',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'FEDdQbmpanDFVZdPnUbwWg',
            at: daysFromNow(-63, 10, 0),
        },
        {
            id: 'OJfaPOTlVnyZjgSGvzsrrA',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'OAvDqHdtlzUeHVxrxlcFgg',
            at: daysFromNow(-50, 8, 30),
        },
        {
            id: 'esNlTnkIkfOZNVsGkyxwPg',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'yuPIkpaXrJNwIzfKMytkfg',
            at: daysFromNow(-38, 9, 0),
        },
        {
            id: 'lRrctoxUlJmYWCsMIvbNgA',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'xiekvzKePoUXMiQlySGHag',
            at: daysFromNow(-25, 10, 0),
        },
        {
            id: 'RZAWBBdEVxRLHOocJIxBDQ',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'BRDKCttpdvJSFqPxmPEAxg',
            at: daysFromNow(-12, 9, 30),
        },
        // in-flight
        {
            id: 'RWdoyBCbuSGdzNkckZlpzw',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'gButmqAicxcpsNuiTYQNKA',
            at: daysFromNow(-18, 9, 0),
        },
        {
            id: 'xCoZbEUSzQHKCtbrdMtQoQ',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'AbRcGuaSMFbUfPAexnegfw',
            at: daysFromNow(-10, 10, 0),
        },
        {
            id: 'ToooJrtSNmsHBjxZZfXpHA',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'nTIlwHvYCLLpcgDPpZfJsw',
            at: daysFromNow(-7, 8, 0),
        },
        {
            id: 'CMXemoQkTKFPukHXFGTEbg',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'HxoTWjMKYqZWVZZGzxYjXA',
            at: daysFromNow(-4, 9, 0),
        },
        {
            id: 'VYpghzmuinfbwbUVPLMkqg',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'qMXousWjIHczNUwqWDGsXg',
            at: daysFromNow(-2, 11, 0),
        },
        // out-of-clan
        {
            id: 'TCtoPFDmdKdsuDCqTXpruA',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'JSKYLSrCcNBvfdHXrPNOWw',
            at: daysFromNow(-35, 9, 0),
        },
        {
            id: 'ketMjiPQVTQdVcxaReESiw',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'zvwXWNSafFwBskEQVfnfaw',
            at: daysFromNow(-22, 10, 30),
        },
        // old (outside 90-day window)
        {
            id: 'FxkTbbnAnMwyXBBBibhUVw',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'DELkFWgEyhoqyuyrbnQuEA',
            at: daysFromNow(-108, 9, 0),
        },
        {
            id: 'ogMkyufNfmRfygySDwAvoA',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'GybPgWucvmsPHNwjNAyOiw',
            at: daysFromNow(-103, 10, 0),
        },
        // prc join rows (Proposal Review Cycle)
        {
            id: 'AxlqnbjqzRjDVuqCNVCzUA',
            flow_id:
                'DDUhYDIRInXtIrRraxcyHQ',
            work_order_id:
                'fCGVSSzsRHDgDLvPXbYkDw',
            at: daysFromNow(-60, 9, 0),
        },
        {
            id: 'RinCQXfwCkDpvttIAHDBtw',
            flow_id:
                'DDUhYDIRInXtIrRraxcyHQ',
            work_order_id:
                'MMbQqbhcKfHVHWhnsjIqnA',
            at: daysFromNow(-45, 10, 0),
        },
        {
            id: 'jvdeSMqxLWREtmJfumMbFg',
            flow_id:
                'DDUhYDIRInXtIrRraxcyHQ',
            work_order_id:
                'oqpwipJxpRbKzypGkStjjw',
            at: daysFromNow(-30, 8, 0),
        },
        {
            id: 'zCiaNHEWgIZYwOQDBvcsLg',
            flow_id:
                'DDUhYDIRInXtIrRraxcyHQ',
            work_order_id:
                'TMRENIJdzgBtLiMyuxUkNg',
            at: daysFromNow(-20, 11, 0),
        },
        {
            id: 'QNmZLarcGDlooTuoqinhGw',
            flow_id:
                'DDUhYDIRInXtIrRraxcyHQ',
            work_order_id:
                'zOSyhzfDZMJDhZPsOvFwRg',
            at: daysFromNow(-15, 9, 0),
        },
        {
            id: 'SsYNhPswNLVertgvlOSnnA',
            flow_id:
                'DDUhYDIRInXtIrRraxcyHQ',
            work_order_id:
                'FCEBEWzmelSFTOlqcZsbdQ',
            at: daysFromNow(-5, 10, 0),
        },
        {
            id: 'edhtIsASZohHjSlxxNAyXw',
            flow_id:
                'esKujtyQFYUJaVSXWwavzA',
            work_order_id:
                'eOlNZpGQfmCdpSFWXGkzFQ',
            at: daysFromNow(-1, 9, 0),
        },
    ];
}

export function buildWorkOrderStateEvents():
    StateEntity[] {
    return [
        {
            id: 'EQwiLkgNoMrWVsUZZOlJSg',
            entity_id: woId,
            state: woNodeNew,
            member_id: woPersonSarah,
            at:
                woCreated,
        },
        {
            id: 'MvMOuqIfTHLyUnlPdOROQA',
            entity_id: woId,
            state: woNodeCapture,
            member_id: woPersonSarah,
            at:
                woCreated,
        },
        {
            id: 'YiTfnydHjXVkotLACabXeQ',
            entity_id: woId,
            state: woNodeReview,
            member_id: woPersonEmily,
            at:
                daysFromNow(-13, 14, 30),
        },
        {
            id: 'FIGqMByLITfUxFFGaBEePw',
            entity_id: woId,
            state:
                woNodeComplete,
            member_id: woPersonSarah,
            at:
                daysFromNow(-12, 9, 15),
        },
        // happy-path WO02: Data Capture sojourn 1 day
        {
            id: 'CnXVzvYLAbdwczlbRQXgtA',
            entity_id:
                'krzCXtfVNOLvbGcYnSrhng',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-88, 9, 0),
        },
        {
            id: 'MnpsajBZOFPCDxgQWPdAdA',
            entity_id:
                'krzCXtfVNOLvbGcYnSrhng',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-88, 9, 5),
        },
        {
            id: 'yxNUpxnkqPxMECsztcaXvQ',
            entity_id:
                'krzCXtfVNOLvbGcYnSrhng',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-87, 10, 0),
        },
        {
            id: 'kjaNrBXWvEwYaBXtmAWcgw',
            entity_id:
                'krzCXtfVNOLvbGcYnSrhng',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-85, 14, 0),
        },
        // happy-path WO03: Data Capture sojourn 2 days
        {
            id: 'rOyKxWiRjidfLfhZufAlVw',
            entity_id:
                'uxTjfwTdFboxQRRfLQBfjA',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-82, 10, 0),
        },
        {
            id: 'SgwqdaKApHkOjDQHdgKgig',
            entity_id:
                'uxTjfwTdFboxQRRfLQBfjA',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-82, 10, 8),
        },
        {
            id: 'lSKeXxRhQibFNpfCDykgfA',
            entity_id:
                'uxTjfwTdFboxQRRfLQBfjA',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-80, 11, 0),
        },
        {
            id: 'olpknntQdGrbHhdExRLTOQ',
            entity_id:
                'uxTjfwTdFboxQRRfLQBfjA',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-79, 9, 0),
        },
        // happy-path WO04: Data Capture sojourn 3 days
        {
            id: 'eXhbeZTMmlxUcepingLliw',
            entity_id:
                'JwjCJbRVYCGojtDDMbFISw',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-76, 8, 30),
        },
        {
            id: 'MdDDCkqXNHWPKAvgATTPsw',
            entity_id:
                'JwjCJbRVYCGojtDDMbFISw',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-76, 8, 40),
        },
        {
            id: 'ULgwVBfUvaeVExQTAoHERQ',
            entity_id:
                'JwjCJbRVYCGojtDDMbFISw',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-73, 10, 0),
        },
        {
            id: 'ULFkmKLiuKjfDhbPGXTLsg',
            entity_id:
                'JwjCJbRVYCGojtDDMbFISw',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-71, 15, 0),
        },
        // happy-path WO05: Data Capture sojourn 1 day
        {
            id: 'JIowmwUWysqrxYhZjiplEA',
            entity_id:
                'VdkdxziHStBwGlqXMplgzg',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-71, 9, 0),
        },
        {
            id: 'dwdVDTQzgagUxhlJqGBgJA',
            entity_id:
                'VdkdxziHStBwGlqXMplgzg',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-71, 9, 10),
        },
        {
            id: 'CqvpBypopvgawRrJPhwIkQ',
            entity_id:
                'VdkdxziHStBwGlqXMplgzg',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-70, 14, 0),
        },
        {
            id: 'zlzzbgtXhinQZJwjWaDDcg',
            entity_id:
                'VdkdxziHStBwGlqXMplgzg',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-68, 10, 0),
        },
        // happy-path WO06: Data Capture sojourn 5 days
        {
            id: 'BZqkqoBmDKqbxkAdQeUQlw',
            entity_id:
                'SEHtXAFBwzspwfqzUgLOGg',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-66, 11, 0),
        },
        {
            id: 'KYgLfKElRCLeWMhdBvERqg',
            entity_id:
                'SEHtXAFBwzspwfqzUgLOGg',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-66, 11, 12),
        },
        {
            id: 'DjfRHBBYSleQfcNpnlftUA',
            entity_id:
                'SEHtXAFBwzspwfqzUgLOGg',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-61, 9, 0),
        },
        {
            id: 'xbcOIqiSXJiTDzaJhbRdAw',
            entity_id:
                'SEHtXAFBwzspwfqzUgLOGg',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-59, 14, 0),
        },
        // happy-path WO07: Data Capture sojourn 2 days
        {
            id: 'GcSByIlbPGJkDZwXWpUxXg',
            entity_id:
                'EXifLeJkIZYAFlniPDbnyw',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-61, 9, 30),
        },
        {
            id: 'dxvhKxegvVXVXrxyaspXRA',
            entity_id:
                'EXifLeJkIZYAFlniPDbnyw',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-61, 9, 45),
        },
        {
            id: 'eUxClfluLIwRHKnlgfiDFg',
            entity_id:
                'EXifLeJkIZYAFlniPDbnyw',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-59, 11, 0),
        },
        {
            id: 'SqPstPODRgLNJaHykUFUow',
            entity_id:
                'EXifLeJkIZYAFlniPDbnyw',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-58, 9, 0),
        },
        // happy-path WO08: Data Capture sojourn 4 days
        {
            id: 'ezeltcCpBxlEcprdJGJplQ',
            entity_id:
                'XNCcLuvJJIMafjqfDQcysA',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-57, 8, 0),
        },
        {
            id: 'fHWxIrxpkFqthNeweZMcuQ',
            entity_id:
                'XNCcLuvJJIMafjqfDQcysA',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-57, 8, 15),
        },
        {
            id: 'mwFAiCDvpWXcBRYUMfSRbA',
            entity_id:
                'XNCcLuvJJIMafjqfDQcysA',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-53, 10, 0),
        },
        {
            id: 'rBMHuGkQThlvTVKzyqLNdg',
            entity_id:
                'XNCcLuvJJIMafjqfDQcysA',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-51, 14, 0),
        },
        // happy-path WO09: Data Capture sojourn 7 days (fat tail)
        {
            id: 'KKkVlPeCccbxGRGKxPflqw',
            entity_id:
                'kuHSbxoxnsegYoJpuziaIA',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-52, 10, 0),
        },
        {
            id: 'IeCOcQDJiWaycceGCZWTHg',
            entity_id:
                'kuHSbxoxnsegYoJpuziaIA',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-52, 10, 20),
        },
        {
            id: 'TsXAmNdOXDEGfGTUQrvEIQ',
            entity_id:
                'kuHSbxoxnsegYoJpuziaIA',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-45, 9, 0),
        },
        {
            id: 'elrCErstjZAnfVfZoSlzfQ',
            entity_id:
                'kuHSbxoxnsegYoJpuziaIA',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-43, 11, 0),
        },
        // happy-path WO10: Data Capture sojourn 3 days
        {
            id: 'fpuLcBvZAHCVORaJJEFrjA',
            entity_id:
                'ZIKwhTVQUmZbzpUElPynGg',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-48, 9, 0),
        },
        {
            id: 'fEIbWOJXRvkwCTZugteBVQ',
            entity_id:
                'ZIKwhTVQUmZbzpUElPynGg',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-48, 9, 10),
        },
        {
            id: 'ZYPnpoVUPJKoePxYWowmpQ',
            entity_id:
                'ZIKwhTVQUmZbzpUElPynGg',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-45, 14, 0),
        },
        {
            id: 'HEbfxuJcOlnNgxhyYZDJKA',
            entity_id:
                'ZIKwhTVQUmZbzpUElPynGg',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-43, 10, 0),
        },
        // happy-path WO11: Data Capture sojourn 2 days
        {
            id: 'CDkmgfbWxEvTPZrepfKQTg',
            entity_id:
                'eGKKhdvQWwAgjMJCmOiWsg',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-44, 10, 30),
        },
        {
            id: 'HCPAhCdwLJzPYMpnFvXcxQ',
            entity_id:
                'eGKKhdvQWwAgjMJCmOiWsg',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-44, 10, 45),
        },
        {
            id: 'QmtfovxqQSjDrxjmVRmDrA',
            entity_id:
                'eGKKhdvQWwAgjMJCmOiWsg',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-42, 11, 0),
        },
        {
            id: 'FiuYsNYixHoKtKRQPpjpbA',
            entity_id:
                'eGKKhdvQWwAgjMJCmOiWsg',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-41, 14, 0),
        },
        // happy-path WO12: Data Capture sojourn 6 days (fat tail)
        {
            id: 'TUKybDGVSlxDfFgIzCMvTQ',
            entity_id:
                'kwfRAQskBMDhxupBJSXBXg',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-40, 9, 0),
        },
        {
            id: 'lZEXAzXaqtyJftrGOniGzg',
            entity_id:
                'kwfRAQskBMDhxupBJSXBXg',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-40, 9, 15),
        },
        {
            id: 'BiTcCiqmejTVheNqthmQMg',
            entity_id:
                'kwfRAQskBMDhxupBJSXBXg',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-34, 10, 0),
        },
        {
            id: 'RKhVdmyOJAQYOZJXnZSpxQ',
            entity_id:
                'kwfRAQskBMDhxupBJSXBXg',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-32, 9, 0),
        },
        // happy-path WO13: Data Capture sojourn 1 day
        {
            id: 'SSyghiMAKJjcFPvADpiuhA',
            entity_id:
                'FPRJDMIESNrhvDpngiVgAA',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-37, 8, 0),
        },
        {
            id: 'GznZBXicDDcjFYKvFDASJA',
            entity_id:
                'FPRJDMIESNrhvDpngiVgAA',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-37, 8, 10),
        },
        {
            id: 'PufXSlMpdPLhlulheqGFcw',
            entity_id:
                'FPRJDMIESNrhvDpngiVgAA',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-36, 11, 0),
        },
        {
            id: 'ofTIoBNHocPFxHUBRuqPKQ',
            entity_id:
                'FPRJDMIESNrhvDpngiVgAA',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-35, 14, 0),
        },
        // happy-path WO14: Data Capture sojourn 9 days (fat tail)
        {
            id: 'ZRdvKbDFphjYjLjNMaFJuQ',
            entity_id:
                'HEEYmJQUuZTwpwZwEvDHIA',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-33, 9, 30),
        },
        {
            id: 'HpjwNgQRIhPSdkuatCkaKQ',
            entity_id:
                'HEEYmJQUuZTwpwZwEvDHIA',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-33, 9, 45),
        },
        {
            id: 'CzclCbhcaKMSiMmdOnXSAQ',
            entity_id:
                'HEEYmJQUuZTwpwZwEvDHIA',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-24, 10, 0),
        },
        {
            id: 'PpBrLtywKfMkdErgGMKvKA',
            entity_id:
                'HEEYmJQUuZTwpwZwEvDHIA',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-22, 9, 0),
        },
        // happy-path WO15: Data Capture sojourn 2 days
        {
            id: 'DIVbJGivgldNjYwJypCNaw',
            entity_id:
                'AgBUgTINNElBAvqwWMUegw',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-29, 10, 0),
        },
        {
            id: 'RHRtHidcdIsYRvsDzfATMg',
            entity_id:
                'AgBUgTINNElBAvqwWMUegw',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-29, 10, 15),
        },
        {
            id: 'MURxoGiDVXnyPCUaDpiYZw',
            entity_id:
                'AgBUgTINNElBAvqwWMUegw',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-27, 14, 0),
        },
        {
            id: 'UplvQrMBcjyXXTxnhBjQxg',
            entity_id:
                'AgBUgTINNElBAvqwWMUegw',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-25, 10, 0),
        },
        // happy-path WO16: Data Capture sojourn 3 days
        {
            id: 'EwiUDlUsTeVEyPEsqZEfvg',
            entity_id:
                'SwOSfDtxXEdmGGuHaNzXAQ',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-26, 9, 0),
        },
        {
            id: 'YuxXiNRxRswjlELFiJTzTg',
            entity_id:
                'SwOSfDtxXEdmGGuHaNzXAQ',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-26, 9, 12),
        },
        {
            id: 'ZPrwjrjJiUJsCJRLbAkrvQ',
            entity_id:
                'SwOSfDtxXEdmGGuHaNzXAQ',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-23, 11, 0),
        },
        {
            id: 'NRaLXOFRnhnAeIkhfaLEFQ',
            entity_id:
                'SwOSfDtxXEdmGGuHaNzXAQ',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-21, 14, 0),
        },
        // happy-path WO17: Data Capture sojourn 1 day
        {
            id: 'HfzzgGalemBtHxEbeBWJCg',
            entity_id:
                'swamOcwhrDmLKzRKlqunFw',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-23, 8, 30),
        },
        {
            id: 'CdKebsnVyshEabiZqILqYQ',
            entity_id:
                'swamOcwhrDmLKzRKlqunFw',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-23, 8, 42),
        },
        {
            id: 'rNSWTRlVLCZXqKEeUsZjDg',
            entity_id:
                'swamOcwhrDmLKzRKlqunFw',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-22, 10, 0),
        },
        {
            id: 'DQxPEamSQhhpNCmIqiaJfQ',
            entity_id:
                'swamOcwhrDmLKzRKlqunFw',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-21, 9, 0),
        },
        // happy-path WO18: Data Capture sojourn 4 days
        {
            id: 'WihjfhDYDyxzxjsgRnOGMQ',
            entity_id:
                'TRzdRYgxAuHFJsJxdGtngw',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-20, 10, 0),
        },
        {
            id: 'UMdoEhLTVCJZpsNVZkrLOg',
            entity_id:
                'TRzdRYgxAuHFJsJxdGtngw',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-20, 10, 18),
        },
        {
            id: 'HTmCLvLKELmjqcbfYWhfUQ',
            entity_id:
                'TRzdRYgxAuHFJsJxdGtngw',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-16, 9, 0),
        },
        {
            id: 'IBXcqqAlIjQCHshaLhdVvw',
            entity_id:
                'TRzdRYgxAuHFJsJxdGtngw',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-14, 14, 0),
        },
        // happy-path WO19: Data Capture sojourn 8 days (fat tail)
        {
            id: 'DuDIopZiMzfiZcqbMPnBqg',
            entity_id:
                'QfOuwFUXrsWqHFnJgTSDCg',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-17, 9, 0),
        },
        {
            id: 'OHoUzoIRxZcsmsovbmYKBg',
            entity_id:
                'QfOuwFUXrsWqHFnJgTSDCg',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-17, 9, 20),
        },
        {
            id: 'wsTzFxKosAnjyOxDaVKVNQ',
            entity_id:
                'QfOuwFUXrsWqHFnJgTSDCg',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-9, 10, 0),
        },
        {
            id: 'KfszMqUWqYzIluVyBthfVQ',
            entity_id:
                'QfOuwFUXrsWqHFnJgTSDCg',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-7, 14, 0),
        },
        // happy-path WO20: Data Capture sojourn 2 days
        {
            id: 'TmDHuRYWHXOTuPFNOjlZNw',
            entity_id:
                'GJyTGedIrFfonBxkniEylA',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-14, 8, 0),
        },
        {
            id: 'VGaYNVtPfEqTaBIUxUasFA',
            entity_id:
                'GJyTGedIrFfonBxkniEylA',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-14, 8, 15),
        },
        {
            id: 'DNhzHZHqCXHlDAfKkqPtKQ',
            entity_id:
                'GJyTGedIrFfonBxkniEylA',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-12, 11, 0),
        },
        {
            id: 'xhGnCfysbbkiciNwpLYXqw',
            entity_id:
                'GJyTGedIrFfonBxkniEylA',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-10, 9, 0),
        },
        // happy-path WO21: Data Capture sojourn 3 days
        {
            id: 'QhsseOzoIElOrMAiwLSdHw',
            entity_id:
                'BqOPvRjANCSRrdRwRGbyUw',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-11, 10, 30),
        },
        {
            id: 'nRNVbFfOnNHiYOlyKxhmFg',
            entity_id:
                'BqOPvRjANCSRrdRwRGbyUw',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-11, 10, 48),
        },
        {
            id: 'uLgLODCAzubtcKuRaVuzcA',
            entity_id:
                'BqOPvRjANCSRrdRwRGbyUw',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-8, 14, 0),
        },
        {
            id: 'KAnRxHFrRtMCEtCqXIltgw',
            entity_id:
                'BqOPvRjANCSRrdRwRGbyUw',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-6, 10, 0),
        },
        // happy-path WO22: Data Capture sojourn 1 day
        {
            id: 'dRQPLUPyeWHegZWFDAIEAQ',
            entity_id:
                'UegjcqnhNlWGJMWYjRMgCQ',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-9, 9, 0),
        },
        {
            id: 'RscUpaDwIlBuotEcjXyYDw',
            entity_id:
                'UegjcqnhNlWGJMWYjRMgCQ',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-9, 9, 10),
        },
        {
            id: 'VOOKxeUGusEVAFLObSceSQ',
            entity_id:
                'UegjcqnhNlWGJMWYjRMgCQ',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-8, 10, 0),
        },
        {
            id: 'EjhHLnfMCvfiBHQpSidSaw',
            entity_id:
                'UegjcqnhNlWGJMWYjRMgCQ',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-7, 9, 0),
        },
        // happy-path WO23: Data Capture sojourn 2 days
        {
            id: 'GUGFEyniJcLDsiSVaTMrvg',
            entity_id:
                'QtuoBiqabeXfgMIMUgMUaQ',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-6, 11, 0),
        },
        {
            id: 'BQrScZBZhlQbnNPmtummUg',
            entity_id:
                'QtuoBiqabeXfgMIMUgMUaQ',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-6, 11, 15),
        },
        {
            id: 'FbzkWxNGQEuuYcbhQuUwQQ',
            entity_id:
                'QtuoBiqabeXfgMIMUgMUaQ',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-4, 9, 0),
        },
        {
            id: 'fGujkgenNIGGYrPrjpUuIg',
            entity_id:
                'QtuoBiqabeXfgMIMUgMUaQ',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-2, 14, 0),
        },
        // needs-revision WO24: double loop Data Capture->Review->Data Capture
        // twice, creating a 3rd distinct completed path
        {
            id: 'jszwOAGGFTIjuXZdXeYUhQ',
            entity_id:
                'NQLhTgeebJflEfLNiIKRbw',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-77, 9, 0),
        },
        {
            id: 'XljSBFUBifeXWHKGMuHUrA',
            entity_id:
                'NQLhTgeebJflEfLNiIKRbw',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-77, 9, 10),
        },
        {
            id: 'ANgLnHCWQqPvveMyOTtXmA',
            entity_id:
                'NQLhTgeebJflEfLNiIKRbw',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-75, 11, 0),
        },
        {
            id: 'GHPibfvmNzEWQqXkCtlXiQ',
            entity_id:
                'NQLhTgeebJflEfLNiIKRbw',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-74, 14, 0),
        },
        {
            id: 'xoXWfZPFyraxWIqzRJPWeQ',
            entity_id:
                'NQLhTgeebJflEfLNiIKRbw',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-73, 10, 0),
        },
        {
            id: 'WuqXIcqRuBrMDShLhrAQsg',
            entity_id:
                'NQLhTgeebJflEfLNiIKRbw',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-72, 14, 0),
        },
        {
            id: 'WLvjRnJzlJEYwrIJkhJBUg',
            entity_id:
                'NQLhTgeebJflEfLNiIKRbw',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-71, 10, 0),
        },
        {
            id: 'YmUkiZmssLYqeNQzSLNyGw',
            entity_id:
                'NQLhTgeebJflEfLNiIKRbw',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-70, 9, 0),
        },
        // needs-revision WO25: loops Data Capture->Review->Data Capture
        {
            id: 'AaOLlTDEKfngNsWhywpNNQ',
            entity_id:
                'FEDdQbmpanDFVZdPnUbwWg',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-63, 10, 0),
        },
        {
            id: 'lWgGVqfAVqbRazPWtEwywQ',
            entity_id:
                'FEDdQbmpanDFVZdPnUbwWg',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-63, 10, 15),
        },
        {
            id: 'NxuOgnmOWIJTFYsSQNFujQ',
            entity_id:
                'FEDdQbmpanDFVZdPnUbwWg',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-61, 14, 0),
        },
        {
            id: 'IRhgszfqLSrHPfXBFpuVnQ',
            entity_id:
                'FEDdQbmpanDFVZdPnUbwWg',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-60, 22, 0),
        },
        {
            id: 'TEiNWovKOjsCrSbaghoVZA',
            entity_id:
                'FEDdQbmpanDFVZdPnUbwWg',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-59, 14, 0),
        },
        {
            id: 'BRltKffGkkXGGeOOxrOaHg',
            entity_id:
                'FEDdQbmpanDFVZdPnUbwWg',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-58, 9, 0),
        },
        // needs-revision WO26: loops Data Capture->Review->Data Capture
        {
            id: 'DzCPjdsLkNYnwXlZjIdLDw',
            entity_id:
                'OAvDqHdtlzUeHVxrxlcFgg',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-50, 8, 30),
        },
        {
            id: 'GuCHrCuEiuEwtCkCqdCVoQ',
            entity_id:
                'OAvDqHdtlzUeHVxrxlcFgg',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-50, 8, 45),
        },
        {
            id: 'PessBxPWWbtSMmTsecpkhQ',
            entity_id:
                'OAvDqHdtlzUeHVxrxlcFgg',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-48, 11, 0),
        },
        {
            id: 'ZYHUifFdnUCEmjYPNCgtJg',
            entity_id:
                'OAvDqHdtlzUeHVxrxlcFgg',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-47, 14, 0),
        },
        {
            id: 'DnSiAExkNIgNzwwpkiwpFg',
            entity_id:
                'OAvDqHdtlzUeHVxrxlcFgg',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-46, 10, 0),
        },
        {
            id: 'IAOKkDenqgFLGMiIduogFg',
            entity_id:
                'OAvDqHdtlzUeHVxrxlcFgg',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-44, 14, 0),
        },
        // needs-revision WO27: loops Data Capture->Review->Data Capture
        {
            id: 'FbsEcnJdROcXFMskXDubzg',
            entity_id:
                'yuPIkpaXrJNwIzfKMytkfg',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-38, 9, 0),
        },
        {
            id: 'ukpybQjAZhILKPusSZDuRQ',
            entity_id:
                'yuPIkpaXrJNwIzfKMytkfg',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-38, 9, 18),
        },
        {
            id: 'erIoBEMVMiEJyKHjDFcrkg',
            entity_id:
                'yuPIkpaXrJNwIzfKMytkfg',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-36, 14, 0),
        },
        {
            id: 'WhZHbmJzHSEMjeKdPOcelg',
            entity_id:
                'yuPIkpaXrJNwIzfKMytkfg',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-35, 22, 0),
        },
        {
            id: 'YqtKQBuAkbPwbXfXmcTzZQ',
            entity_id:
                'yuPIkpaXrJNwIzfKMytkfg',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-34, 14, 0),
        },
        {
            id: 'zhqQwBLVsfiMViBJzlEnWw',
            entity_id:
                'yuPIkpaXrJNwIzfKMytkfg',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-33, 9, 0),
        },
        // needs-revision WO28: loops Data Capture->Review->Data Capture
        {
            id: 'TkqUOVXGSilwwiDGBvbntQ',
            entity_id:
                'xiekvzKePoUXMiQlySGHag',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-25, 10, 0),
        },
        {
            id: 'EBXMTskBkSzzvXlpOhCRpA',
            entity_id:
                'xiekvzKePoUXMiQlySGHag',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-25, 10, 20),
        },
        {
            id: 'vEKSYEhEMttQUEPmJMuAyQ',
            entity_id:
                'xiekvzKePoUXMiQlySGHag',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-23, 14, 0),
        },
        {
            id: 'JHYjuMTMjcMcThANDwkvqw',
            entity_id:
                'xiekvzKePoUXMiQlySGHag',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-22, 14, 0),
        },
        {
            id: 'PZyZSbqHsXiBXwMGATiIng',
            entity_id:
                'xiekvzKePoUXMiQlySGHag',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-21, 10, 0),
        },
        {
            id: 'ACidLoZxRKhJmqiJFWUaIg',
            entity_id:
                'xiekvzKePoUXMiQlySGHag',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-19, 14, 0),
        },
        // needs-revision WO29: loops Data Capture->Review->Data Capture
        {
            id: 'SDXwOHgmcrYMieJfaAGMVA',
            entity_id:
                'BRDKCttpdvJSFqPxmPEAxg',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-12, 9, 30),
        },
        {
            id: 'YtCHkOMRhsvMTgAWDnVONA',
            entity_id:
                'BRDKCttpdvJSFqPxmPEAxg',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-12, 9, 45),
        },
        {
            id: 'xUgJxInrSZPMBVlWHXaWbA',
            entity_id:
                'BRDKCttpdvJSFqPxmPEAxg',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-11, 11, 0),
        },
        {
            id: 'HSUIzdptmTmWQcKZqSVDdw',
            entity_id:
                'BRDKCttpdvJSFqPxmPEAxg',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-10, 14, 0),
        },
        {
            id: 'UMYZXlrklHLWYUzcbnOAdw',
            entity_id:
                'BRDKCttpdvJSFqPxmPEAxg',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-9, 11, 0),
        },
        {
            id: 'FDJrBcFNSbyWinrQSjTzBg',
            entity_id:
                'BRDKCttpdvJSFqPxmPEAxg',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-8, 9, 0),
        },
        // in-flight WO30: sitting in Data Capture
        {
            id: 'CWyWrDbOtPSFahuPjNLejA',
            entity_id:
                'gButmqAicxcpsNuiTYQNKA',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-18, 9, 0),
        },
        {
            id: 'DZOiOTrIHXnLUYumNoKKVw',
            entity_id:
                'gButmqAicxcpsNuiTYQNKA',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-18, 9, 15),
        },
        // in-flight WO31: sitting in Data Capture
        {
            id: 'zBPBCVRZtQEaXcAMNEldgA',
            entity_id:
                'AbRcGuaSMFbUfPAexnegfw',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-10, 10, 0),
        },
        {
            id: 'yyuhnsKqelsFXUuCEPoVqw',
            entity_id:
                'AbRcGuaSMFbUfPAexnegfw',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-10, 10, 20),
        },
        // in-flight WO32: sitting in Data Capture
        {
            id: 'xMIJlqLkLMvYjDCOwTWtlA',
            entity_id:
                'nTIlwHvYCLLpcgDPpZfJsw',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-7, 8, 0),
        },
        {
            id: 'YgtDgAQudiEXaWgyCtDtPw',
            entity_id:
                'nTIlwHvYCLLpcgDPpZfJsw',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-7, 8, 12),
        },
        // in-flight WO33: sitting in Review
        {
            id: 'TUWiOEDnDdGsgaBmhbqkVA',
            entity_id:
                'HxoTWjMKYqZWVZZGzxYjXA',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-4, 9, 0),
        },
        {
            id: 'pLYIXgijTBXVlqnsrRsKGA',
            entity_id:
                'HxoTWjMKYqZWVZZGzxYjXA',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-4, 9, 18),
        },
        {
            id: 'BkoiOAhFCSoksMCBQXJDew',
            entity_id:
                'HxoTWjMKYqZWVZZGzxYjXA',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-3, 14, 0),
        },
        // in-flight WO34: sitting in Review
        {
            id: 'SoExfAJWFJvSkEvdAlavzg',
            entity_id:
                'qMXousWjIHczNUwqWDGsXg',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-2, 11, 0),
        },
        {
            id: 'JJmsqLBRpVPUsQKmpXUFQw',
            entity_id:
                'qMXousWjIHczNUwqWDGsXg',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-2, 11, 20),
        },
        {
            id: 'JPkRnOESHXeNbkFeDKhncg',
            entity_id:
                'qMXousWjIHczNUwqWDGsXg',
            state: woNodeReview,
            member_id: woPersonCurrent,
            at: daysFromNow(-1, 10, 0),
        },
        // out-of-clan WO35: Sarah (not in Data Capture members)
        // transitions Data Capture out
        {
            id: 'wsJQfjRZjxLdLFtGfZaIIg',
            entity_id:
                'JSKYLSrCcNBvfdHXrPNOWw',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-35, 9, 0),
        },
        {
            id: 'WhZnHQlZrZcwRhRLKRowAA',
            entity_id:
                'JSKYLSrCcNBvfdHXrPNOWw',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-35, 9, 12),
        },
        {
            id: 'MohzKGMYchMbUtzTvYVIgw',
            entity_id:
                'JSKYLSrCcNBvfdHXrPNOWw',
            state: woNodeReview,
            member_id: woPersonSarah,
            at: daysFromNow(-33, 10, 0),
        },
        {
            id: 'UHcVNXorYBCZdHRYrvdWKw',
            entity_id:
                'JSKYLSrCcNBvfdHXrPNOWw',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-31, 14, 0),
        },
        // out-of-clan WO36: Mike (not in Data Capture members)
        // transitions Data Capture out
        {
            id: 'SZUGyWzCDrpNXAgnsvKfZA',
            entity_id:
                'zvwXWNSafFwBskEQVfnfaw',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-22, 10, 30),
        },
        {
            id: 'zMJBZCfQMmBsAIwRYUgDLw',
            entity_id:
                'zvwXWNSafFwBskEQVfnfaw',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-22, 10, 45),
        },
        {
            id: 'AJaWgLPFJUCxxgxcPcibLA',
            entity_id:
                'zvwXWNSafFwBskEQVfnfaw',
            state: woNodeReview,
            member_id: woPersonEmily,
            at: daysFromNow(-20, 11, 0),
        },
        {
            id: 'TQpDuIFeOaXlYYtwlcTOmQ',
            entity_id:
                'zvwXWNSafFwBskEQVfnfaw',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-18, 14, 0),
        },
        // old WO37: straddles window edge; Create + Data Capture
        // entry 108 days ago but Data Capture exit 8 days ago so
        // only the in-window ~82 days of Data Capture sojourn
        // count toward heat (exercises window clipping)
        {
            id: 'QAqUhtlDTALiQzGcLRmpyg',
            entity_id:
                'DELkFWgEyhoqyuyrbnQuEA',
            state: woNodeNew,
            member_id: woPersonEmily,
            at: daysFromNow(-108, 9, 0),
        },
        {
            id: 'qbGbvckdgCnVxzutqDWwqg',
            entity_id:
                'DELkFWgEyhoqyuyrbnQuEA',
            state: woNodeCapture,
            member_id: woPersonEmily,
            at: daysFromNow(-108, 9, 15),
        },
        {
            id: 'FBPrUWKModSPRzPsZIRANQ',
            entity_id:
                'DELkFWgEyhoqyuyrbnQuEA',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-8, 10, 0),
        },
        {
            id: 'wkeFsioEJvKtIiBtCUWUGw',
            entity_id:
                'DELkFWgEyhoqyuyrbnQuEA',
            state: woNodeComplete,
            member_id: woPersonSarah,
            at: daysFromNow(-5, 14, 0),
        },
        // old WO38: all transitions ~100-103 days ago,
        // entirely outside the 90-day window; contributes
        // ~0 to heat stats
        {
            id: 'kDCqOMmilvSejYwQAWEBUg',
            entity_id:
                'GybPgWucvmsPHNwjNAyOiw',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-103, 10, 0),
        },
        {
            id: 'okOhvCGymAvYXcPOGoVsYw',
            entity_id:
                'GybPgWucvmsPHNwjNAyOiw',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-103, 10, 18),
        },
        {
            id: 'DBjtSdkjwzpiNPbDFawWEw',
            entity_id:
                'GybPgWucvmsPHNwjNAyOiw',
            state: woNodeReview,
            member_id: woPersonMarcus,
            at: daysFromNow(-101, 11, 0),
        },
        {
            id: 'ImrJHLBYoYWoPqhyXafsog',
            entity_id:
                'GybPgWucvmsPHNwjNAyOiw',
            state: woNodeComplete,
            member_id: woPersonEmily,
            at: daysFromNow(-100, 9, 0),
        },
        // prc01: happy path, ~3 day draft sojourn
        {
            id: 'ZemYVenMYqXVtwixCifLIw',
            entity_id:
                'fCGVSSzsRHDgDLvPXbYkDw',
            state: prcNodeStart,
            member_id: woPersonSarah,
            at: daysFromNow(-60, 9, 0),
        },
        {
            id: 'BXWhjnXeDZrJcPbnRMcLkw',
            entity_id:
                'fCGVSSzsRHDgDLvPXbYkDw',
            state: prcNodeDraft,
            member_id: woPersonSarah,
            at: daysFromNow(-60, 9, 5),
        },
        {
            id: 'wuQKEuZjDETDIucLBSebbg',
            entity_id:
                'fCGVSSzsRHDgDLvPXbYkDw',
            state: prcNodeSubmit,
            member_id: woPersonEmily,
            at: daysFromNow(-57, 10, 0),
        },
        {
            id: 'pXsPnBRiysHozpxkucURcA',
            entity_id:
                'fCGVSSzsRHDgDLvPXbYkDw',
            state: prcNodeTriage,
            member_id: woPersonEmily,
            at: daysFromNow(-57, 10, 30),
        },
        {
            id: 'EdMYkqIYSsSpdpDaXQLyBA',
            entity_id:
                'fCGVSSzsRHDgDLvPXbYkDw',
            state: prcNodeQuickRev,
            member_id: woPersonMarcus,
            at: daysFromNow(-57, 11, 0),
        },
        {
            id: 'QXIbGmksamdOgBInyLbAyQ',
            entity_id:
                'fCGVSSzsRHDgDLvPXbYkDw',
            state: prcNodeDecision,
            member_id: woPersonMarcus,
            at: daysFromNow(-56, 14, 0),
        },
        {
            id: 'zWQidPMQhYExijLhbFKzEQ',
            entity_id:
                'fCGVSSzsRHDgDLvPXbYkDw',
            state: prcNodeApproved,
            member_id: woPersonSarah,
            at: daysFromNow(-56, 15, 0),
        },
        {
            id: 'TAyTGQCzsOeaDIrCHUsYbA',
            entity_id:
                'fCGVSSzsRHDgDLvPXbYkDw',
            state: prcNodeArchive,
            member_id: woPersonSarah,
            at: daysFromNow(-55, 9, 0),
        },
        // prc02: happy path, ~2 day draft sojourn
        {
            id: 'STJKVVzNoEwHtjKZjVEuRQ',
            entity_id:
                'MMbQqbhcKfHVHWhnsjIqnA',
            state: prcNodeStart,
            member_id: woPersonEmily,
            at: daysFromNow(-45, 10, 0),
        },
        {
            id: 'lxkqXoMBizUyrzohJRFlAQ',
            entity_id:
                'MMbQqbhcKfHVHWhnsjIqnA',
            state: prcNodeDraft,
            member_id: woPersonEmily,
            at: daysFromNow(-45, 10, 10),
        },
        {
            id: 'zVmSaCNopLRhOabSiRZCrQ',
            entity_id:
                'MMbQqbhcKfHVHWhnsjIqnA',
            state: prcNodeSubmit,
            member_id: woPersonEmily,
            at: daysFromNow(-43, 9, 0),
        },
        {
            id: 'zhPRrjDRHiwiqRJoVELdrQ',
            entity_id:
                'MMbQqbhcKfHVHWhnsjIqnA',
            state: prcNodeTriage,
            member_id: woPersonMarcus,
            at: daysFromNow(-43, 9, 20),
        },
        {
            id: 'RWhKHdWJQyLFcUMTBTzJww',
            entity_id:
                'MMbQqbhcKfHVHWhnsjIqnA',
            state: prcNodeQuickRev,
            member_id: woPersonMarcus,
            at: daysFromNow(-43, 10, 0),
        },
        {
            id: 'SBxlcCYahQxxTwvpkXblyA',
            entity_id:
                'MMbQqbhcKfHVHWhnsjIqnA',
            state: prcNodeDecision,
            member_id: woPersonSarah,
            at: daysFromNow(-42, 14, 0),
        },
        {
            id: 'KDrhGYJfZiyVjPIJkLCUyw',
            entity_id:
                'MMbQqbhcKfHVHWhnsjIqnA',
            state: prcNodeApproved,
            member_id: woPersonSarah,
            at: daysFromNow(-42, 15, 0),
        },
        {
            id: 'xojxWLlEHQoZXDpIcKNTLQ',
            entity_id:
                'MMbQqbhcKfHVHWhnsjIqnA',
            state: prcNodeArchive,
            member_id: woPersonEmily,
            at: daysFromNow(-41, 10, 0),
        },
        // prc03: happy path, ~1 day draft sojourn
        {
            id: 'jskXMycZSXTUxLoulczPdw',
            entity_id:
                'oqpwipJxpRbKzypGkStjjw',
            state: prcNodeStart,
            member_id: woPersonSarah,
            at: daysFromNow(-30, 8, 0),
        },
        {
            id: 'CQMvFVuxNsLxWpckOjWAGA',
            entity_id:
                'oqpwipJxpRbKzypGkStjjw',
            state: prcNodeDraft,
            member_id: woPersonSarah,
            at: daysFromNow(-30, 8, 10),
        },
        {
            id: 'AZTcvXsYIHNuByrHIOQzSA',
            entity_id:
                'oqpwipJxpRbKzypGkStjjw',
            state: prcNodeSubmit,
            member_id: woPersonCurrent,
            at: daysFromNow(-29, 9, 0),
        },
        {
            id: 'txhdZVxNenthRlAuzvMcmw',
            entity_id:
                'oqpwipJxpRbKzypGkStjjw',
            state: prcNodeTriage,
            member_id: woPersonCurrent,
            at: daysFromNow(-29, 9, 15),
        },
        {
            id: 'FWZkhAQDNVjazMhPIkksIQ',
            entity_id:
                'oqpwipJxpRbKzypGkStjjw',
            state: prcNodeQuickRev,
            member_id: woPersonMarcus,
            at: daysFromNow(-29, 10, 0),
        },
        {
            id: 'GzKolhAcuEOPaQaEPsitmg',
            entity_id:
                'oqpwipJxpRbKzypGkStjjw',
            state: prcNodeDecision,
            member_id: woPersonMarcus,
            at: daysFromNow(-28, 15, 0),
        },
        {
            id: 'AooEudoIbAWyNQVHzSZZHQ',
            entity_id:
                'oqpwipJxpRbKzypGkStjjw',
            state: prcNodeApproved,
            member_id: woPersonEmily,
            at: daysFromNow(-28, 16, 0),
        },
        {
            id: 'lLqTwPUUFzImRzcWgJILsQ',
            entity_id:
                'oqpwipJxpRbKzypGkStjjw',
            state: prcNodeArchive,
            member_id: woPersonEmily,
            at: daysFromNow(-27, 9, 0),
        },
        // prc04: happy path, ~4 day draft sojourn
        {
            id: 'JZfpspQWxBrFaUplMgjGuw',
            entity_id:
                'TMRENIJdzgBtLiMyuxUkNg',
            state: prcNodeStart,
            member_id: woPersonEmily,
            at: daysFromNow(-20, 11, 0),
        },
        {
            id: 'JstBEwxjMxVGHDidQFyOpg',
            entity_id:
                'TMRENIJdzgBtLiMyuxUkNg',
            state: prcNodeDraft,
            member_id: woPersonEmily,
            at: daysFromNow(-20, 11, 5),
        },
        {
            id: 'XpGnIJXHvNHhYSabIfPOeQ',
            entity_id:
                'TMRENIJdzgBtLiMyuxUkNg',
            state: prcNodeSubmit,
            member_id: woPersonMarcus,
            at: daysFromNow(-16, 10, 0),
        },
        {
            id: 'nsnhVBrMIHspcOtrhjMQKQ',
            entity_id:
                'TMRENIJdzgBtLiMyuxUkNg',
            state: prcNodeTriage,
            member_id: woPersonSarah,
            at: daysFromNow(-16, 10, 20),
        },
        {
            id: 'ZmbHLiTHFvIdlpfDBYEIkg',
            entity_id:
                'TMRENIJdzgBtLiMyuxUkNg',
            state: prcNodeQuickRev,
            member_id: woPersonSarah,
            at: daysFromNow(-16, 11, 0),
        },
        {
            id: 'AnZRVJgyiYVPLQoOXjTPvg',
            entity_id:
                'TMRENIJdzgBtLiMyuxUkNg',
            state: prcNodeDecision,
            member_id: woPersonSarah,
            at: daysFromNow(-15, 14, 0),
        },
        {
            id: 'YrMLohhvZQOEIVwlZajqGQ',
            entity_id:
                'TMRENIJdzgBtLiMyuxUkNg',
            state: prcNodeApproved,
            member_id: woPersonEmily,
            at: daysFromNow(-15, 15, 30),
        },
        {
            id: 'SlEUdTQHKAXSWLrSAKJLIQ',
            entity_id:
                'TMRENIJdzgBtLiMyuxUkNg',
            state: prcNodeArchive,
            member_id: woPersonEmily,
            at: daysFromNow(-14, 9, 0),
        },
        // prc05: revisit -- Decision sends to
        // Revise, then Draft again, then completes
        {
            id: 'BolIYNVHOhLtJJiTlMSGLw',
            entity_id:
                'zOSyhzfDZMJDhZPsOvFwRg',
            state: prcNodeStart,
            member_id: woPersonSarah,
            at: daysFromNow(-15, 9, 0),
        },
        {
            id: 'SpAFPKuZEvZnHdvSaDbKeA',
            entity_id:
                'zOSyhzfDZMJDhZPsOvFwRg',
            state: prcNodeDraft,
            member_id: woPersonSarah,
            at: daysFromNow(-15, 9, 10),
        },
        {
            id: 'uuvfYyHqllqlVuBfbPFsOA',
            entity_id:
                'zOSyhzfDZMJDhZPsOvFwRg',
            state: prcNodeSubmit,
            member_id: woPersonEmily,
            at: daysFromNow(-14, 10, 0),
        },
        {
            id: 'eJwvtVsGSaRMQiILfYKpRA',
            entity_id:
                'zOSyhzfDZMJDhZPsOvFwRg',
            state: prcNodeTriage,
            member_id: woPersonEmily,
            at: daysFromNow(-14, 10, 15),
        },
        {
            id: 'zofOJaZdwlzoBwoVUHySTg',
            entity_id:
                'zOSyhzfDZMJDhZPsOvFwRg',
            state: prcNodeQuickRev,
            member_id: woPersonMarcus,
            at: daysFromNow(-14, 11, 0),
        },
        {
            id: 'WhAFbtmVPHQRHLuhYmlvEQ',
            entity_id:
                'zOSyhzfDZMJDhZPsOvFwRg',
            state: prcNodeDecision,
            member_id: woPersonMarcus,
            at: daysFromNow(-13, 14, 0),
        },
        // Decision routes to Revise (revisit)
        {
            id: 'BVZUcDcZUzNegtWdPgfWUA',
            entity_id:
                'zOSyhzfDZMJDhZPsOvFwRg',
            state: prcNodeRevise,
            member_id: woPersonCurrent,
            at: daysFromNow(-13, 15, 0),
        },
        // Revise sends back to Draft
        {
            id: 'XJPhRRMvRMBdhmFjbQJHcA',
            entity_id:
                'zOSyhzfDZMJDhZPsOvFwRg',
            state: prcNodeDraft,
            member_id: woPersonSarah,
            at: daysFromNow(-12, 9, 0),
        },
        {
            id: 'QvyahNFGFVmWfbgRfMLpDA',
            entity_id:
                'zOSyhzfDZMJDhZPsOvFwRg',
            state: prcNodeSubmit,
            member_id: woPersonSarah,
            at: daysFromNow(-11, 10, 0),
        },
        {
            id: 'IOnbsxppJztYFQimEPjvcA',
            entity_id:
                'zOSyhzfDZMJDhZPsOvFwRg',
            state: prcNodeTriage,
            member_id: woPersonEmily,
            at: daysFromNow(-11, 10, 20),
        },
        {
            id: 'QANQObhucYYsFlnPjIdLug',
            entity_id:
                'zOSyhzfDZMJDhZPsOvFwRg',
            state: prcNodeQuickRev,
            member_id: woPersonEmily,
            at: daysFromNow(-11, 11, 0),
        },
        {
            id: 'WVDvagzaHvQhsPvQrEZyTQ',
            entity_id:
                'zOSyhzfDZMJDhZPsOvFwRg',
            state: prcNodeDecision,
            member_id: woPersonMarcus,
            at: daysFromNow(-10, 14, 0),
        },
        {
            id: 'JdnYAaRcRbiVGZfVlvcqLg',
            entity_id:
                'zOSyhzfDZMJDhZPsOvFwRg',
            state: prcNodeApproved,
            member_id: woPersonMarcus,
            at: daysFromNow(-10, 15, 0),
        },
        {
            id: 'NSfnyTzHVDijYUyOgvzrvA',
            entity_id:
                'zOSyhzfDZMJDhZPsOvFwRg',
            state: prcNodeArchive,
            member_id: woPersonSarah,
            at: daysFromNow(-9, 9, 0),
        },
        // prc06: in-flight -- stuck at Decision
        {
            id: 'gGzFilaLFJxgWoYptwGcGA',
            entity_id:
                'FCEBEWzmelSFTOlqcZsbdQ',
            state: prcNodeStart,
            member_id: woPersonEmily,
            at: daysFromNow(-5, 10, 0),
        },
        {
            id: 'tFAPylGYdEAvUfBfZjIVPQ',
            entity_id:
                'FCEBEWzmelSFTOlqcZsbdQ',
            state: prcNodeDraft,
            member_id: woPersonEmily,
            at: daysFromNow(-5, 10, 8),
        },
        {
            id: 'VsTwqXXDgmLuycgPSVmQog',
            entity_id:
                'FCEBEWzmelSFTOlqcZsbdQ',
            state: prcNodeSubmit,
            member_id: woPersonCurrent,
            at: daysFromNow(-4, 11, 0),
        },
        {
            id: 'MSfXTLMzreVoxZNyECaXhQ',
            entity_id:
                'FCEBEWzmelSFTOlqcZsbdQ',
            state: prcNodeTriage,
            member_id: woPersonSarah,
            at: daysFromNow(-4, 11, 20),
        },
        {
            id: 'qZEoVCbLmdSyqbFOYCsDrg',
            entity_id:
                'FCEBEWzmelSFTOlqcZsbdQ',
            state: prcNodeQuickRev,
            member_id: woPersonSarah,
            at: daysFromNow(-4, 12, 0),
        },
        {
            id: 'FVjTCQpDpCOMoDzxzQzaoA',
            entity_id:
                'FCEBEWzmelSFTOlqcZsbdQ',
            state: prcNodeDecision,
            member_id: woPersonMarcus,
            at: daysFromNow(-3, 14, 0),
        },
        // stays at Decision -- no more transitions
        // Gate-violation work order: Create then
        // Data Capture with no field values. Leaving
        // Capture trips the gate on Company Name +
        // Email (current-node required attrs).
        {
            id: 'egrICXlEtLydujpUXmZaJQ',
            entity_id:
                'eOlNZpGQfmCdpSFWXGkzFQ',
            state: woNodeNew,
            member_id: woPersonSarah,
            at: daysFromNow(-1, 9, 0),
        },
        {
            id: 'ehNUMEvGcoVHjrWbxonitg',
            entity_id:
                'eOlNZpGQfmCdpSFWXGkzFQ',
            state: woNodeCapture,
            member_id: woPersonSarah,
            at: daysFromNow(-1, 10, 0),
        },
    ];
}
