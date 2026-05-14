import type { GraphNode } from '../../../api/types.ts';
import {
    DEFAULT_NODE_DESCRIPTION,
    DEFAULT_NODE_FIELDS,
    DEFAULT_NODE_WORKER_IDS,
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
            description:
                DEFAULT_NODE_DESCRIPTION,
            positionX: DEFAULT_START_X,
            positionY: DEFAULT_START_Y,
            isCreate: true,
            isArchive: false,
            workerIds: [...DEFAULT_NODE_WORKER_IDS],
            fields: [...DEFAULT_NODE_FIELDS],
        },
        complete: {
            id: generateCryptoSafeBase62(),
            name: 'Archive',
            description:
                DEFAULT_NODE_DESCRIPTION,
            positionX: DEFAULT_COMPLETE_X,
            positionY: DEFAULT_COMPLETE_Y,
            isCreate: false,
            isArchive: true,
            workerIds: [...DEFAULT_NODE_WORKER_IDS],
            fields: [...DEFAULT_NODE_FIELDS],
        },
    };
}
