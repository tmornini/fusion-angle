import { $, $input } from '../app/dom.ts';
import {
    html,
    setHtml,
    trusted,
} from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import {
    iconLogo,
    iconArrowRight,
    iconLoader,
} from '../app/icons.ts';
import { navigateTo } from '../app/core.ts';
import { log } from '../app/logger.ts';
import { getViewportWidth } from '../app/adapters/index.ts';
import {
    getDbAdapter,
    getSessionToken,
    setSessionToken,
    sessionHasReachableOrg,
} from '../app/adapters/init.ts';
import {
    createRequestContext,
} from '../app/adapters/shared.ts';
import {
    loginViaPassword,
} from '../app/adapters/authentication.ts';
import {
    putSessionCredentials,
} from '../app/adapters/session-credentials.ts';
import type {
    SessionCredentials,
} from '../app/adapters/session-credentials.ts';
import { decodeReturnTarget } from '../app/auth-redirect.ts';
import { getUrlParam } from '../app/adapters/url-params.ts';

function validateEmail(
    email: string,
): string | null {
    if (!email.trim()) {
        return 'Email is required';
    }
    if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            email.trim(),
        )
    ) {
        return 'Please enter a valid'
            + ' email address';
    }
    return null;
}

function validatePassword(
    password: string,
): string | null {
    if (!password) {
        return 'Password is required';
    }
    if (password.length < 6) {
        return 'Password must be at least'
            + ' 6 characters';
    }
    return null;
}

