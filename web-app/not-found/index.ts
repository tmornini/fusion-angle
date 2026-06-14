import { $required } from '../app/dom.ts';
import { html, setHtml } from '../app/safe-html.ts';
import { ICON_SIZE, iconSparkles } from '../app/icons.ts';

export async function init(): Promise<void> {
    const root = $required(
        '#page-root', document,
    );

    setHtml(root, html`
    <div class="${
        'flex min-h-screen '
        + 'items-center justify-center'
        + ' bg-background'
    }">
        <div class="${
            'text-center max-w-sm p-8'
        }">
            <div class="icon-box-lg mb-6"
                data-tone="primary">
                ${iconSparkles(
                    ICON_SIZE['3xl'], 'text-primary',
                )}
            </div>
            <h1 class="${
                'text-4xl font-display '
                + 'font-bold mb-2'
            }">
                404
            </h1>
            <p class="text-muted mb-6">
                ${"The page you're looking"
                + " for doesn't exist or"
                + ' has been moved.'}
            </p>
            <a href="${
                '../landing/index.html'
            }"
                class="btn btn-primary">
                Return to Home
            </a>
        </div>
    </div>`);
}
