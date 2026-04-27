import {
    html,
    SafeHtml,
} from '../safe-html.ts';
import {
    iconCircle,
    iconShare,
    iconChevronRight,
    iconFolderKanban,
} from '../icons.ts';
import type {
    FlowSummary,
} from '../adapters/flows.ts';

export class FlowPresenter {
    readonly #flow: FlowSummary;
    readonly #projectName: string | undefined;

    constructor(
        flow: FlowSummary,
        projectName: string | undefined,
    ) {
        this.#flow = flow;
        this.#projectName = projectName;
    }

    render(): SafeHtml {
        const f = this.#flow;
        const projectName = this.#projectName;
        return html`
    <div class="${
        'card card-hover p-4 cursor-pointer'
    }"
        data-flow-card="${f.id}">
        <div class="${
            'flex items-start '
            + 'justify-between gap-4'
        }">
            <div class="flex-fill">
                <div class="${
                    'flex flex-wrap '
                    + 'items-center'
                    + ' gap-2 mb-2'
                }">
                    ${projectName
                        ? html`<span
                            class="${
                                'badge'
                                + ' badge-outline'
                                + ' text-xs'
                            }">${
                            iconFolderKanban(
                                12, '',
                            )
                        } ${
                            projectName
                        }</span>`
                        : html``}
                </div>
                <h3 class="${
                    'font-semibold mb-1'
                }">${f.name}</h3>
                <p class="${
                    'text-sm'
                    + ' text-muted mb-2'
                    + ' truncate'
                }">${
                    f.description
                }</p>
                <div class="${
                    'flex flex-wrap '
                    + 'items-center'
                    + ' gap-3 '
                    + 'text-sm'
                    + ' text-muted'
                }">
                    <span class="${
                        'flex'
                        + ' items-center'
                        + ' gap-1'
                    }">${
                        iconCircle(14, '')
                    } ${
                        f.nodeCount
                    } ${
                        f.nodeCount === 1
                            ? 'state'
                            : 'states'
                    }</span>
                    <span class="${
                        'flex'
                        + ' items-center'
                        + ' gap-1'
                    }">${
                        iconShare(14, '')
                    } ${
                        f.edgeCount
                    } ${
                        f.edgeCount === 1
                            ? 'transition'
                            : 'transitions'
                    }</span>
                </div>
            </div>
            <div class="${
                'flex items-center'
            }">${
                iconChevronRight(
                    20,
                    'text-muted',
                )
            }</div>
        </div>
    </div>`;
    }
}
