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

type IconEntry = {
    icon: (
        size: number,
        cssClass: string,
    ) => SafeHtml;
    bg: string;
};

const ICON_MAP: Record<
    ActivityType,
    IconEntry
> = {
    idea_created: {
        icon: iconLightbulb,
        bg: 'background:'
            + 'hsl(var(--warning-soft));'
            + 'color:'
            + 'hsl(var(--warning-text))',
    },
    project_created: {
        icon: iconFolderKanban,
        bg: 'background:'
            + 'hsl(var(--primary) / 0.1);'
            + 'color:'
            + 'hsl(var(--primary))',
    },
    user_joined: {
        icon: iconUserPlus,
        bg: 'background:'
            + 'hsl(var(--info-soft));'
            + 'color:'
            + 'hsl(var(--info-text))',
    },
    status_changed: {
        icon: iconEdit,
        bg: 'background:'
            + 'hsl(var(--warning-soft));'
            + 'color:'
            + 'hsl(var(--warning-text))',
    },
    idea_converted: {
        icon: iconArrowRight,
        bg: 'background:'
            + 'hsl(var(--success-soft));'
            + 'color:'
            + 'hsl(var(--success-text))',
    },
};

export class ActivityPresenter {
    readonly #type: string;
    readonly #action: string;
    readonly #target: string;
    readonly #timestamp: string;
    readonly #status: string;
    readonly #comment: string;
    readonly #actor: string;

    constructor(activity: Activity) {
        this.#type = activity.type;
        this.#action = activity.action;
        this.#target = activity.target;
        this.#timestamp =
            activity.timestamp;
        this.#status = activity.status;
        this.#comment = activity.comment;
        this.#actor = activity.actor;
    }

    matchesFilter(
        query: string,
        types:
            readonly string[]
            | undefined,
    ): boolean {
        if (query
            && !this.#actor
                .toLowerCase()
                .includes(query)
            && !this.#target
                .toLowerCase()
                .includes(query))
            return false;
        if (types
            && !types.includes(
                this.#type,
            ))
            return false;
        return true;
    }

    buildActivity(): SafeHtml {
        const meta = this.#status
                ? html`<div
                    class="${
                        'badge badge-default'
                        + ' text-xs mt-1'
                    }">${
                    this.#status
                }</div>`
                : this.#comment
                    ? html`<p
                        class="${
                            'text-sm'
                            + ' text-muted'
                            + ' mt-1'
                        }"
                        style="${
                            'font-style'
                            + ':italic'
                        }"
                        >"${
                        this.#comment
                    }"</p>`
                    : html``;
        return html`
    <div class="flex items-start gap-4
        p-4 rounded-lg activity-row">
        ${this.#buildIcon()}
        <div style="flex:1;min-width:0">
            <p class="text-sm">
                <span class="${
                    'font-medium'
                }">${
                    displayText(
                        this.#actor,
                    )
                }</span>
                <span class="${
                    'text-muted'
                }"> ${
                    this.#action
                } </span>
                <span class="${
                    'font-medium'
                }">${
                    this.#target
                }</span>
            </p>
            ${meta}
            <p class="${
                'text-xs text-muted mt-1'
            }">${
                formatDate(
                    this.#timestamp,
                )
            }</p>
        </div>
    </div>`;
    }

    #buildIcon(): SafeHtml {
        const actType =
            this.#type as ActivityType;
        const entry =
            ICON_MAP[actType]
            ?? ICON_MAP.idea_created;
        return html`<div style="${
            'width:2.5rem;'
            + 'height:2.5rem;'
            + 'border-radius:'
            + 'var(--radius-lg);'
            + 'display:flex;'
            + 'align-items:center;'
            + 'justify-content:center;'
            + 'flex-shrink:0;'
            + entry.bg
        }">${
            entry.icon(20, '')
        }</div>`;
    }
}
