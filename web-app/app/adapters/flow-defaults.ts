import type { GraphNode } from '../../../api/types.ts';
import {
    DEFAULT_NODE_DESCRIPTION,
    DEFAULT_NODE_FIELDS,
    DEFAULT_NODE_ASSIGNMENT,
} from '../../../api/types.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';

const DEFAULT_START_NAME = 'Start';
const DEFAULT_COMPLETE_NAME = 'End';
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
            name: DEFAULT_START_NAME,
            description:
                DEFAULT_NODE_DESCRIPTION,
            positionX: DEFAULT_START_X,
            positionY: DEFAULT_START_Y,
            isStart: true,
            isComplete: false,
            crew: DEFAULT_NODE_ASSIGNMENT,
            fields: [...DEFAULT_NODE_FIELDS],
        },
        complete: {
            id: generateCryptoSafeBase62(),
            name: DEFAULT_COMPLETE_NAME,
            description:
                DEFAULT_NODE_DESCRIPTION,
            positionX: DEFAULT_COMPLETE_X,
            positionY: DEFAULT_COMPLETE_Y,
            isStart: false,
            isComplete: true,
            crew: DEFAULT_NODE_ASSIGNMENT,
            fields: [...DEFAULT_NODE_FIELDS],
        },
    };
}
