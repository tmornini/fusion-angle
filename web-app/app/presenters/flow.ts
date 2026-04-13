import {
    html,
    SafeHtml,
} from '../safe-html';
import {
    iconCircle,
    iconShare,
    iconChevronRight,
    iconFolderKanban,
} from '../icons';
import type {
    FlowCardReceiver,
} from '../adapters/flows';

export class FlowPresenter
    implements FlowCardReceiver
{
    #id = '';
    #name = '';
    #description = '';
    #nodeCount = 0;
    #edgeCount = 0;
    #projectName: string | undefined;

    flowId(id: string): void {
        this.#id = id;
    }

    name(text: string): void {
        this.#name = text;
    }

    description(text: string): void {
        this.#description = text;
    }

    stats(
        nodeCount: number,
        edgeCount: number,
    ): void {
        this.#nodeCount = nodeCount;
        this.#edgeCount = edgeCount;
    }

    projectName(
        name: string | undefined,
    ): void {
        this.#projectName = name;
    }

    render(): SafeHtml {
        return html`
    <div class="${
        'card card-hover p-4 cursor-pointer'
    }"
        data-flow-card="${this.#id}">
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
                    ${this.#projectName
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
                            this.#projectName
                        }</span>`
                        : html``}
                </div>
                <h3 class="${
                    'font-semibold mb-1'
                }">${this.#name}</h3>
                <p class="${
                    'text-sm'
                    + ' text-muted mb-2'
                    + ' truncate'
                }">${
                    this.#description
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
                        this.#nodeCount
                    } ${
                        this.#nodeCount === 1
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
                        this.#edgeCount
                    } ${
                        this.#edgeCount === 1
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
