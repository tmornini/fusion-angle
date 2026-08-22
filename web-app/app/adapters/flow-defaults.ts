import type { GraphNode } from '../../../api/types.ts';
import {
    DEFAULT_NODE_ATTRIBUTES,
    DEFAULT_NODE_MEMBER_IDS,
    DEFAULT_NODE_AGENT_IDS,
    DEFAULT_NODE_TASK_INSTRUCTIONS,
} from '../../../api/types.ts';
import {
    generateIdentifier,
} from '../../../shared/identifier.ts';

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
            id: generateIdentifier(),
            name: 'Create',
            positionX: DEFAULT_START_X,
            positionY: DEFAULT_START_Y,
            isCreate: true,
            isArchive: false,
            memberIds: [
                ...DEFAULT_NODE_MEMBER_IDS,
            ],
            agentIds: [
                ...DEFAULT_NODE_AGENT_IDS,
            ],
            attributes: [
                ...DEFAULT_NODE_ATTRIBUTES,
            ],
            taskInstructions: DEFAULT_NODE_TASK_INSTRUCTIONS,
        },
        complete: {
            id: generateIdentifier(),
            name: 'Archive',
            positionX: DEFAULT_COMPLETE_X,
            positionY: DEFAULT_COMPLETE_Y,
            isCreate: false,
            isArchive: true,
            memberIds: [
                ...DEFAULT_NODE_MEMBER_IDS,
            ],
            agentIds: [
                ...DEFAULT_NODE_AGENT_IDS,
            ],
            attributes: [
                ...DEFAULT_NODE_ATTRIBUTES,
            ],
            taskInstructions: DEFAULT_NODE_TASK_INSTRUCTIONS,
        },
    };
}
