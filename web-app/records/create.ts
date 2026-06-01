import {
    $, $input, $textarea, bindEnterToClick,
} from '../app/dom.ts';
import { showToast } from '../app/toast.ts';
import { navigateTo } from '../app/core.ts';
import {
    createRequestContext,
    getRecordRows,
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
    );
}

async function handleSubmit(): Promise<void> {
    const nameEl = $input(
        '#record-create-name', document,
    );
    const descEl = $textarea(
        '#record-create-description', document,
    );
    const name = (nameEl?.value ?? '').trim();
    const description =
        (descEl?.value ?? '').trim();
    if (name === '') {
        showToast(
            'Record name is required',
            'error',
        );
        return;
    }
    const ctx = createRequestContext();
    const existing = await getRecordRows(ctx);
    const position = nextPosition(
        existing.map(r => r.position),
    );
    const id = generateCryptoSafeBase62();
    try {
        await postRecordChange(ctx, id, {
            kind: 'create',
            record: { name, description, position },
            attributes: [],
            initialState: 'active',
        });
    } catch (err) {
        showToast(
            'Failed to create Record',
            'error',
        );
        return;
    }
    navigateTo('record-detail', { id });
}
