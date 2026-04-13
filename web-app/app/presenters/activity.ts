import { html, SafeHtml } from '../safe-html';
import { formatDate, displayText } from '../core';
import {
    iconLightbulb,
    iconFolderKanban,
    iconUserPlus,
    iconEdit,
    iconArrowRight,
} from '../icons';
import type { Activity } from '../adapters';

type ActivityType =
    | 'idea_created'
    | 'project_created'
    | 'user_joined'
    | 'status_changed'
    | 'idea_converted';

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
        if (query
            && !this.#activity
                .matchesActor(query)
            && !this.#activity
                .matchesTarget(query))
            return false;
        if (types
            && !types.some(
                t => this.#activity
                    .hasType(t),
            ))
            return false;
        return true;
    }

    buildActivity(): SafeHtml {
        const meta =
            this.#activity.hasStatus()
                ? html`<div
                    class="${
                        'badge badge-default'
                        + ' text-xs mt-1'
                    }">${
                    this.#activity
                        .statusText()
                }</div>`
                : this.#activity
                    .hasComment()
                    ? html`<p
                        class="${
                            'text-sm'
                            + ' text-muted'
                            + ' mt-1 italic'
                        }"
                        >"${
                        this.#activity
                            .commentText()
                    }"</p>`
                    : html``;
        return html`
    <div class="flex items-start gap-4
        p-4 rounded-lg activity-row">
        ${this.#buildIcon()}
        <div class="flex-fill">
            <p class="text-sm">
                <span class="${
                    'font-medium'
                }">${
                    displayText(
                        this.#activity
                            .actorName(),
                    )
                }</span>
                <span class="${
                    'text-muted'
                }"> ${
                    this.#activity
                        .actionText()
                } </span>
                <span class="${
                    'font-medium'
                }">${
                    this.#activity
                        .targetText()
                }</span>
            </p>
            ${meta}
            <p class="${
                'text-xs text-muted mt-1'
            }">${
                formatDate(
                    this.#activity
                        .timestampValue(),
                )
            }</p>
        </div>
    </div>`;
    }

    #buildIcon(): SafeHtml {
        const actType = this.#activity
            .typeValue() as ActivityType;
        const entry =
            ICON_MAP[actType]
            ?? ICON_MAP.idea_created;
        return html`<div class="icon-box"
            data-tone="${entry.tone}">${
            entry.icon(20, '')
        }</div>`;
    }
}
