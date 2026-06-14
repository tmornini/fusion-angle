import { html, type SafeHtml } from '../safe-html.ts';
import type {
    Id, ObjectiveId, ProjectState,
} from '../../../api/types.ts';
import type {
    ProjectProblem,
} from '../adapters/project-publish.ts';
import type {
    ValidationResult,
} from '../adapters/validation.ts';

type Check = ValidationResult<ProjectProblem>;
type ObjectiveNames = ReadonlyMap<
    ObjectiveId, string
>;

export class ProjectActionBarPresenter {
    readonly #projectId: Id;
    readonly #state: ProjectState;
    readonly #approvalCheck: Check;
    readonly #archivalCheck: Check;
    readonly #objectiveNames: ObjectiveNames;

    constructor(
        projectId: Id,
        state: ProjectState,
        approvalCheck: Check,
        archivalCheck: Check,
        objectiveNames: ObjectiveNames,
    ) {
        this.#projectId = projectId;
        this.#state = state;
        this.#approvalCheck = approvalCheck;
        this.#archivalCheck = archivalCheck;
        this.#objectiveNames = objectiveNames;
    }

    buildReviewActions(): SafeHtml {
        const state = this.#state;
        const isReview = state === 'submitted'
            || state === 'under_review'
            || state === 'sent_back';
        if (!isReview) return html``;
        return html`
            <div class="action-bar"
                data-project-id="${this.#projectId}">
                ${this.#reviewActions()}
            </div>
        `;
    }

    buildLifecycleActions(): SafeHtml {
        const state = this.#state;
        if (state !== 'approved'
            && state !== 'archived') {
            return html``;
        }
        return html`
            <div class="action-bar"
                data-project-id="${this.#projectId}">
                ${state === 'approved'
                    ? this.#approvedActions()
                    : html``}
                <button data-action="view-history"
                    class="btn btn-outline">
                    View history
                </button>
            </div>
        `;
    }

    #namesFor(
        problems: ProjectProblem[],
    ): string {
        return problems
            .map(p => this.#objectiveNames.get(
                p.objectiveId,
            ) ?? p.objectiveId)
            .join(', ');
    }

    #reviewActions(): SafeHtml {
        const check = this.#approvalCheck;
        const tooltip = check.ready
            ? ''
            : 'Set a baseline score before '
                + 'approving: '
                + this.#namesFor(check.problems);
        return html`
            <button data-action="approve" ${
                check.ready ? '' : 'disabled'
            } class="btn btn-primary" title="${tooltip}">
                Approve
            </button>
            <button data-action="decline"
                class="btn btn-outline">
                Decline
            </button>
            <button data-action="send-back"
                class="btn btn-outline">
                Send back
            </button>
        `;
    }

    #approvedActions(): SafeHtml {
        const check = this.#archivalCheck;
        const tooltip = check.ready
            ? ''
            : 'Add an actual measurement before '
                + 'archiving: '
                + this.#namesFor(check.problems);
        return html`
            <button data-action="archive" ${
                check.ready ? '' : 'disabled'
            } class="btn btn-outline" title="${tooltip}">
                Archive
            </button>
        `;
    }
}
