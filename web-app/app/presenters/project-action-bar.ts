import { html, type SafeHtml } from '../safe-html.ts';
import type { ProjectEntity } from '../../../api/types.ts';
import type {
    ProjectProblem,
} from '../adapters/project-publish.ts';
import type {
    ValidationResult,
} from '../adapters/validation.ts';

type Check = ValidationResult<ProjectProblem>;

export class ProjectActionBarPresenter {
    readonly #project: ProjectEntity;
    readonly #approvalCheck: Check;
    readonly #completionCheck: Check;

    constructor(
        project: ProjectEntity,
        approvalCheck: Check,
        completionCheck: Check,
    ) {
        this.#project = project;
        this.#approvalCheck = approvalCheck;
        this.#completionCheck = completionCheck;
    }

    buildBar(): SafeHtml {
        const status = this.#project.status;
        const isReview = status === 'submitted'
            || status === 'under-review'
            || status === 'sent-back';

        return html`
            <div class="action-bar"
                data-project-id="${this.#project.id}">
                ${isReview
                    ? this.#reviewActions()
                    : html``}
                ${status === 'approved'
                    ? this.#approvedActions()
                    : html``}
                ${status === 'approved'
                    || status === 'completed'
                    ? html`<button
                        data-action="view-history">
                        View history
                      </button>`
                    : html``}
            </div>
        `;
    }

    #reviewActions(): SafeHtml {
        const check = this.#approvalCheck;
        const tooltip = check.ready
            ? ''
            : `${check.problems.length}`
                + ' objectives unscored';
        return html`
            <button data-action="score">
                Score
            </button>
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
            : `${check.problems.length}`
                + ' objectives lack actual measurements';
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
