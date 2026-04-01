import {
    html, SafeHtml,
} from '../safe-html';
import {
    iconUser, iconMessageSquare,
    iconFileText,
    iconLightbulb, iconChevronRight,
    iconUsers,
} from '../icons';
import { formatDate } from '../core';
import {
    clarificationIsPending,
} from '../../../api/types';
import type {
    EngineeringView,
    EngTeamMember,
} from '../adapters/projects';
import {
    Clarification,
} from '../adapters/projects';

interface ClarificationData {
    readonly questionText: string;
    readonly askerName: string;
    readonly askedAtDate: string;
    readonly isPending: boolean;
    readonly hasAnswer: boolean;
    readonly answerText: string;
    readonly answeredByName: string;
    readonly answeredAtDate: string;
}

export class EngineeringPresenter {
    readonly #title: string;
    readonly #timeline: string;
    readonly #budget: string;
    readonly #problemStatement: string;
    readonly #expectedOutcome: string;
    readonly #successMetrics:
        readonly string[];
    readonly #constraints:
        readonly string[];
    readonly #teamMembers:
        readonly EngTeamMember[];
    readonly #hasLinkedIdea: boolean;
    readonly #linkedIdeaHref: string;
    readonly #linkedIdeaTitle: string;
    readonly #pendingCount: number;
    readonly #answeredCount: number;
    readonly #clarifications:
        readonly ClarificationData[];

    constructor(
        view: EngineeringView,
        clarifications:
            readonly Clarification[],
    ) {
        this.#title = view.title;
        this.#timeline = view.timeline();
        this.#budget = view.budget();
        this.#problemStatement =
            view.problemStatement();
        this.#expectedOutcome =
            view.expectedOutcome();
        this.#successMetrics =
            view.successMetrics();
        this.#constraints =
            view.constraints();
        this.#teamMembers =
            view.teamMembers();
        this.#hasLinkedIdea =
            view.hasLinkedIdea();
        this.#linkedIdeaHref =
            view.linkedIdeaHref();
        this.#linkedIdeaTitle =
            view.linkedIdeaTitle();
        const pending =
            clarifications.filter(
                clarificationIsPending,
            ).length;
        this.#pendingCount = pending;
        this.#answeredCount =
            clarifications.length
            - pending;
        this.#clarifications =
            clarifications.map(c => ({
                questionText:
                    c.questionText(),
                askerName:
                    c.askerName(),
                askedAtDate:
                    c.askedAtDate(),
                isPending:
                    clarificationIsPending(
                        c,
                    ),
                hasAnswer:
                    c.hasAnswer(),
                answerText:
                    c.answerText(),
                answeredByName:
                    c.answeredByName(),
                answeredAtDate:
                    c.answeredAtDate(),
            }));
    }

    title(): string {
        return this.#title;
    }

    timeline(): string {
        return this.#timeline;
    }

    budget(): string {
        return this.#budget;
    }

    problemStatement(): string {
        return this.#problemStatement;
    }

    expectedOutcome(): string {
        return this.#expectedOutcome;
    }

    successMetrics(): readonly string[] {
        return this.#successMetrics;
    }

    constraints(): readonly string[] {
        return this.#constraints;
    }

    pendingCount(): number {
        return this.#pendingCount;
    }

    answeredCount(): number {
        return this.#answeredCount;
    }

