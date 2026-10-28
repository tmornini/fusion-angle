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
                <div class="navbar-cta">
                    <button class="${
                        'btn btn-ghost'
                    }"
                        data-goto-auth>${
                            'Sign In'
                    }</button>
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
                <div class="${
                    'flex flex-col gap-2'
                }">
                    <button class="${
                        'btn btn-ghost'
                    }"
                        data-goto-auth>${
                            'Sign In'
                    }</button>
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
                    + 'align ideas to strategy '
                    + 'and get them implemented '
                    + 'quickly.'
                }</p>
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
            ${buildSafety()}
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
