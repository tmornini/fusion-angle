import {
    assert,
    assertMatch,
    assertStrictEquals,
} from '@std/assert';
import {
    buildFlowPanel,
    type FlowPanelView,
} from '../web-app/app/presenters/flow-panel.ts';
import { FlowPresenter } from '../web-app/app/presenters/flow.ts';

function view(over: Partial<FlowPanelView> = {}): FlowPanelView {
    return {
        id: 'aEsGMmBEFaVdWihhHXwCbw',
        name: 'Onboarding',
        projectName: 'Apollo',
        nodeCount: 4,
        edgeCount: 1,
        recordName: 'Customer Profile',
        problems: [],
        ...over,
    };
}

Deno.test(
    'a ready flow says so, names its record and opens its'
    + ' designer and statistics',
    () => {
        const out = buildFlowPanel(view()).toString();
        assertMatch(out, /data-flow-readiness="ready"/);
        assertMatch(out, /Ready for work orders/);
        assertMatch(out, /4 states · 1 transition</);
        assertMatch(out, /Record: Customer Profile/);
        assertMatch(out, /Apollo/);
        assertMatch(
            out,
            /href="\.\.\/flows\/detail\.html\?flowId=aEsGMmBEFaVdWihhHXwCbw"/,
        );
        assertMatch(out, /data-flow-stats="aEsGMmBEFaVdWihhHXwCbw"/);
        assertStrictEquals(out.includes('data-flow-problem'), false);
    },
);

Deno.test(
    'a flow that is not ready counts its states and names'
    + ' them by problem, in the flow\'s order',
    () => {
        const out = buildFlowPanel(view({
            problems: [
                { kind: 'zero_members', stateName: 'Review' },
                { kind: 'dead_end', stateName: 'Hold' },
                { kind: 'zero_members', stateName: 'Approve' },
            ],
        })).toString();
        assertMatch(out, /data-flow-readiness="not-ready"/);
        assertMatch(out, /3 states need attention/);
        assertMatch(
            out,
            new RegExp(
                'data-flow-problem="zero_members">[^]*'
                + 'No members:[^]*Review, Approve',
            ),
        );
        assertMatch(
            out, /data-flow-problem="dead_end">[^]*No way out:[^]*Hold/,
        );
    },
);

Deno.test('one problem state reads in the singular', () => {
    const out = buildFlowPanel(view({
        problems: [{ kind: 'dead_end', stateName: 'Hold' }],
    })).toString();
    assertMatch(out, /1 state needs attention/);
});

Deno.test('a flow with no bound record says so', () => {
    const out = buildFlowPanel(view({ recordName: null }))
        .toString();
    assertMatch(out, /No record bound/);
});

Deno.test(
    'the drawing is labelled for what it shows and takes no'
    + ' focus',
    () => {
        const out = buildFlowPanel(view()).toString();
        assertMatch(
            out,
            new RegExp(
                'role="img" aria-label="Drawing of'
                + ' Onboarding: 4 states, 1 transition"',
            ),
        );
        assertMatch(out, /class="flow-preview-canvas" inert/);
    },
);

Deno.test('the panel escapes a flow name', () => {
    const out = buildFlowPanel(view({ name: '<b>x</b>' }))
        .toString();
    assert(!out.includes('<b>x</b>'));
    assertMatch(out, /&lt;b&gt;x&lt;\/b&gt;/);
});

Deno.test(
    'a flow card\'s title links to the Flows page naming the'
    + ' flow',
    () => {
        const out = new FlowPresenter({
            id: 'aEsGMmBEFaVdWihhHXwCbw',
            name: 'Onboarding',
            nodeCount: 3,
            edgeCount: 2,
        }, undefined).render().toString();
        assertMatch(
            out,
            new RegExp(
                '<a href="\\.\\./flows/index\\.html'
                + '\\?id=aEsGMmBEFaVdWihhHXwCbw">Onboarding</a>',
            ),
        );
    },
);
