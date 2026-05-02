import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    TABLE_NAMES,
} from '../../../api/db.ts';

const schemaChanges =
    createSubscriptionChannel(TABLE_NAMES);

export function subscribeSchemaChanges(
    fn: () => void,
): () => void {
    return schemaChanges.subscribe(fn);
}
