import { html, type SafeHtml } from '../safe-html.ts';
import {
    ICON_SIZE,
    iconBarChart,
    iconFolderKanban,
} from '../icons.ts';
import { buildPageUrl } from '../navigation.ts';

// A state that keeps the flow from taking work orders, by
// name: flow-publish.ts's problems, which name nodes by id.
export interface FlowPanelProblem {
    readonly kind: 'zero_members' | 'dead_end';
    readonly stateName: string;
}

export interface FlowPanelView {
    readonly id: string;
    readonly name: string;
    readonly projectName: string | undefined;
    readonly nodeCount: number;
    readonly edgeCount: number;
    readonly recordName: string | null;
    readonly problems: readonly FlowPanelProblem[];
}

function counted(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`;
}

// One line per kind of problem, naming its states in the
// order the flow holds them.
const PROBLEM_LINES: readonly {
    readonly kind: FlowPanelProblem['kind'];
    readonly label: string;
}[] = [
    { kind: 'zero_members', label: 'No members' },
    { kind: 'dead_end', label: 'No way out' },
];

function buildProblems(
    problems: readonly FlowPanelProblem[],
): SafeHtml {
    return html`${PROBLEM_LINES.map(({ kind, label }) => {
        const names = problems
            .filter(p => p.kind === kind)
            .map(p => p.stateName);
        return names.length === 0
            ? html``
            : html`<p data-flow-problem="${kind}"><span
                class="font-semibold">${label}:</span> ${
                names.join(', ')
            }</p>`;
    })}`;
}

// The Flows page's open flow. Its name, readiness and the
// ways into its designer and statistics stay in view; the
// problems and the drawing scroll beneath them. The drawing
// is painted into #flow-preview after the panel is in the
// page, when its box can be measured.
export function buildFlowPanel(v: FlowPanelView): SafeHtml {
    const ready = v.problems.length === 0;
    const states = counted(v.nodeCount, 'state', 'states');
    const transitions = counted(
        v.edgeCount, 'transition', 'transitions',
    );
    return html`<div class="${
        'flow-panel-head flex flex-wrap items-start'
        + ' justify-between gap-4 mb-6'
    }">
        <div class="min-w-0 flex flex-col gap-2">
            <h2 class="text-2xl font-display font-bold">${
                v.name
            }</h2>
            <div class="${
                'flex flex-wrap items-center gap-2'
                + ' text-sm text-muted'
            }">
                <span class="${
                    ready
                        ? 'badge badge-success'
                        : 'badge badge-warning'
                }" data-flow-readiness="${
                    ready ? 'ready' : 'not-ready'
                }">${
                    ready
                        ? 'Ready for work orders'
                        : counted(
                            v.problems.length,
                            'state needs',
                            'states need',
                        ) + ' attention'
                }</span>
                ${v.projectName === undefined
                    ? html``
                    : html`<span class="${
                        'badge badge-outline text-xs'
                    }">${
                        iconFolderKanban(ICON_SIZE.xs, '')
                    } ${v.projectName}</span>`}
                <span>${states} · ${transitions}</span>
                <span>${
                    v.recordName === null
                        ? 'No record bound'
                        : 'Record: ' + v.recordName
                }</span>
            </div>
        </div>
        <div class="flex gap-2">
            <button class="btn btn-outline gap-2"
                data-flow-stats="${v.id}"
                >${
                iconBarChart(ICON_SIZE.base, '')
            } Statistics</button>
            <a class="btn btn-primary"
                href="${buildPageUrl(
                    'flow-detail', { flowId: v.id },
                )}">Open in designer</a>
        </div>
    </div>
    ${ready
        ? html``
        : html`<div class="flow-panel-problems mb-6">${
            buildProblems(v.problems)
        }</div>`}
    <div id="flow-preview" class="flow-preview"
        role="img" aria-label="${
            `Drawing of ${v.name}: ${states}, ${transitions}`
        }"><div class="flow-preview-canvas" inert></div></div>`;
}
