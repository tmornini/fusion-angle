import { $, $$, $required } from '../app/dom.ts';
import {
    html,
    setHtml,
    type SafeHtml,
} from '../app/safe-html.ts';
import {
    ICON_SIZE,
    iconLogo,
    iconSparkles,
    iconArrowRight,
    iconMenu,
    iconX,
    iconCheck,
    iconBrain,
    iconPeople,
    iconZap,
    iconShield,
    iconLineChart,
    iconMessageSquare,
} from '../app/icons.ts';
import { putLocation } from '../app/adapters/index.ts';

const features = [
    {
        icon: iconBrain,
        title: 'Intelligent Augmentation',
        description:
            'AI that learns from your'
            + ' expertise and amplifies'
            + ' your decision-making'
            + ' capabilities without'
            + ' replacing human judgment.',
    },
    {
        icon: iconPeople,
        title: 'Collaborative Flows',
        description:
            'Seamlessly integrate AI'
            + ' assistance into your'
            + " team's existing processes"
            + ' with human oversight at'
            + ' every step.',
    },
    {
        icon: iconZap,
        title: 'Real-Time Insights',
        description:
            'Get instant analysis and'
            + ' recommendations while'
            + ' maintaining full control'
            + ' over the final decisions.',
    },
    {
        icon: iconShield,
        title: 'Enterprise Security',
        description:
            'Bank-grade encryption and'
            + ' compliance with SOC 2,'
            + ' GDPR, and HIPAA'
            + ' requirements built-in.',
    },
    {
        icon: iconLineChart,
        title: 'Transparent Analytics',
        description:
            'Understand how AI arrives'
            + ' at its suggestions with'
            + ' clear explanations and'
            + ' confidence scores.',
    },
    {
        icon: iconMessageSquare,
        title: 'Natural Communication',
        description:
            'Interact with AI using'
            + ' natural language. No'
            + ' technical expertise'
            + ' required to get powerful'
            + ' results.',
    },
];

const steps = [
    {
        number: '01',
        title: 'Connect Your Data',
        description:
            'Securely integrate with'
            + ' your existing tools and'
            + ' data sources. Our'
            + ' platform adapts to your'
            + ' infrastructure.',
        points: [
            'One-click integrations',
            'Enterprise SSO',
            'Custom API support',
        ],
    },
    {
        number: '02',
        title: 'Configure Your Flows',
        description:
            'Set up AI-assisted'
            + ' processes that match your'
            + " team's needs with human"
            + ' checkpoints where they'
            + ' matter.',
        points: [
            'Visual flow builder',
            'Role-based permissions',
            'Process automation',
        ],
    },
    {
        number: '03',
        title: 'Amplify Your Team',
        description:
            'Let AI handle routine'
            + ' tasks while your team'
            + ' focuses on high-value'
            + ' decisions and creative'
            + ' work.',
        points: [
            'Real-time collaboration',
            'Smart recommendations',
            'Continuous learning',
        ],
    },
];

const companies = [
    'TechCorp',
    'InnovateLab',
    'DataFlow',
    'NexGen',
    'Synergi',
];

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
                    <a href="#features"
                        class="${
                            'navbar-link'
                        }">${
                            'Features'
                    }</a>
                    <a href="#how-it-works"
                        class="${
                            'navbar-link'
                        }">${
                            'How It Works'
                    }</a>
                    <a href="#about"
                        class="${
                            'navbar-link'
                        }">${
                            'About'
                    }</a>
                </div>
                <div class="navbar-cta">
                    <button class="${
                        'btn btn-ghost'
                    }"
                        data-goto-auth>${
                            'Sign In'
                    }</button>
                    <button class="${
                        'btn btn-primary'
                    }" data-goto-auth>${
                        'Get Started'
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
                <a href="#features"
                    class="navbar-link">${
                        'Features'
                }</a>
                <a href="#how-it-works"
                    class="navbar-link">${
                        'How It Works'
                }</a>
                <a href="#about"
                    class="navbar-link">${
                        'About'
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
                    <button class="${
                        'btn btn-primary'
                    }" data-goto-auth>${
                        'Get Started'
                    }</button>
                </div>
            </div>
        </div>
    </nav>`;
}

function buildCompanyLogos(
    companies: readonly string[],
): SafeHtml {
    return html`${companies.map(
        company =>
            html`<span>${company}</span>`,
    )}`;
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
                <div class="hero-badge">
                    ${iconSparkles(ICON_SIZE.base, '')}
                    <span>${
                        'Human-Intelligence'
                        + ' First'
                    }</span>
                </div>
                <h1 class="${
                    'animate-fade-in-up'
                }">
                    AI That Amplifies
                    <span class="${
                        'highlight'
                    }">${
                        'Human Intelligence'
                    }</span>
                </h1>
                <p class="${
                    'hero-subtitle '
                    + 'animate-fade-in-up'
                }">
                    ${
                        'Fusion Angle puts humans'
                        + ' at the center. Our'
                        + ' platform augments'
                        + ' your expertise with'
                        + ' intelligent'
                        + ' automation, helping'
                        + ' teams make better'
                        + ' decisions faster.'
                    }
                </p>
                <div class="${
                    'hero-buttons '
                    + 'animate-fade-in-up'
                }">
                    <button class="${
                        'btn btn-accent btn-xl'
                    }" data-goto-auth>
                        Start Free Trial ${
                            iconArrowRight(ICON_SIZE.xl, '')
                        }
                    </button>
                    <button class="${
                        'btn btn-outline-hero'
                        + ' btn-xl'
                    }">Watch Demo</button>
                </div>
                <div class="${
                    'hero-trust '
                    + 'animate-fade-in-up'
                }">
                    <p>${
                        'Trusted by'
                        + ' forward-thinking'
                        + ' teams'
                    }</p>
                    <div class="${
                        'hero-trust-logos'
                    }">
                        ${buildCompanyLogos(
                            companies,
                        )}
                    </div>
                </div>
            </div>
        </div>
    </section>`;
}