export async function init(): Promise<void> {
    const root = $('#page-root', document);
    if (!root) return;

    setHtml(root, html`
    <div class="${
        'min-h-screen flex bg-background'
    }">
        <div class="auth-branding hidden"
            id="auth-branding">
            <div class="${
                'auth-branding-content'
            }">
                <div class="mb-8">
                    <div class="${
                        'flex items-center '
                        + 'gap-3 mb-6'
                    }">
                        <div class="${
                            'auth-brand-icon'
                        }">
                            ${iconLogo(24, '')}
                        </div>
                        <span class="${
                            'text-3xl '
                            + 'font-display '
                            + 'font-bold '
                            + 'auth-brand-name'
                        }">Fusion AI</span>
                    </div>
                </div>
                <h1 class="${
                    'font-display font-bold '
                    + 'auth-headline'
                }">
                    ${
                        'Transform your business'
                        + ' with intelligent'
                        + ' automation'
                    }
                </h1>
                <p class="auth-subhead">
                    ${
                        'Join thousands of'
                        + ' companies using'
                        + ' Fusion AI to'
                        + ' streamline operations,'
                        + ' boost productivity,'
                        + ' and unlock new'
                        + ' possibilities.'
                    }
                </p>
                <div class="${
                    'flex gap-8 mt-12'
                }">
                    <div>
                        <div class="${
                            'text-3xl '
                            + 'font-display '
                            + 'font-bold '
                            + 'auth-stat-value'
                        }">10K+</div>
                        <div class="${
                            'text-sm '
                            + 'auth-stat-label'
                        }">Active Users</div>
                    </div>
                    <div>
                        <div class="${
                            'text-3xl '
                            + 'font-display '
                            + 'font-bold '
                            + 'auth-stat-value'
                        }">98%</div>
                        <div class="${
                            'text-sm '
                            + 'auth-stat-label'
                        }">Satisfaction</div>
                    </div>
                    <div>
                        <div class="${
                            'text-3xl '
                            + 'font-display '
                            + 'font-bold '
                            + 'auth-stat-value'
                        }">50+</div>
                        <div class="${
                            'text-sm '
                            + 'auth-stat-label'
                        }">Integrations</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="auth-form-wrapper"
            id="auth-form-wrapper">
            <div class="auth-form-card">
                <div class="${
                    'flex items-center gap-3 '
                    + 'mb-8 justify-center'
                }" id="mobile-logo">
                    <div class="${
                        'flex items-center '
                        + 'justify-center '
                        + 'auth-mobile-logo'
                    }">
                        ${iconLogo(20, '')}
                    </div>
                    <span class="${
                        'text-2xl font-display '
                        + 'font-bold '
                        + 'text-foreground'
                    }">Fusion AI</span>
                </div>

                <div class="card p-8">
                    <div class="${
                        'text-center mb-8'
                    }">
                        <h2 class="${
                            'text-2xl '
                            + 'font-display '
                            + 'font-bold '
                            + 'text-foreground '
                            + 'mb-2'
                        }" id="auth-title">${
                            'Welcome back'
                        }</h2>
                        <p class="text-muted"
                            id="${
                                'auth-subtitle'
                            }">${
                                'Sign in to your'
                                + ' account to'
                                + ' continue'
                        }</p>
                    </div>

                    <form id="auth-form"
                        class="${
                            'flex flex-col '
                            + 'gap-5'
                        }"
                        novalidate>
                        <div>
                            <label class="${
                                'label mb-2 '
                                + 'block'
                            }" for="email">${
                                'Email'
                            }</label>
                            <input class="input"
                                id="email"
                                name="username"
                                type="email"
                                placeholder="${
                                    'you@company'
                                    + '.com'
                                }"
                                autocomplete="${
                                    'username'
                                }" />
                            <p class="${
                                'text-sm '
                                + 'text-error '
                                + 'mt-1 hidden'
                            }" id="${
                                'email-error'
                            }"></p>
                        </div>

                        <div>
                            <label class="${
                                'label mb-2 '
                                + 'block'
                            }" for="password">${
                                'Password'
                            }</label>
                            <input class="input"
                                id="password"
                                name="password"
                                type="password"
                                placeholder="${
                                    '\u2022\u2022'
                                    + '\u2022\u2022'
                                    + '\u2022\u2022'
                                    + '\u2022\u2022'
                                }"
                                autocomplete="${
                                    'current-'
                                    + 'password'
                                }" />
                            <p class="${
                                'text-sm '
                                + 'text-error '
                                + 'mt-1 hidden'
                            }" id="${
                                'password-error'
                            }"></p>
                        </div>

                        <div id="${
                            'company-field'
                        }"
                            class="${
                                'hidden '
                                + 'animate-fade-in'
                            }">
                            <label class="${
                                'label mb-2 '
                                + 'block'
                            }" for="${
                                'companyName'
                            }">
                                Company name
                                <span class="${
                                    'text-muted'
                                }">${
                                    '(optional)'
                                }</span>
                            </label>
                            <input class="input"
                                id="${
                                    'companyName'
                                }"
                                name="${
                                    'companyName'
                                }"
                                type="text"
                                placeholder="${
                                    'Acme Inc.'
                                }"
                                autocomplete="${
                                    'organization'
                                }" />
                        </div>

                        <button type="submit"
                            class="${
                                'btn btn-primary'
                                + ' w-full'
                                + ' auth-submit-btn'
                            }" id="submit-btn">
                            Sign in ${
                                iconArrowRight(20, '')
                            }
                        </button>
                    </form>

                    <div class="${
                        'mt-6 text-center'
                    }">
                        <p class="text-muted">
                            <span id="${
                                'toggle-prompt'
                            }">${
                                "Don't have"
                                + ' an account?'
                            }</span>
                            <button type="button"
                                class="${
                                    'text-primary'
                                    + ' font-'
                                    + 'medium ml-2'
                                    + ' btn-link'
                                }"
                                id="${
                                    'toggle-mode'
                                }">${
                                    'Sign up'
                            }</button>
                        </p>
                    </div>
                </div>

                <p class="${
                    'mt-6 text-center '
                    + 'text-sm text-muted'
                }">
                    ${
                        'By continuing, you'
                        + ' agree to our Terms'
                        + ' of Service and'
                        + ' Privacy Policy.'
                    }
                </p>
            </div>
        </div>
    </div>`);

    let isLogin = true;

    const form = $('#auth-form', document);
    const emailInput = $input('#email', document);
    const passwordInput =
        $input('#password', document);
    const emailError = $('#email-error', document);
    const passwordError =
        $('#password-error', document);
    const companyField =
        $('#company-field', document);
    const toggleMode = $('#toggle-mode', document);
    const togglePrompt =
        $('#toggle-prompt', document);
    const authTitle = $('#auth-title', document);
    const authSubtitle =
        $('#auth-subtitle', document);
    const submitBtn = $('#submit-btn', document);

    const branding = $('#auth-branding', document);
    if (
        branding
        && getViewportWidth() >= 1024
    ) {
        branding.classList.remove('hidden');
        branding.style.display = '';
    }
    const mobileLogo = $('#mobile-logo', document);
    if (
        mobileLogo
        && getViewportWidth() >= 1024
    ) {
        mobileLogo.classList.add('hidden');
    }

    if (
        !form
        || !emailInput
        || !passwordInput
        || !emailError
        || !passwordError
        || !companyField
        || !toggleMode
        || !togglePrompt
        || !authTitle
        || !authSubtitle
        || !submitBtn
    ) {
        return;
    }

    const updateMode = (): void => {
        authTitle.textContent = isLogin
            ? 'Welcome back'
            : 'Get started';
        authSubtitle.textContent = isLogin
            ? 'Sign in to your account'
                + ' to continue'
            : 'Create your account and'
                + ' start your journey';
        companyField.classList.toggle(
            'hidden',
            isLogin,
        );
        togglePrompt.textContent = isLogin
            ? "Don't have an account?"
            : 'Already have an account?';
        toggleMode.textContent = isLogin
            ? 'Sign up'
            : 'Sign in';
        setHtml(
            submitBtn,
            html`${
                isLogin
                    ? 'Sign in'
                    : 'Create account'
            } ${iconArrowRight(20, '')}`,
        );
        emailInput.setAttribute(
            'autocomplete',
            isLogin ? 'username' : 'email',
        );
        passwordInput.setAttribute(
            'autocomplete',
            isLogin
                ? 'current-password'
                : 'new-password',
        );
    };

    toggleMode.addEventListener(
        'click',
        () => {
            isLogin = !isLogin;
            if (form instanceof HTMLFormElement) {
                form.reset();
            }
            emailInput.classList.remove(
                'error',
            );
            passwordInput.classList.remove(
                'error',
            );
            emailError.classList.add(
                'hidden',
            );
            passwordError.classList.add(
                'hidden',
            );
            updateMode();
        },
    );

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        emailError.classList.add('hidden');
        passwordError.classList.add(
            'hidden',
        );

        const email = emailInput.value;
        const password =
            passwordInput.value;

        const emailErr =
            validateEmail(email);
        const passErr =
            validatePassword(password);

        if (emailErr) {
            emailError.textContent =
                emailErr;
            emailError.classList.remove(
                'hidden',
            );
            emailInput.classList.add(
                'input-error',
            );
        } else {
            emailInput.classList.remove(
                'input-error',
            );
        }

        if (passErr) {
            passwordError.textContent =
                passErr;
            passwordError.classList.remove(
                'hidden',
            );
            passwordInput.classList.add(
                'input-error',
            );
        } else {
            passwordInput.classList.remove(
                'input-error',
            );
        }

        if (emailErr || passErr) return;

        const savedBtn = submitBtn.innerHTML;
        setHtml(
            submitBtn,
            iconLoader(
                20,
                'animate-spin-slow',
            ),
        );
        submitBtn.setAttribute(
            'disabled',
            '',
        );

        setTimeout(async () => {
            if (isLogin) {
                // A recovery-free context: login establishes a
                // NEW session and must not refresh-recover the
                // OLD one on a 401 (a wrong password).
                let creds: SessionCredentials | null;
                try {
                    creds = await loginViaPassword(
                        createRequestContext(
                            getDbAdapter(), getSessionToken()),
                        email, password,
                    );
                } catch (err) {
                    // A THROWN login is a fault (DB/crypto), not
                    // a wrong password — which returns null. Do
                    // not leave the button spinning: restore it
                    // and surface the failure visibly.
                    log.error('login failed', 'auth', err);
                    setHtml(submitBtn, trusted(savedBtn));
                    submitBtn.removeAttribute('disabled');
                    showToast(
                        'Something went wrong signing in.'
                        + ' Please try again.',
                        'error',
                    );
                    return;
                }
                if (creds === null) {
                    setHtml(submitBtn, trusted(savedBtn));
                    submitBtn.removeAttribute('disabled');
                    passwordError.textContent =
                        'Invalid email or password.';
                    passwordError.classList.remove(
                        'hidden',
                    );
                    passwordInput.classList.add(
                        'input-error',
                    );
                    return;
                }
                // Persist BEFORE navigating: navigateTo hard-
                // reloads, wiping the in-memory token holder —
                // only the persisted blob survives to re-
                // establish the session at boot.
                putSessionCredentials(creds);
                setSessionToken(creds.accessToken);
                // A zero-membership identity reaches no org and
                // would 403 every org-scoped route; land it on
                // its pending invitations instead of the return
                // target's dead end.
                if (!sessionHasReachableOrg()) {
                    navigateTo('invitations');
                    return;
                }
                const dest = decodeReturnTarget(
                    getUrlParam('return'),
                );
                navigateTo(dest.page, dest.params);
                return;
            }
            // Real sign-up (identity + credential creation) is
            // SP-6. Until then DO NOT mock-establish a session:
            // a bare mock with no refresh token bounces on
            // reload and would admit anyone to the seeded
            // admin's data. Nudge to sign-in instead.
            submitBtn.removeAttribute('disabled');
            showToast(
                'Sign-up is coming soon — sign in with a'
                + ' seeded account.',
                'info',
            );
            isLogin = true;
            updateMode();
        }, 800);
    });
}
