import { html, type SafeHtml } from '../safe-html.ts';
import { ICON_SIZE, iconCopy } from '../icons.ts';
import type {
    SeededCredentials,
} from '../../../api/mock-data.ts';

// The clipboard payload for the "copy all" button — one
// credential per line, tab-separated, in the order the panel
// shows them. DEMO-ONLY (see credentialRevealPanel).
export function credentialsCopyText(
    creds: SeededCredentials,
): string {
    return creds.identities
        .map(c => `${c.username}\t${c.password}`)
        .join('\n');
}

// One-time reveal of the freshly-seeded demo sign-ins. The
// plaintext passwords live only here and in the surfacing
// response — only their PBKDF2 hashes are stored. html``
// escapes every interpolated value, so a hostile password
// cannot inject markup; `trusted` is deliberately never used.
// DEMO-ONLY: this panel and its in-band plaintext are deleted
// at the server tier.
export function credentialRevealPanel(
    creds: SeededCredentials,
): SafeHtml {
    const lines = creds.identities.map(c => html`
        <div class="credential-reveal-line">
            <span class="credential-reveal-user">${
                c.username
            }</span>
            <span class="credential-reveal-secret">${
                c.password
            }</span>
        </div>`);
    return html`
        <section class="credential-reveal"
            data-tone="warning" role="status">
            <div class="credential-reveal-head">
                <h3 class="credential-reveal-title">
                    Save your demo sign-ins
                </h3>
                <button class="btn btn-outline btn-sm gap-2"
                    id="credential-copy-all-btn"
                    type="button">
                    ${iconCopy(ICON_SIZE.sm, '')} Copy all
                </button>
            </div>
            <p class="credential-reveal-note">
                Shown once and never stored — copy them now,
                they cannot be recovered.
            </p>
            <div class="credential-reveal-box">
                ${lines}
            </div>
        </section>`;
}
