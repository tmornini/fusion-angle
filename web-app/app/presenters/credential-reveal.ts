import { html, type SafeHtml } from '../safe-html.ts';
import type { SeededAdmin } from '../../../api/mock-data.ts';

// One-time reveal of the freshly-seeded admin credentials. The
// password lives only here and in the surfacing response — only
// its PBKDF2 hash is stored. html`` escapes every interpolated
// value, so a hostile password cannot inject markup; `trusted`
// is deliberately never used here.
export function credentialRevealPanel(
    admin: SeededAdmin,
): SafeHtml {
    return html`
        <section class="credential-reveal"
            data-tone="warning" role="status">
            <h3 class="credential-reveal-title">
                Save your admin sign-in
            </h3>
            <p class="credential-reveal-note">
                Shown once and never stored — copy the
                password now, it cannot be recovered.
            </p>
            <dl class="credential-reveal-fields">
                <dt>Username</dt>
                <dd>${admin.adminUsername}</dd>
                <dt>Password</dt>
                <dd class="credential-reveal-secret">${
                    admin.adminPassword
                }</dd>
            </dl>
        </section>`;
}
