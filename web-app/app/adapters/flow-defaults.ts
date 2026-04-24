import type { GraphNode } from '../../../api/types';

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
            id: crypto.randomUUID(),
            name: DEFAULT_START_NAME,
            description: '',
            positionX: DEFAULT_START_X,
            positionY: DEFAULT_START_Y,
            isStart: true,
            isComplete: false,
            fields: [],
        },
        complete: {
            id: crypto.randomUUID(),
            name: DEFAULT_COMPLETE_NAME,
            description: '',
            positionX: DEFAULT_COMPLETE_X,
            positionY: DEFAULT_COMPLETE_Y,
            isStart: false,
            isComplete: true,
            fields: [],
        },
    };
}
