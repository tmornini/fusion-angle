import type { GraphNode } from '../../../api/types.ts';
import {
    DEFAULT_NODE_ATTRIBUTES,
    DEFAULT_NODE_MEMBER_IDS,
    DEFAULT_NODE_TASK_INSTRUCTIONS,
} from '../../../api/types.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';

const DEFAULT_START_X = -300;
const DEFAULT_START_Y = 0;
const DEFAULT_COMPLETE_X = 300;
const DEFAULT_COMPLETE_Y = 200;

export function buildStartAndCompleteNodes(): {
    start: GraphNode;
    complete: GraphNode;
} {
    return {
        start: {
            id: generateCryptoSafeBase62(),
            name: 'Create',
            positionX: DEFAULT_START_X,
            positionY: DEFAULT_START_Y,
            isCreate: true,
            isArchive: false,
            memberIds: [
                ...DEFAULT_NODE_MEMBER_IDS,
            ],
            attributes: [
                ...DEFAULT_NODE_ATTRIBUTES,
            ],
            taskInstructions: DEFAULT_NODE_TASK_INSTRUCTIONS,
        },
        complete: {
            id: generateCryptoSafeBase62(),
            name: 'Archive',
            positionX: DEFAULT_COMPLETE_X,
            positionY: DEFAULT_COMPLETE_Y,
            isCreate: false,
            isArchive: true,
            memberIds: [
                ...DEFAULT_NODE_MEMBER_IDS,
            ],
            attributes: [
                ...DEFAULT_NODE_ATTRIBUTES,
            ],
            taskInstructions: DEFAULT_NODE_TASK_INSTRUCTIONS,
        },
    };
}
