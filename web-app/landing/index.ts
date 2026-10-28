import { $, $$, $required } from '../app/dom.ts';
import {
    html,
    setHtml,
    type SafeHtml,
} from '../app/safe-html.ts';
import {
    ICON_SIZE,
    iconLogo,
    iconMenu,
    iconX,
} from '../app/icons.ts';
import { putLocation } from '../app/adapters/index.ts';

export const PILOT_SCHEDULING_URL = '';

const STALLS = [
    'The idea never becomes a case, so nobody can'
        + ' decide.',
    'The approval leaves no record, so nobody can'
        + ' say who agreed to what.',
    'The work scatters across tools, so nobody can'
        + ' see where it piles up.',
] as const;

const SAFETY = [
    {
        title: 'Nothing is overwritten.',
        body:
            'Every change is a new, authored entry'
            + ' in one ledger. Undo is another'
            + ' entry.',
    },
    {
        title: 'Your organization is the boundary.',
        body:
            'Scope comes from the verified sign-in'
            + ' token, never the address bar. Remove'
            + ' a member and their access ends'
            + ' within minutes.',
    },
    {
        title:
            'A foreign write is refused before it'
            + ' exists.',
        body:
            'A write that names a record outside'
            + ' your organization is rejected'
            + ' outright. Nothing is created in'
            + ' your name by accident.',
    },
] as const;

function bookPilot(className: string): SafeHtml {
    return html`<a class="${className}"
        data-book-pilot
        href="${PILOT_SCHEDULING_URL}">${
            'Book a pilot call'
        }</a>`;
}

function buildNavbar(): SafeHtml {
    return html`
    <nav class="navbar" id="navbar">
        <div class="container">
            <div class="navbar-inner">
                <a href="../index.html"
                    class="navbar-logo">
                    <div class="${
                        'navbar-logo-icon'
                    }">${iconLogo(ICON_SIZE['3xl'], '')}</div>
                    <span class="${
                        'navbar-logo-text'
                    }">Fusion Angle</span>
                </a>
                <div class="navbar-links">
                    <a href="#ai"
                        class="navbar-link">${
                            'AI'
                    }</a>
                    <a href="#pilot"
                        class="navbar-link">${
                            'Pilot'
                    }</a>
                </div>
                <div class="navbar-cta">
                    <button class="${
                        'btn btn-ghost'
                    }"
                        data-goto-auth>${
                            'Sign In'
                    }</button>
                    ${bookPilot('btn btn-primary')}
                </div>
                <button class="${
                    'navbar-mobile-toggle'
                }" id="${
                    'mobile-menu-toggle'
                }"
                    aria-label="${
                        'Toggle menu'
                    }">
                    ${iconMenu(ICON_SIZE['2xl'], '')}
                </button>
            </div>
            <div class="${
                'navbar-mobile-menu hidden'
            }" id="mobile-menu">
                <a href="#ai"
                    class="navbar-link">${
                        'AI'
                }</a>
                <a href="#pilot"
                    class="navbar-link">${
                        'Pilot'
                }</a>
                <div class="${
                    'flex flex-col '
                    + 'gap-2 mt-4'
                }">
                    <button class="${
                        'btn btn-ghost'
                    }"
                        data-goto-auth>${
                            'Sign In'
                    }</button>
                    ${bookPilot('btn btn-primary')}
                </div>
            </div>
        </div>
    </nav>`;
}

function buildHero(): SafeHtml {
    return html`
    <section class="hero">
        <div class="hero-bg"></div>
        <div class="${
            'hero-blob hero-blob-1'
        }"></div>
        <div class="${
            'hero-blob hero-blob-2'
        }"></div>
        <div class="container">
            <div class="hero-content">
                <h1 class="${
                    'animate-fade-in-up'
                }">${
                    'Fusion Angle is your '
                    + 'Strategy-to-Change Engine'
                }</h1>
                <p class="${
                    'hero-subtitle '
                    + 'animate-fade-in-up'
                }">${
                    'Ideas are easy and execution '
                    + 'is hard. We make it easy to '
                    + 'align ideas with strategy '
                    + 'and get them implemented '
                    + 'quickly.'
                }</p>
                <div class="${
                    'hero-buttons '
                    + 'animate-fade-in-up'
                }">
                    ${bookPilot(
                        'btn btn-accent btn-xl',
                    )}
                </div>
            </div>
        </div>
    </section>`;
}

function buildStalls(): SafeHtml {
    return html`
    <section id="stalls" class="${
        'features-section bg-background'
    }">
        <div class="container">
            <div class="section-header">
                <h2>${
                    'Most ideas do not fail. They stall.'
                }</h2>
                <p>${STALLS.join(' ')}</p>
            </div>
        </div>
    </section>`;
}

