import type { SafeHtml } from './safe-html';
import { setHtml } from './safe-html';

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

export function attr(
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

export const FOCUSABLE_SELECTOR =
    'a[href], button, input,'
    + ' select, textarea,'
    + ' [tabindex]:not([tabindex="-1"])';

export function initToggleGroup(
    selector: string,
    attrName: string,
    onChange: (value: string) => void,
): void {
    const buttons = $$(selector, document);
    for (const btn of buttons) {
        btn.addEventListener('click', () => {
            const value = attr(btn, attrName);
            for (const b of buttons) b.classList.toggle('active', b === btn);
            onChange(value);
        });
    }
}

export function bindEnterToClick(
    inputSel: string,
    btnSel: string,
    root: ParentNode = document,
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