function buildFeatures(): SafeHtml {
    return html`
    <section id="features" class="${
        'features-section bg-background'
    }">
        <div class="container">
            <div class="section-header">
                <h2>${
                    'Built for the Way'
                    + ' You Work'
                }</h2>
                <p>${
                    'Powerful AI capabilities'
                    + ' designed around human'
                    + ' needs, not the other'
                    + ' way around.'
                }</p>
            </div>
            <div class="${
                'grid grid-cols-1 '
                + 'md:grid-cols-2 '
                + 'lg:grid-cols-3 gap-6'
            }">
                ${features.map(
                    feature => html`
                <div class="${
                    'card card-hover '
                    + 'feature-card'
                }">
                    <div class="${
                        'feature-icon'
                    }">${
                        feature.icon(ICON_SIZE['2xl'], '')
                    }</div>
                    <h3>${
                        feature.title
                    }</h3>
                    <p>${
                        feature.description
                    }</p>
                </div>`,
                )}
            </div>
        </div>
    </section>`;
}

function buildHowItWorks(): SafeHtml {
    return html`
    <section id="how-it-works"
        class="${
            'how-it-works-section'
        }">
        <div class="container">
            <div class="section-header">
                <h2>${
                    'Get Started in Minutes'
                }</h2>
                <p>${
                    'A straightforward path'
                    + ' from setup to value,'
                    + ' with support at every'
                    + ' step.'
                }</p>
            </div>
            <div class="steps-list">
                ${steps.map(
                    stepData => html`
                <div class="step">
                    <div class="${
                        'step-number'
                    }">
                        <span>${
                            stepData.number
                        }</span>
                    </div>
                    <div class="${
                        'card card-flat '
                        + 'step-content p-6'
                    }">
                        <h3>${
                            stepData.title
                        }</h3>
                        <p>${
                            stepData.description
                        }</p>
                        <ul class="${
                            'step-points'
                        }">
                            ${stepData.points.map(
                                point => html`
                            <li class="${
                                'step-point'
                            }">
                                <div class="${
                                    'step-point'
                                    + '-icon'
                                }">${
                                    iconCheck(ICON_SIZE.xs, '')
                                }</div>
                                <span>${
                                    point
                                }</span>
                            </li>`,
                            )}
                        </ul>
                    </div>
                </div>`,
                )}
            </div>
        </div>
    </section>`;
}

function buildCTA(): SafeHtml {
    return html`
    <section class="cta-section">
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
                    'Ready to Transform How'
                    + ' Your Team Works?'
                }</h2>
                <p>${
                    'Join thousands of teams'
                    + ' who use Fusion Angle to'
                    + ' amplify their human'
                    + ' intelligence. Start'
                    + ' your free trial'
                    + ' today — no credit'
                    + ' card required.'
                }</p>
                <div class="cta-buttons">
                    <button class="${
                        'btn btn-accent btn-xl'
                    }" data-goto-auth>
                        Start Free Trial ${
                            iconArrowRight(ICON_SIZE.xl, '')
                        }
                    </button>
                </div>
            </div>
        </div>
    </section>`;
}

function buildFooter(): SafeHtml {
    const year = new Date().getFullYear();
    return html`
    <footer id="about" class="footer">
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
                        'Human-Intelligence'
                        + ' first AI platform.'
                        + ' Amplifying expertise,'
                        + ' not replacing it.'
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
            ${buildFeatures()}
            ${buildHowItWorks()}
            ${buildCTA()}
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
