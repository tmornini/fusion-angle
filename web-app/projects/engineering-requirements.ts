import { $, $textarea } from '../app/dom';
import {
    html, setHtml,
} from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton, buildErrorState,
} from '../app/loading-states';
import {
    iconArrowLeft, iconLightbulb,
    iconTarget,
    iconMessageSquare, iconAlertTriangle,
    iconCheckCircle2, iconSend,
    iconClock,
    iconDollarSign,
} from '../app/icons';
import { navigateTo } from '../app/core';
import {
    getProjectForEngineering,
    getClarificationsByProjectId,
} from '../app/adapters';
import {
    EngineeringPresenter,
} from '../app/presenters';

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const projectId =
        params?.['projectId'];
    if (!projectId) {
        navigateTo('projects');
        return;
    }

    const root = $(
        '#engineering-requirements'
            + '-content',
        document,
    );
    if (!root) return;
    setHtml(
        root,
        buildSkeleton('detail', 4),
    );

    let presenter:
        EngineeringPresenter;
    try {
        const [view, clarifications] =
            await Promise.all([
                getProjectForEngineering(
                    projectId,
                ),
                getClarificationsByProjectId(
                    projectId,
                ),
            ]);
        presenter =
            new EngineeringPresenter(
                view, clarifications,
            );
    } catch {
        setHtml(
            root,
            buildErrorState(
                'Failed to load'
                + ' engineering'
                + ' requirements.',
                'Try Again',
            ),
        );
        root
            .querySelector(
                '[data-retry-btn]',
            )
            ?.addEventListener(
                'click',
                () => init(),
            );
        return;
    }

    const pendingCount =
        presenter.pendingCount();
    const answeredCount =
        presenter.answeredCount();

    setHtml(root, html`
        <div style="${
            'max-width:56rem;'
            + 'margin:0 auto'
        }">
            <div class="${
                'flex items-center '
                + 'gap-2 text-sm '
                + 'text-muted mb-4'
            }">
                <a href="${
                    '../projects/'
                    + 'index.html'
                }"
                    class="hover-link">
                    Projects
                </a><span>/</span>
                <a href="${
                    '../projects/'
                    + 'detail.html?'
                    + 'projectId='
                    + projectId
                }"
                    class="hover-link">
                    ${presenter.title()}
                </a><span>/</span>
                <span>
                    Engineering
                    Requirements
                </span>
            </div>

            <div
                class="${
                    'flex items-center '
                    + 'gap-4 mb-8'
                }">
                <button
                    class="${
                        'btn btn-ghost '
                        + 'btn-icon'
                    }"
                    id="${
                        'requirements-back'
                    }">
                    ${iconArrowLeft(
                        20, '',
                    )}
                </button>
                <div>
                    <h1 class="${
                        'text-2xl '
                        + 'font-display '
                        + 'font-bold mb-2'
                    }">
                        Engineering
                        Requirements
                    </h1>
                    <p class="${
                        'text-muted'
                    }">
                        Business context
                        and clarifications
                        for
                        ${presenter.title()}
                    </p>
                </div>
            </div>

            <div class="${
                'stats-grid mb-8'
            }">
                <div class="card p-4">
                    <div class="${
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
                            ${iconClock(
                                20,
                                'text-primary',
                            )}
                        </div>
                        <div>
                            <p class="${
                                'text-lg '
                                + 'font-bold'
                            }">
                                ${presenter
                                    .timeline()}
                            </p>
                            <p class="${
                                'text-xs '
                                + 'text-muted'
                            }">
                                Timeline
                            </p>
                        </div>
                    </div>
                </div>
                <div class="card p-4">
                    <div class="${
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
                            ${iconDollarSign(
                                20,
                                'text-primary',
                            )}
                        </div>
                        <div>
                            <p class="${
                                'text-lg '
                                + 'font-bold'
                            }">
                                ${presenter
                                    .budget()}
                            </p>
                            <p class="${
                                'text-xs '
                                + 'text-muted'
                            }">
                                Budget
                            </p>
                        </div>
                    </div>
                </div>
                <div class="card p-4">
                    <div class="${
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
                            + '--warning)'
                            + '/0.1)'
                        }">
                            ${iconMessageSquare(
                                20,
                                'text-warning',
                            )}
                        </div>
                        <div>
                            <p class="${
                                'text-lg '
                                + 'font-bold'
                            }">
                                ${pendingCount}
                            </p>
                            <p class="${
                                'text-xs '
                                + 'text-muted'
                            }">
                                Pending
                                Questions
                            </p>
                        </div>
                    </div>
                </div>
                <div class="card p-4">
                    <div class="${
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
                            + '--success-'
                            + 'soft))'
                        }">
                            ${iconCheckCircle2(
                                20,
                                'text-success',
                            )}
                        </div>
                        <div>
                            <p class="${
                                'text-lg '
                                + 'font-bold'
                            }">
                                ${answeredCount}
                            </p>
                            <p class="${
                                'text-xs '
                                + 'text-muted'
                            }">
                                Answered
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="${
                'card p-6 mb-6'
            }">
                <h3 class="${
                    'flex items-center '
                    + 'gap-2 text-lg '
                    + 'font-display '
                    + 'font-semibold mb-4'
                }">
                    ${iconLightbulb(
                        20, 'text-primary',
                    )}
                    Business Context
                </h3>
                <div style="${
                    'display:flex;'
                    + 'flex-direction:'
                    + 'column;'
                    + 'gap:1.5rem'
                }">
                    <div>
                        <h4 class="${
                            'text-sm '
                            + 'font-'
                            + 'semibold '
                            + 'mb-2'
                        }">
                            Problem
                            Statement
                        </h4>
                        <p class="${
                            'text-muted'
                        }">
                            ${presenter
                                .problemStatement()}
                        </p>
                    </div>
                    <div>
                        <h4 class="${
                            'text-sm '
                            + 'font-'
                            + 'semibold '
                            + 'mb-2'
                        }">
                            Expected
                            Outcome
                        </h4>
                        <p class="${
                            'text-muted'
                        }">
                            ${presenter
                                .expectedOutcome()}
                        </p>
                    </div>
                </div>
            </div>

            <div class="${
                'card p-6 mb-6'
            }">
                <h3 class="${
                    'flex items-center '
                    + 'gap-2 text-lg '
                    + 'font-display '
                    + 'font-semibold mb-4'
                }">
                    ${iconTarget(
                        20, 'text-success',
                    )}
                    Success Metrics
                </h3>
                <div style="${
                    'display:flex;'
                    + 'flex-direction:'
                    + 'column;'
                    + 'gap:0.5rem'
                }">
                    ${presenter
                        .successMetrics()
                        .map(
                        (m: string) => html`
                        <div class="${
                            'flex '
                            + 'items-start'
                            + ' gap-2'
                        }">
                            ${iconCheckCircle2(
                                16,
                                'text-success',
                            )}
                            <span>${
                                m
                            }</span>
                        </div>
                    `)}
                </div>
            </div>

            <div class="${
                'card p-6 mb-6'
            }">
                <h3 class="${
                    'flex items-center '
                    + 'gap-2 text-lg '
                    + 'font-display '
                    + 'font-semibold mb-4'
                }">
                    ${iconAlertTriangle(
                        20, 'text-warning',
                    )}
                    Constraints &amp;
                    Requirements
                </h3>
                <div style="${
                    'display:flex;'
                    + 'flex-direction:'
                    + 'column;'
                    + 'gap:0.5rem'
                }">
                    ${presenter
                        .constraints()
                        .map(
                        (c: string) => html`
                        <div class="${
                            'flex '
                            + 'items-start'
                            + ' gap-2'
                        }">
                            <span class="${
                                'text-warning'
                            }">&bull;</span>
                            <span>${
                                c
                            }</span>
                        </div>
                    `)}
                </div>
            </div>

            ${presenter
                .buildTeamGrid()}

            ${presenter
                .buildLinkedIdeaCard()}

            <div style="${
                'margin-bottom:2rem'
            }">
                <h2 class="${
                    'text-xl '
                    + 'font-display '
                    + 'font-semibold mb-4 '
                    + 'flex items-center '
                    + 'gap-2'
                }">
                    ${iconMessageSquare(
                        20, 'text-primary',
                    )}
                    Clarifications
                </h2>
                <div class="card"
                    style="${
                        'padding:1rem;'
                        + 'margin-bottom:'
                        + '1rem'
                    }">
                    <textarea class="${
                        'textarea'
                    }"
                        id="${
                            'requirements-'
                            + 'question'
                        }"
                        placeholder="${
                            'Ask a clarifying'
                            + ' question to'
                            + ' the business'
                            + ' team...'
                        }"
                        style="${
                            'min-height:'
                            + '5rem;'
                            + 'resize:none;'
                            + 'margin-'
                            + 'bottom'
                            + ':0.75rem'
                        }">
                    </textarea>
                    <div style="${
                        'display:flex;'
                        + 'justify-'
                        + 'content:'
                        + 'flex-end'
                    }">
                        <button
                            class="${
                                'btn '
                                + 'btn-primary'
                                + ' gap-2'
                            }"
                            id="${
                                'requirements'
                                + '-send'
                            }"
                            disabled>
                            ${iconSend(
                                16, '',
                            )} Send Question
                        </button>
                    </div>
                </div>
                <div style="${
                    'display:flex;'
                    + 'flex-direction:'
                    + 'column;'
                    + 'gap:1rem'
                }"
                    id="${
                        'requirements-'
                        + 'thread'
                    }">
                    ${presenter
                        .buildClarificationList()}
                </div>
            </div>

            <div class="${
                'flex items-center '
                + 'justify-between'
            }"
                style="${
                    'padding:1rem;'
                    + 'border-radius:'
                    + '0.75rem;'
                    + 'background:'
                    + 'hsl(var(--muted)'
                    + '/0.3);'
                    + 'border:1px solid '
                    + 'hsl(var(--border))'
                }">
                <span class="${
                    'text-sm text-muted'
                }">
                    ${pendingCount > 0
                        ? pendingCount
                            + ' '
                            + (pendingCount
                                === 1
                                ? 'question'
                                : 'questions')
                            + ' awaiting'
                            + ' business'
                            + ' response'
                        : 'All questions '
                            + 'have been'
                            + ' answered'}
                </span>
                <div class="${
                    'flex gap-3'
                }">
                    <button class="${
                        'btn btn-outline'
                    }"
                        id="${
                            'requirements-'
                            + 'back-footer'
                        }">
                        Back to Project
                    </button>
                    <button
                        class="${
                            'btn '
                            + 'btn-primary '
                            + 'gap-2'
                        }"
                        id="${
                            'requirements-'
                            + 'complete'
                        }">
                        ${iconCheckCircle2(
                            16, '',
                        )}
                        Mark Requirements
                        Complete
                    </button>
                </div>
            </div>
        </div>`);

    const questionField = $textarea(
        '#requirements-question',
        document,
    );
    const sendButton = $(
        '#requirements-send',
        document,
    );
    questionField?.addEventListener(
        'input',
        () => {
            if (
                sendButton instanceof
                    HTMLButtonElement
            )
                sendButton.disabled =
                    !questionField
                        .value.trim();
        },
    );
    sendButton?.addEventListener(
        'click',
        () => {
            showToast(
                'Question sent to'
                + ' business team',
                'success',
            );
            if (questionField)
                questionField.value = '';
            if (
                sendButton instanceof
                    HTMLButtonElement
            )
                sendButton.disabled =
                    true;
        },
    );

    $(
        '#requirements-complete',
        document,
    )?.addEventListener(
        'click',
        () => {
            showToast(
                'Requirements marked'
                + ' as complete',
                'success',
            );
            navigateTo(
                'project-detail',
                { projectId },
            );
        },
    );

    $(
        '#requirements-back',
        document,
    )?.addEventListener(
        'click',
        () => navigateTo(
            'project-detail',
            { projectId },
        ),
    );
    $(
        '#requirements-back-footer',
        document,
    )?.addEventListener(
        'click',
        () => navigateTo(
            'project-detail',
            { projectId },
        ),
    );
}
