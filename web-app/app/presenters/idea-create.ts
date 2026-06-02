import {
    html, SafeHtml, trusted,
} from '../safe-html.ts';
import {
    iconSparkles, iconArrowLeft,
    iconLightbulb, iconCheck,
} from '../icons.ts';

export interface IdeaCreateDraft {
    title: string;
    problemStatement: string;
    targetUsers: string;
    proposedSolution: string;
    expectedOutcome: string;
    successMetrics: string;
}

export const EMPTY_IDEA_CREATE_DRAFT:
    IdeaCreateDraft = {
        title: '',
        problemStatement: '',
        targetUsers: '',
        proposedSolution: '',
        expectedOutcome: '',
        successMetrics: '',
    };

export function ideaCreateDraftIsComplete(
    draft: IdeaCreateDraft,
): boolean {
    return draft.title !== ''
        && draft.problemStatement !== ''
        && draft.proposedSolution !== ''
        && draft.expectedOutcome !== '';
}

export class IdeaCreatePresenter {
    readonly #draft: IdeaCreateDraft;

    constructor(draft: IdeaCreateDraft) {
        this.#draft = draft;
    }

    render(): SafeHtml {
        const isArchive =
            ideaCreateDraftIsComplete(
                this.#draft,
            );
        return html`
    <div class="entity">
    <div class="${
        'flex items-center'
        + ' justify-between'
        + ' gap-4 mb-6'
    }">
        <div class="${
            'flex items-center gap-4'
        }">
            <button
                class="${
                    'btn btn-ghost'
                    + ' btn-icon'
                }"
                id=${'idea-create'
                    + '-back-btn'}>
                ${iconArrowLeft(20, '')}
            </button>
            <div class="${
                'flex items-center gap-3'
            }">
                <div
                    class="${
                        'gradient-hero'
                        + ' rounded-lg'
                        + ' flex'
                        + ' items-center'
                        + ' justify-center'
                        + ' idea-create-icon'
                    }">
                    ${iconSparkles(
                        20, '',
                    )}
                </div>
                <span class="${
                    'text-xl'
                    + ' font-display'
                    + ' font-bold'
                }">
                    New Idea
                </span>
            </div>
        </div>
    </div>
    <div class="card p-6"
        id=${'idea-create'
            + '-step-content'}>
        <div class="mb-6">
            <div class="${
                'flex items-center gap-3'
            }">
                ${iconLightbulb(
                    24, 'text-primary',
                )}
                <h2 class="${
                    'text-2xl'
                    + ' font-display'
                    + ' font-bold'
                }">Describe Your Idea</h2>
            </div>
        </div>
        ${this.#buildFormFields()}
        <div
            class="${
                'flex items-center'
                + ' justify-between gap-3'
                + ' mt-8 pt-6'
                + ' section-divider-top'
            }">
            <button
                class="${
                    'btn btn-ghost'
                    + ' gap-2'
                }"
                id=${'idea-create'
                    + '-step-back'}>
                ${iconArrowLeft(16, '')}
                Cancel
            </button>
            <button
                class="${
                    'btn btn-hero'
                    + ' gap-2'
                }"
                id=${'idea-create'
                    + '-step-next'}
                ${trusted(
                    isArchive
                        ? ''
                        : 'disabled',
                )}>
                ${'Submit Idea'}
                ${iconCheck(16, '')}
            </button>
        </div>
    </div>
    </div>`;
    }

    #buildFormFields(): SafeHtml {
        const d = this.#draft;
        return html`
    <div class="flex flex-col gap-6">
        <div>
            <label class="label mb-2
                block font-medium"
                for="idea-create-field-title">
                Give your idea a clear title
            </label>
            <input class="${
                'input input-large-title'
            }"
                id=${'idea-create'
                    + '-field-title'}
                placeholder="${'e.g.,'
                    + ' AI-Powered'
                    + ' Customer'
                    + ' Segmentation'}"
                value="${d.title}"
            />
            <p class="text-xs text-muted
                mt-1">
                Keep it short and descriptive
                &#8211; think of what you
                would search for
            </p>
        </div>
        <div>
            <label class="label mb-2
                block font-medium"
                for="idea-create-field-problem">
                ${'What problem does'
                    + ' this solve?'}
            </label>
            <textarea class="${
                'textarea resize-none'
            }"
                id=${'idea-create'
                    + '-field-problem'}
                placeholder="${
                    'Describe the'
                    + ' current pain'
                    + ' point or'
                    + ' challenge. Who'
                    + ' experiences it?'
                    + ' How often? What'
                    + ' is the cost of'
                    + ' not solving it?'
                }"
                rows="5">${
                    d.problemStatement
            }</textarea>
            <p class="text-xs text-muted
                mt-1">
                Focus on the impact &#8211;
                why does this matter to
                the business?
            </p>
        </div>
        <div>
            <label class="label mb-2
                block font-medium"
                for="idea-create-field-target">
                ${'Who will benefit'
                    + ' from this?'}
            </label>
            <input class="input"
                id=${'idea-create'
                    + '-field-target'}
                placeholder="${
                    'e.g., Sales'
                    + ' team,'
                    + ' customers,'
                    + ' operations'
                    + ' managers'
                }"
                value="${d.targetUsers}"
            />
            <p class="text-xs text-muted
                mt-1">
                ${'Identify the people'
                    + ' or teams who will'
                    + ' use this'}
            </p>
        </div>
        <div>
            <label class="label mb-2
                block font-medium"
                for="idea-create-field-solution">
                How would you solve this?
            </label>
            <textarea class="${
                'textarea resize-none'
            }"
                id=${'idea-create'
                    + '-field-solution'}
                placeholder="${
                    'Describe your'
                    + ' proposed'
                    + ' approach.'
                    + ' What would'
                    + ' change? What'
                    + ' technology or'
                    + ' process would'
                    + ' you use?'
                }"
                rows="5">${
                    d.proposedSolution
            }</textarea>
            <p class="text-xs text-muted
                mt-1">
                You do not need all the
                answers &#8211; outline your
                best thinking
            </p>
        </div>
        <div>
            <label class="label mb-2
                block font-medium"
                for="idea-create-field-outcome">
                ${'What outcome do'
                    + ' you expect?'}
            </label>
            <textarea class="${
                'textarea resize-none'
            }"
                id=${'idea-create'
                    + '-field-outcome'}
                placeholder="${
                    'If this works,'
                    + ' what changes?'
                    + ' Be specific:'
                    + ' revenue impact,'
                    + ' time saved,'
                    + ' errors reduced,'
                    + ' satisfaction'
                    + ' improved...'
                }"
                rows="5">${
                    d.expectedOutcome
            }</textarea>
            <p class="text-xs text-muted
                mt-1">
                ${'Think about what success'
                    + ' looks'
                    + ' like in 6-12 months'}
            </p>
        </div>
        <div>
            <label class="label mb-2
                block font-medium"
                for="idea-create-field-metrics">
                ${'How would you'
                    + ' measure success?'}
            </label>
            <textarea class="${
                'textarea resize-none'
            }"
                id=${'idea-create'
                    + '-field-metrics'}
                placeholder="${
                    'e.g., 20%'
                    + ' reduction in'
                    + ' processing'
                    + ' time, 15%'
                    + ' increase in'
                    + ' conversion'
                    + ' rate, NPS'
                    + ' improvement'
                    + ' of 10 points'
                }"
                rows="4">${
                    d.successMetrics
            }</textarea>
            <p class="text-xs text-muted
                mt-1">
                ${'Define measurable'
                    + ' indicators of'
                    + ' success'}
            </p>
        </div>
    </div>`;
    }
}
