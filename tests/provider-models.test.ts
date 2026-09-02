import { assert, assertMatch, assertStrictEquals } from '@std/assert';
import {
    getModelsByProvider,
    findProviderModel,
    isProviderModelId,
} from '../api/provider-models.ts';

Deno.test(
    'every model id is 22-char base62 and unique',
    () => {
        const models = [...getModelsByProvider()
            .values()].flat();
        const ids = new Set<string>();
        for (const m of models) {
            assertMatch(
                m.id, /^[0-9A-Za-z]{22}$/,
            );
            ids.add(m.id);
        }
        assertStrictEquals(ids.size, models.length);
    },
);

Deno.test(
    'isProviderModelId is true for a catalog id'
    + ' and false otherwise',
    () => {
        const first = [...getModelsByProvider()
            .values()][0]![0]!;
        assert(isProviderModelId(first.id));
        assert(!isProviderModelId('nope'));
        assert(!isProviderModelId(''));
    },
);

Deno.test(
    'getModelsByProvider groups every model under'
    + ' its own provider',
    () => {
        const byProvider = getModelsByProvider();
        let total = 0;
        for (const [provider, list] of byProvider) {
            for (const m of list) {
                assertStrictEquals(m.provider, provider);
            }
            total += list.length;
        }
        assert(total > 0);
    },
);

Deno.test(
    'findProviderModel returns the model by id'
    + ' or undefined when unknown',
    () => {
        const first = [...getModelsByProvider()
            .values()][0]![0]!;
        assertStrictEquals(
            findProviderModel(first.id)?.id,
            first.id,
        );
        assertStrictEquals(
            findProviderModel('missing'), undefined,
        );
    },
);
