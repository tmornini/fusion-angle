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
    readonly #completionCheck: Check;
    readonly #objectiveNames: ObjectiveNames;

    constructor(
        projectId: Id,
        state: ProjectState,
        approvalCheck: Check,
        completionCheck: Check,
        objectiveNames: ObjectiveNames = new Map(),
    ) {
        this.#projectId = projectId;
        this.#state = state;
        this.#approvalCheck = approvalCheck;
        this.#completionCheck = completionCheck;
        this.#objectiveNames = objectiveNames;
    }

    buildBar(): SafeHtml {
        const state = this.#state;
        const isReview = state === 'submitted'
            || state === 'under-review'
            || state === 'sent-back';

        return html`
            <div class="action-bar"
                data-project-id="${this.#projectId}">
                ${isReview
                    ? this.#reviewActions()
                    : html``}
                ${state === 'approved'
                    ? this.#approvedActions()
                    : html``}
                ${state === 'approved'
                    || state === 'completed'
                    ? html`<button
                        data-action="view-history">
                        View history
                      </button>`
                    : html``}
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
        const state = this.#state;
        const tooltip = check.ready
            ? ''
            : this.#namesFor(check.problems)
                + ' unscored';
        return html`
            ${state === 'under-review'
                ? html`<button data-action="score">
                    Score
                  </button>`
                : html``}
            <button data-action="approve" ${
                check.ready ? '' : 'disabled'
            } title="${tooltip}">
                Approve
            </button>
            <button data-action="decline">
                Decline
            </button>
            <button data-action="send-back">
                Send back
            </button>
        `;
    }

    #approvedActions(): SafeHtml {
        const check = this.#completionCheck;
        const tooltip = check.ready
            ? ''
            : this.#namesFor(check.problems)
                + ' lack actual measurements';
        return html`
            <button data-action="log-measurement">
                Log measurement
            </button>
            <button data-action="complete" ${
                check.ready ? '' : 'disabled'
            } title="${tooltip}">
                Complete
            </button>
        `;
    }
}
