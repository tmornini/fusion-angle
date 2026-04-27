import { html, SafeHtml } from '../safe-html.ts';
import { formatDate, displayText } from '../core.ts';
import {
    iconLightbulb,
    iconFolderKanban,
    iconUserPlus,
    iconEdit,
    iconArrowRight,
} from '../icons.ts';
import { isActivityType } from '../adapters/index.ts';
import type {
    ActivityEntity,
    ActivityType,
} from '../adapters/index.ts';

type IconTone =
    'primary' | 'success' | 'warning' | 'info';

type IconEntry = {
    icon: (
        size: number,
        cssClass: string,
    ) => SafeHtml;
    tone: IconTone;
};

const ICON_MAP: Record<
    ActivityType,
    IconEntry
> = {
    idea_created: {
        icon: iconLightbulb,
        tone: 'warning',
    },
    project_created: {
        icon: iconFolderKanban,
        tone: 'primary',
    },
    user_joined: {
        icon: iconUserPlus,
        tone: 'info',
    },
    status_changed: {
        icon: iconEdit,
        tone: 'warning',
    },
    idea_converted: {
        icon: iconArrowRight,
        tone: 'success',
    },
};

export class ActivityPresenter {
    readonly #entity: ActivityEntity;
    readonly #type: ActivityType;
    readonly #actor: string;

    constructor(
        entity: ActivityEntity,
        actor: string,
    ) {
        if (!isActivityType(entity.type)) {
            throw new Error(
                'Unknown activity type: '
                + entity.type,
            );
        }
        this.#entity = entity;
        this.#type = entity.type;
        this.#actor = actor;
    }

    matchesFilter(
        query: string,
        types:
            readonly string[]
            | undefined,
    ): boolean {
        if (query) {
            const q = query.toLowerCase();
            const hitsActor =
                this.#actor
                    .toLowerCase()
                    .includes(q);
            const hitsTarget =
                this.#entity.target
                    .toLowerCase()
                    .includes(q);
            if (!hitsActor && !hitsTarget) {
                return false;
            }
        }
        if (types
            && !types.includes(this.#type))
            return false;
        return true;
    }

    buildActivity(): SafeHtml {
        const hasStatus =
            this.#entity.status !== '';
        const hasFeedback =
            this.#entity.feedback !== '';
        const meta = html`${
            hasStatus
                ? html`<div
                    class="${
                        'badge badge-default'
                        + ' text-xs mt-1'
                    }">${
                    this.#entity.status
                }</div>`
                : html``
        }${
            hasFeedback
                ? html`<p
                    class="${
                        'text-sm'
                        + ' text-muted'
                        + ' mt-1 italic'
                    }"
                    >"${
                    this.#entity.feedback
                }"</p>`
                : html``
        }`;
        return html`
    <div class="flex items-start gap-4
        p-4 rounded-lg activity-row">
        ${this.#buildIcon()}
        <div class="flex-fill">
            <p class="text-sm">
                <span class="${
                    'font-medium'
                }">${
                    displayText(this.#actor)
                }</span>
                <span class="${
                    'text-muted'
                }"> ${
                    this.#entity.action
                } </span>
                <span class="${
                    'font-medium'
                }">${
                    this.#entity.target
                }</span>
            </p>
            ${meta}
            <p class="${
                'text-xs text-muted mt-1'
            }">${
                formatDate(
                    this.#entity.timestamp,
                )
            }</p>
        </div>
    </div>`;
    }

    #buildIcon(): SafeHtml {
        const entry = ICON_MAP[this.#type];
        return html`<div class="icon-box"
            data-tone="${entry.tone}">${
            entry.icon(20, '')
        }</div>`;
    }
}
