import { $$, $required } from '../app/dom.ts';
import {
    html,
    setHtml,
    type SafeHtml,
} from '../app/safe-html.ts';
import {
    ICON_SIZE,
    iconLogo,
} from '../app/icons.ts';
import { putLocation } from '../app/adapters/index.ts';

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
                <div class="hero-mark">${
                    iconLogo(ICON_SIZE['6xl'], '')
                }</div>
                <h1 class="${
                    'animate-fade-in-up'
                }">${
                    'Fusion Angle'
                }<br>${
                    'Strategy-to-Change Engine'
                }</h1>
                <p class="${
                    'hero-subtitle '
                    + 'animate-fade-in-up'
                }">${
                    'Ideas are easy and execution is hard.'
                }<br>${
                    'We make it easy to align ideas to '
                    + 'strategy and get them '
                    + 'implemented quickly.'
                }</p>
                <div class="hero-actions">
                    <a class="${
                        'btn btn-primary btn-lg'
                    }" href="index.html">${
                        'Sign Up'
                    }</a>
                    <button class="${
                        'btn btn-ink btn-lg'
                    }"
                        data-goto-auth>${
                            'Sign In'
                    }</button>
                </div>
            </div>
        </div>
    </section>`;
}

export async function init(): Promise<void> {
    const root = $required(
        '#page-root', document,
    );

    setHtml(root, html`
    <div class="${
        'min-h-screen bg-background'
    }">
        <main>
            ${buildHero()}
        </main>
    </div>`);

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
