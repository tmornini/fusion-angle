import type { SafeHtml } from './safe-html.ts';
import { setHtml } from './safe-html.ts';

export function $(
    selector: string,
    parent: ParentNode,
): HTMLElement | null {
    return parent.querySelector(selector);
}

export function $$(
    selector: string,
    parent: ParentNode,
): HTMLElement[] {
    return Array.from(parent.querySelectorAll(selector));
}

export function $button(
    selector: string,
    parent: ParentNode,
): HTMLButtonElement | null {
    return parent
        .querySelector<HTMLButtonElement>(selector);
}

export function $input(
    selector: string,
    parent: ParentNode,
): HTMLInputElement | null {
    return parent
        .querySelector<HTMLInputElement>(selector);
}

export function $select(
    selector: string,
    parent: ParentNode,
): HTMLSelectElement | null {
    return parent
        .querySelector<HTMLSelectElement>(selector);
}

export function $textarea(
    selector: string,
    parent: ParentNode,
): HTMLTextAreaElement | null {
    return parent
        .querySelector<HTMLTextAreaElement>(
            selector,
        );
}

export function $required(
    selector: string,
    parent: ParentNode,
): HTMLElement {
    const el =
        parent.querySelector<HTMLElement>(
            selector,
        );
    if (!el) {
        throw new Error(
            'Required element not'
            + ' found: ' + selector,
        );
    }
    return el;
}

export function $inputRequired(
    selector: string,
    parent: ParentNode,
): HTMLInputElement {
    const el =
        parent.querySelector<HTMLInputElement>(
            selector,
        );
    if (!el) {
        throw new Error(
            'Required input not'
            + ' found: ' + selector,
        );
    }
    return el;
}

export function $textareaRequired(
    selector: string,
    parent: ParentNode,
): HTMLTextAreaElement {
    const el =
        parent.querySelector<HTMLTextAreaElement>(
            selector,
        );
    if (!el) {
        throw new Error(
            'Required textarea not'
            + ' found: ' + selector,
        );
    }
    return el;
}

export function isFormField(
    el: unknown,
): el is HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement {
    return el instanceof HTMLInputElement
        || el instanceof HTMLSelectElement
        || el instanceof HTMLTextAreaElement;
}

export function createElement<
    K extends keyof HTMLElementTagNameMap
>(
    tag: K,
): HTMLElementTagNameMap[K] {
    return document.createElement(tag);
}

export function getRequiredAttribute(
    el: Element,
    name: string,
): string {
    const value = el.getAttribute(name);
    if (value === null) {
        throw new Error(
            `Missing attribute "${name}"`
            + ` on <${el.tagName.toLowerCase()}>`,
        );
    }
    return value;
}

export function populateIcons(entries: Array<[string, SafeHtml]>): void {
    for (const [selector, icon] of entries) {
        const el = $(selector, document);
        if (el) setHtml(el, icon);
    }
}

export function mutateSlot(
    container: HTMLElement,
    cls: string,
    markup: SafeHtml,
): void {
    setHtml($required(cls, container), markup);
}

export const FOCUSABLE_SELECTOR =
    'a[href], button, input,'
    + ' select, textarea,'
    + ' [tabindex]:not([tabindex="-1"])';

export function bindEnterToClick(
    inputSel: string,
    btnSel: string,
    root: ParentNode,
): void {
    $input(inputSel, root)
        ?.addEventListener(
            'keydown',
            (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    $(btnSel, root)
                        ?.click();
                }
            },
        );
}
