import {
    POST, PUT, DELETE,
} from '../../../api/api';
import type {
    UndoStep,
} from '../flow-undo';

export async function executeUndoSteps(
    steps: UndoStep[],
): Promise<void> {
    for (const step of steps) {
        switch (step.op) {
            case 'post':
                await POST<void>(
                    step.resource,
                    step.body,
                );
                break;
            case 'put':
                await PUT(
                    step.resource,
                    step.body,
                );
                break;
            case 'delete':
                await DELETE(step.resource);
                break;
        }
    }
}
