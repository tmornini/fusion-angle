import {
    html, trusted,
} from '../safe-html';
import type { SafeHtml } from '../safe-html';
import type { GraphField } from '../adapters';

const FIELD_HTML_TYPE: Record<
    string,
    { type: string; extra?: string }
> = {
    text: { type: 'text' },
    number: { type: 'number' },
    date: { type: 'date' },
    email: { type: 'email' },
    url: { type: 'url' },
    phone: { type: 'tel' },
    currency: {
        type: 'number',
        extra: 'step="0.01"',
    },
    checkbox: { type: 'checkbox' },
    file: { type: 'file' },
    image: {
        type: 'file',
        extra: 'accept="image/*"',
    },
};

export function buildFieldInputHtml(
    field: GraphField,
): SafeHtml {
    const id = field.id;
    const requiredAttr = field.isRequired
        ? trusted('required')
        : html``;
    if (field.fieldType === 'textarea') {
        return html`<textarea
            class="input"
            rows="3"
            data-field-id="${id}"
            ${requiredAttr}></textarea>`;
    }
    if (field.fieldType === 'select') {
        return html`<select
            class="input"
            data-field-id="${id}"
            ${requiredAttr}>
            <option value="">
                Select...
            </option>
            ${field.options.map(
                o => html`<option
                    value="${o}"
                    >${o}</option>`,
            )}
        </select>`;
    }
    if (
        field.fieldType === 'radio'
        || field.fieldType
            === 'multi_select'
    ) {
        const inputType =
            field.fieldType === 'radio'
                ? 'radio' : 'checkbox';
        return html`<div
            class="flex flex-col
                gap-2">
            ${field.options.map(
                o => html`<label
                    class="flex
                        items-center
                        gap-2">
                    <input
                        type="${inputType}"
                        name="${id}"
                        value="${o}"
                        data-field-id
                            ="${id}" />
                    ${o}
                </label>`,
            )}
        </div>`;
    }
    const spec =
        FIELD_HTML_TYPE[field.fieldType];
    if (!spec) {
        return html`<input
            type="text"
            class="input"
            data-field-id="${id}"
            ${requiredAttr} />`;
    }
    if (spec.type === 'checkbox') {
        return html`<input
            type="checkbox"
            data-field-id="${id}"
            ${requiredAttr} />`;
    }
    const extra = spec.extra
        ? trusted(spec.extra)
        : html``;
    return html`<input
        type="${spec.type}"
        class="input"
        data-field-id="${id}"
        ${extra}
        ${requiredAttr} />`;
}
