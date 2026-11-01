import { assert, assertStrictEquals } from '@std/assert';
import './hmac-test-key.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { MemoryStorageBackend } from
    '../api/backend-memory.ts';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedPersonIdentity } from
    './identity-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const INVITEE_EMAIL = 'dave@x.com';
const PAINT_DEADLINE_MS = 2000;

// A chip and the cards under it are one paint. The read
// stays held across the click, so the rows of the state
// that was on screen must not appear under the new chip.

class DomElement {
    closest(selector: string): DomElement | null {
        void selector;
        return null;
    }

    getAttribute(name: string): string | null {
        void name;
        return null;
    }
}

class DomHTMLElement extends DomElement {}

class DeclinedChip extends DomHTMLElement {
    override closest(selector: string): DomElement | null {
        return selector === '[data-invitation-state]'
            ? this
            : null;
    }

    override getAttribute(name: string): string | null {
        return name === 'data-invitation-state'
            ? 'declined'
            : null;
    }
}

function chipPressed(html: string, state: string): boolean {
    const marker = 'data-invitation-state="'
        + state + '"';
    const at = html.indexOf(marker);
    if (at < 0) return false;
    const end = html.indexOf('</button>', at);
    return html.slice(at, end).includes(
        'aria-pressed="true"',
    );
}

function makeStorage(): {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
} {
    const storage = new Map<string, string>();
    return {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
            storage.set(key, value);
        },
        removeItem: (key) => {
            storage.delete(key);
        },
    };
}

Deno.test(
    'a state chip does not paint the previous'
    + ' invitations',
    () => withLocalStorageAsync(makeStorage(), async () => {
        const g = globalThis as Record<string, unknown>;
        g['Element'] = DomElement;
        g['HTMLElement'] = DomHTMLElement;
        g['window'] = { addEventListener() {} };
        g['MutationObserver'] = class {
            observe(): void {}
        };
        let sentHtml = '';
        const waiters: Array<(html: string) => void> = [];
        const listeners: Array<{
            type: string;
            fn: EventListener;
        }> = [];
        const sentBox = {
            id: 'sent-invitations-box',
            get innerHTML(): string {
                return sentHtml;
            },
            set innerHTML(value: string) {
                sentHtml = value;
                const pending = waiters.splice(0);
                for (const resolve of pending) {
                    resolve(value);
                }
            },
            classList: { remove() {} },
            addEventListener(
                type: string,
                fn: EventListener,
            ): void {
                listeners.push({ type, fn });
            },
            querySelector: () => null,
            querySelectorAll: () => [],
        };
        const shell = {
            innerHTML: '',
            toggleAttribute() {},
            addEventListener() {},
            querySelector: () => null,
            querySelectorAll: () => [],
        };
        const button = { addEventListener() {} };
        g['document'] = {
            addEventListener() {},
            createElement: () => ({
                className: '',
                setAttribute() {},
            }),
            querySelector: (selector: string) => {
                if (selector === '#organization-content') {
                    return shell;
                }
                if (selector === '#objectives-box') {
                    return shell;
                }
                if (selector === '#sent-invitations-box') {
                    return sentBox;
                }
                if (
                    selector === '[data-action='
                        + '"confirm-add-objective"]'
                    || selector === '[data-action='
                        + '"confirm-edit-objective"]'
                    || selector === '[data-action='
                        + '"confirm-archive"]'
                ) {
                    return button;
                }
                return null;
            },
        };
        const gate: { held: Promise<void> } = {
            held: Promise.resolve(),
        };
        let release = (): void => {};
        let timer: ReturnType<typeof setTimeout>
            | undefined;
        try {
            const db = new BackedDbAdapter(
                new MemoryStorageBackend(),
                () => gate.held,
                () => {},
            );
            await seedAdminSchema(db);
            await seedPersonIdentity(
                db,
                generateIdentifier(),
                {
                    name: 'Dave',
                    email: INVITEE_EMAIL,
                    phone: '',
                    bio: '',
                },
            );
            const { initAdapter } = await import(
                './client-init.ts'
            );
            assertStrictEquals(
                await initAdapter(() => db), true,
            );
            const token = await organizationToken();
            const { getClient } = await import(
                '../web-app/app/client.ts'
            );
            getClient().putSessionToken(token);
            const { inPageContext } = await import(
                './in-page-facade.ts'
            );
            const { postInvitation } = await import(
                '../client/invitations.ts'
            );
            assertStrictEquals(
                await postInvitation(
                    inPageContext(db, token),
                    INVITEE_EMAIL,
                ),
                'sent',
            );
            const { init } = await import(
                '../web-app/organization/index.ts'
            );
            await init();
            assert(
                sentHtml.includes(INVITEE_EMAIL),
                'the pending row names the invitee',
            );
            assert(chipPressed(sentHtml, 'pending'));
            assert(!chipPressed(sentHtml, 'declined'));
            gate.held = new Promise<void>((resolve) => {
                release = resolve;
            });
            const click = listeners.find(
                (item) => item.type === 'click',
            );
            assert(click, 'the sent box has no click');
            click.fn({
                target: new DeclinedChip(),
            } as unknown as Event);
            assert(
                !(
                    chipPressed(sentHtml, 'declined')
                    && sentHtml.includes(INVITEE_EMAIL)
                ),
                'declined chip still shows the'
                + ' pending invitation',
            );
            const settled = new Promise<string>(
                (resolve, reject) => {
                    timer = setTimeout(() => {
                        reject(new Error(
                            'sent invitations did'
                            + ' not repaint',
                        ));
                    }, PAINT_DEADLINE_MS);
                    waiters.push((html) => {
                        clearTimeout(timer);
                        resolve(html);
                    });
                },
            );
            release();
            const html = await settled;
            assert(chipPressed(html, 'declined'));
            assert(!html.includes(INVITEE_EMAIL));
            assert(html.includes(
                'No declined invitations.',
            ));
        } finally {
            release();
            clearTimeout(timer);
            // The held read resumes on a later turn. Let it
            // paint while the stub document still exists.
            for (let i = 0; i < 8; i += 1) {
                await new Promise((resolve) => {
                    setTimeout(resolve, 0);
                });
            }
            const { deleteNotificationChannel } =
                await import(
                    '../client/broadcast-channel.ts'
                );
            deleteNotificationChannel();
            delete g['window'];
            delete g['MutationObserver'];
            delete g['document'];
            delete g['Element'];
            delete g['HTMLElement'];
        }
    }),
);