function buildAiSeat(): SafeHtml {
    return html`
    <section id="ai" class="${
        'features-section bg-background'
    }">
        <div class="container">
            <div class="section-header">
                <div class="${
                    'badge badge-outline'
                }">${
                    'Roadmap, shaped with pilots'
                }</div>
                <h2>${
                    'People and AI, same process,'
                    + ' same rules'
                }</h2>
                <p>${
                    'An AI member already holds a'
                    + ' seat on the roster: a name, a'
                    + ' skill focus, and the model'
                    + ' behind it. You can name it on'
                    + ' a step of a flow.'
                }</p>
                <p>${
                    'Next comes the worker. It will'
                    + ' claim a work order at its'
                    + ' step, do the work under the'
                    + ' same validation a person'
                    + ' faces, leave its name on every'
                    + ' change, and hand the order on.'
                    + ' You will correct it in the'
                    + ' same conversation you would'
                    + ' have with a colleague, and'
                    + ' record content will be data'
                    + ' to it, never instruction.'
                }</p>
                <p>${
                    'That is how an AI strategy gets'
                    + ' executed safely: one step at'
                    + ' a time, on a process you drew,'
                    + ' with a ledger of what the'
                    + ' agent did.'
                }</p>
            </div>
        </div>
    </section>`;
}

function buildSafety(): SafeHtml {
    return html`
    <section id="safety" class="${
        'features-section bg-background'
    }">
        <div class="container">
            <div class="section-header">
                <h2>${
                    'Built to be trusted with the'
                    + ' record'
                }</h2>
            </div>
            <div class="${
                'grid grid-cols-1 '
                + 'md:grid-cols-2 '
                + 'lg:grid-cols-3 gap-6'
            }">
                ${SAFETY.map(
                    card => html`
                <div class="${
                    'card card-hover '
                    + 'feature-card'
                }">
                    <h3>${card.title}</h3>
                    <p>${card.body}</p>
                </div>`,
                )}
            </div>
        </div>
    </section>`;
}

function buildPilot(): SafeHtml {
    return html`
    <section id="pilot" class="cta-section">
        <div class="cta-bg"></div>
        <div class="${
            'cta-blob cta-blob-1'
        }"></div>
        <div class="${
            'cta-blob cta-blob-2'
        }"></div>
        <div class="container">
            <div class="cta-content">
                <h2>${
                    'Run a pilot with us'
                }</h2>
                <p>${
                    'We are a small team with a'
                    + ' working product and no'
                    + ' customers yet. A pilot is'
                    + ' one team, one real process,'
                    + ' and the founders on the'
                    + ' call. You get the system and'
                    + ' a direct line to the people'
                    + ' building it. We get the'
                    + ' process that proves the next'
                    + ' step. There is no pricing'
                    + ' page. We work that out'
                    + ' together.'
                }</p>
                <div class="cta-buttons">
                    ${bookPilot(
                        'btn btn-accent btn-xl',
                    )}
                </div>
                <p>${
                    'Already a member? '
                }<a href="${
                    '../auth/index.html'
                }" data-goto-auth>${
                    'Sign in'
                }</a></p>
            </div>
        </div>
    </section>`;
}

function buildFooter(): SafeHtml {
    const year = new Date().getFullYear();
    return html`
    <footer class="footer">
        <div class="container">
            <div class="footer-grid">
                <div class="footer-brand">
                    <div class="${
                        'navbar-logo'
                    }">
                        <div class="${
                            'navbar-logo-icon'
                        }">${iconLogo(ICON_SIZE['3xl'], '')}</div>
                        <span class="${
                            'navbar-logo-text'
                        }">Fusion Angle</span>
                    </div>
                    <p>${
                        'Idea to execution, one system.'
                    }</p>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; ${year} ${
                    'Fusion Angle.'
                    + ' All rights reserved.'
                }</p>
            </div>
        </div>
    </footer>`;
}

export async function init(): Promise<void> {
    const root = $required(
        '#page-root', document,
    );

    setHtml(root, html`
    <div class="${
        'min-h-screen bg-background'
    }">
        ${buildNavbar()}
        <main>
            ${buildHero()}
            ${buildStalls()}
            ${buildAiSeat()}
            ${buildSafety()}
            ${buildPilot()}
        </main>
        ${buildFooter()}
    </div>`);

    const toggle =
        $('#mobile-menu-toggle', document);
    const menu = $('#mobile-menu', document);
    if (toggle && menu) {
        toggle.addEventListener(
            'click',
            () => {
                const nowHidden =
                    menu.classList.toggle(
                        'hidden',
                    );
                setHtml(
                    toggle,
                    nowHidden
                        ? iconMenu(ICON_SIZE['2xl'], '')
                        : iconX(ICON_SIZE['2xl'], ''),
                );
            },
        );
    }

    $$('[data-goto-auth]', document)
        .forEach(el => {
            el.addEventListener(
                'click',
                () => {
                    putLocation('../auth/index.html');
                },
            );
        });
}
