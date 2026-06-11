import {
    $, $inputRequired, $textareaRequired,
    bindEnterToClick,
} from '../app/dom.ts';
import { showToast } from '../app/toast.ts';
import { navigateTo } from '../app/core.ts';
import {
    sessionContext,
    getRecordEntities,
    postRecordChange,
    generateCryptoSafeBase62,
} from '../app/adapters/index.ts';
import {
    nextPosition,
} from '../app/drag-reorder-positions.ts';

export async function init(): Promise<void> {
    $('#record-create-cancel', document)
        ?.addEventListener(
            'click',
            () => navigateTo('records'),
        );

    $('#record-create-submit', document)
        ?.addEventListener(
            'click',
            () => void handleSubmit(),
        );

    bindEnterToClick(
        '#record-create-name',
        '#record-create-submit',
        document,
    );
}

async function handleSubmit(): Promise<void> {
    const nameEl = $inputRequired(
        '#record-create-name', document,
    );
    const descEl = $textareaRequired(
        '#record-create-description', document,
    );
    const name = nameEl.value.trim();
    const description = descEl.value.trim();
    if (name === '') {
        showToast(
            'Record name is required',
            'error',
        );
        return;
    }
    const ctx = sessionContext();
    const existing = await getRecordEntities(ctx);
    const position = nextPosition(
        existing.map(r => r.position),
    );
    const id = generateCryptoSafeBase62();
    await postRecordChange(ctx, id, {
        kind: 'create',
        record: { name, description, position },
        attributes: [],
        initialState: 'active',
    });
    navigateTo('record-detail', { id });
}
