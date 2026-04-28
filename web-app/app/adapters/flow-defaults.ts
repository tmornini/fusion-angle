import type { GraphNode } from '../../../api/types.ts';
import {
    DEFAULT_NODE_DESCRIPTION,
    DEFAULT_NODE_FIELDS,
} from '../../../api/types.ts';
import { generateId } from './uuid.ts';

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
            id: generateId(),
            name: DEFAULT_START_NAME,
            description:
                DEFAULT_NODE_DESCRIPTION,
            positionX: DEFAULT_START_X,
            positionY: DEFAULT_START_Y,
            isStart: true,
            isComplete: false,
            fields: [...DEFAULT_NODE_FIELDS],
        },
        complete: {
            id: generateId(),
            name: DEFAULT_COMPLETE_NAME,
            description:
                DEFAULT_NODE_DESCRIPTION,
            positionX: DEFAULT_COMPLETE_X,
            positionY: DEFAULT_COMPLETE_Y,
            isStart: false,
            isComplete: true,
            fields: [...DEFAULT_NODE_FIELDS],
        },
    };
}
