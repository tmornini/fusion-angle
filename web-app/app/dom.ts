import type { SafeHtml } from './safe-html';
import { setHtml } from './safe-html';

export function $(
    selector: string,
    parent: ParentNode = document,
): HTMLElement | null {
    return parent.querySelector(selector);
}

export function $$(
    selector: string,
    parent: ParentNode = document,
): HTMLElement[] {
    return Array.from(parent.querySelectorAll(selector));
}

export function $input(
    selector: string,
    parent: ParentNode = document,
): HTMLInputElement | null {
    return parent
        .querySelector<HTMLInputElement>(selector);
}

export function $select(
    selector: string,
    parent: ParentNode = document,
): HTMLSelectElement | null {
    return parent
        .querySelector<HTMLSelectElement>(selector);
}

export function $textarea(
    selector: string,
    parent: ParentNode = document,
): HTMLTextAreaElement | null {
    return parent
        .querySelector<HTMLTextAreaElement>(
            selector,
        );
}

export function attr(el: Element, name: string): string {
    return el.getAttribute(name) ?? '';
}

export function populateIcons(entries: Array<[string, SafeHtml]>): void {
    for (const [selector, icon] of entries) {
        const el = $(selector);
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
    const buttons = $$(selector);
    for (const btn of buttons) {
        btn.addEventListener('click', () => {
            const value = btn.getAttribute(attrName) ?? '';
            for (const b of buttons) b.classList.toggle('active', b === btn);
            onChange(value);
        });
    }
}

