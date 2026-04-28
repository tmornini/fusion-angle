import { html, SafeHtml } from '../safe-html.ts';
import { formatDate, displayText } from '../core.ts';
import {
    iconLightbulb,
    iconFolderKanban,
    iconUserPlus,
    iconEdit,
    iconArrowRight,
} from '../icons.ts';
import type {
    Activity,
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
    readonly #activity: Activity;

    constructor(activity: Activity) {
        this.#activity = activity;
    }

    matchesFilter(
        query: string,
        types:
            readonly string[]
            | undefined,
    ): boolean {
        if (query) {
            if (
                !this.#activity.matchesQuery(
                    query,
                )
            ) {
                return false;
            }
        }
        if (types
            && !this.#activity.matchesTypes(
                types,
            )
        ) return false;
        return true;
    }

    buildActivity(): SafeHtml {
        const a = this.#activity;
        const meta = html`${
            a.hasStatus()
                ? html`<div
                    class="${
                        'badge badge-default'
                        + ' text-xs mt-1'
                    }">${
                    a.statusText()
                }</div>`
                : html``
        }${
            a.hasFeedback()
                ? html`<p
                    class="${
                        'text-sm'
                        + ' text-muted'
                        + ' mt-1 italic'
                    }"
                    >"${
                    a.feedbackText()
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
                    displayText(a.actorText())
                }</span>
                <span class="${
                    'text-muted'
                }"> ${
                    a.actionText()
                } </span>
                <span class="${
                    'font-medium'
                }">${
                    a.targetText()
                }</span>
            </p>
            ${meta}
            <p class="${
                'text-xs text-muted mt-1'
            }">${
                formatDate(
                    a.timestampText(),
                )
            }</p>
        </div>
    </div>`;
    }

    #buildIcon(): SafeHtml {
        const entry =
            ICON_MAP[this.#activity.typeValue()];
        return html`<div class="icon-box"
            data-tone="${entry.tone}">${
            entry.icon(20, '')
        }</div>`;
    }
}