    #buildTeamMember(
        m: EngTeamMember,
    ): SafeHtml {
        const isBusiness =
            m.type === 'business';
        const bgColor = isBusiness
            ? 'hsl(var(--primary)/0.1)'
            : 'hsl(var(--success-soft))';
        const iconClass = isBusiness
            ? 'text-primary'
            : 'text-success';
        const badgeClass = isBusiness
            ? 'badge-primary'
            : 'badge-success';
        return html`
            <div
                class="${
                    'flex '
                    + 'items-center'
                    + ' gap-3'
                }"
                style="${
                    'padding:'
                    + '0.75rem;'
                    + 'border-'
                    + 'radius:'
                    + '0.5rem;'
                    + 'background:'
                    + 'hsl(var('
                    + '--muted)'
                    + '/0.3)'
                }">
                <div style="${
                    'width:'
                    + '2.5rem;'
                    + 'height:'
                    + '2.5rem;'
                    + 'border-'
                    + 'radius:'
                    + '9999px;'
                    + 'display:'
                    + 'flex;'
                    + 'align-'
                    + 'items:'
                    + 'center;'
                    + 'justify-'
                    + 'content:'
                    + 'center;'
                    + 'background:'
                    + bgColor
                }">
                    ${iconUser(
                        20, iconClass,
                    )}
                </div>
                <div
                    style="${
                        'flex:1;'
                        + 'min-'
                        + 'width:0'
                    }">
                    <p class="${
                        'font-'
                        + 'medium'
                    }">
                        ${m.name}
                    </p>
                    <p class="${
                        'text-xs '
                        + 'text-'
                        + 'muted'
                    }">
                        ${m.role}
                    </p>
                </div>
                <span class="${
                    'badge '
                    + badgeClass
                    + ' text-xs'
                }">
                    ${m.type}
                </span>
            </div>
        `;
    }

    buildTeamGrid(): SafeHtml {
        return html`
            <div class="${
                'card p-6 mb-6'
            }">
                <h3 class="${
                    'flex items-center '
                    + 'gap-2 text-lg '
                    + 'font-display '
                    + 'font-semibold mb-4'
                }">
                    ${iconUsers(
                        20, 'text-primary',
                    )}
                    Team Contacts
                </h3>
                <div class="${
                    'convert-grid'
                }"
                    style="${
                        'gap:0.75rem'
                    }">
                    ${this.#teamMembers
                        .map(
                            m => this
                                .#buildTeamMember(
                                    m,
                                ),
                        )}
                </div>
            </div>`;
    }

    buildLinkedIdeaCard(): SafeHtml {
        if (!this.#hasLinkedIdea)
            return html``;
        return html`
            <div class="${
                'card p-6 mb-8'
            }">
                <h3 class="${
                    'flex items-center '
                    + 'gap-2 text-lg '
                    + 'font-display '
                    + 'font-semibold mb-4'
                }">
                    ${iconFileText(
                        20, 'text-primary',
                    )}
                    Source Idea
                </h3>
                <a href="${
                    this.#linkedIdeaHref
                }"
                    class="${
                        'flex items-center '
                        + 'justify-between'
                    }"
                    style="${
                        'padding:1rem;'
                        + 'border-radius:'
                        + '0.5rem;'
                        + 'background:'
                        + 'hsl(var(--muted)'
                        + '/0.3);'
                        + 'text-decoration:'
                        + 'none;'
                        + 'color:inherit'
                    }">
                    <div
                        class="${
                            'flex '
                            + 'items-center '
                            + 'gap-3'
                        }">
                        <div style="${
                            'padding:'
                            + '0.5rem;'
                            + 'border-'
                            + 'radius:'
                            + '0.5rem;'
                            + 'background:'
                            + 'hsl(var('
                            + '--primary)'
                            + '/0.1)'
                        }">
                            ${iconLightbulb(
                                20,
                                'text-primary',
                            )}
                        </div>
                        <div>
                            <p class="${
                                'font-medium'
                            }">
                                ${this
                                    .#linkedIdeaTitle}
                            </p>
                            <p class="${
                                'text-xs '
                                + 'text-muted'
                            }">
                                View original
                                idea
                            </p>
                        </div>
                    </div>
                    ${iconChevronRight(
                        20, 'text-muted',
                    )}
                </a>
            </div>`;
    }

    #buildAnswer(
        c: ClarificationData,
    ): SafeHtml {
        if (!c.hasAnswer)
            return html``;
        return html`
            <div style="${
                'margin-left:2.5rem;'
                + 'margin-top:1rem;'
                + 'padding:0.75rem;'
                + 'border-radius:'
                + '0.5rem;'
                + 'background:'
                + 'hsl(var(--muted)'
                + '/0.5);'
                + 'border-left:'
                + '2px solid '
                + 'hsl(var(--primary))'
            }">
                <div class="${
                    'flex items-center '
                    + 'gap-2 mb-1'
                }">
                    <span class="${
                        'font-medium'
                    }">
                        ${c.answeredByName}
                    </span>
                    <span class="${
                        'text-xs '
                        + 'text-muted'
                    }">
                        ${formatDate(
                            c.answeredAtDate,
                        )}
                    </span>
                </div>
                <p>${
                    c.answerText
                }</p>
            </div>`;
    }

    buildClarification(
        c: ClarificationData,
    ): SafeHtml {
        const borderColor = c.isPending
            ? 'hsl(var(--warning)/0.3)'
            : 'hsl(var(--border))';
        const bgStyle = c.isPending
            ? 'background:'
                + 'hsl(var(--warning)'
                + '/0.05)'
            : '';
        return html`
            <div class="card"
                style="${
                    'border:1px solid '
                    + borderColor + ';'
                    + bgStyle
                    + ';padding:1rem'
                }">
                <div
                    class="${
                        'flex items-start '
                        + 'gap-3 mb-3'
                    }">
                    <div style="${
                        'padding:0.5rem;'
                        + 'border-radius:'
                        + '9999px;'
                        + (c.isPending
                            ? 'background:'
                                + 'hsl(var('
                                + '--warning'
                                + ')/0.1)'
                            : 'background:'
                                + 'hsl(var('
                                + '--muted))')
                    }">
                        ${iconMessageSquare(
                            16,
                            c.isPending
                                ? 'text-'
                                    + 'warning'
                                : 'text-'
                                    + 'muted',
                        )}
                    </div>
                    <div style="flex:1">
                        <div class="${
                            'flex '
                            + 'items-center '
                            + 'gap-2 mb-1'
                        }">
                            <span class="${
                                'font-medium'
                            }">
                                ${c.askerName}
                            </span>
                            <span class="${
                                'text-xs '
                                + 'text-muted'
                            }">
                                ${formatDate(
                                    c.askedAtDate,
                                )}
                            </span>
                            <span class="${
                                'badge '
                                + (c.isPending
                                    ? 'badge-'
                                        + 'warning'
                                    : 'badge-'
                                        + 'success')
                                + ' text-xs'
                            }">
                                ${c.isPending
                                    ? 'Awaiting'
                                        + ' response'
                                    : 'Answered'}
                            </span>
                        </div>
                        <p>${
                            c.questionText
                        }</p>
                    </div>
                </div>
                ${this.#buildAnswer(c)}
            </div>`;
    }

    buildClarificationList():
        SafeHtml {
        return html`${
            this.#clarifications.map(
                c => this
                    .buildClarification(c),
            )
        }`;
    }
}
