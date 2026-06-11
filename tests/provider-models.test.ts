import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    getModelsByProvider,
    findProviderModel,
    isProviderModelId,
} from '../api/provider-models.ts';

test(
    'every model id is 22-char base62 and unique',
    () => {
        const models = [...getModelsByProvider()
            .values()].flat();
        const ids = new Set<string>();
        for (const m of models) {
            assert.match(
                m.id, /^[0-9A-Za-z]{22}$/,
            );
            ids.add(m.id);
        }
        assert.equal(ids.size, models.length);
    },
);

test(
    'isProviderModelId is true for a catalog id'
    + ' and false otherwise',
    () => {
        const first = [...getModelsByProvider()
            .values()][0]![0]!;
        assert.ok(isProviderModelId(first.id));
        assert.ok(!isProviderModelId('nope'));
        assert.ok(!isProviderModelId(''));
    },
);

test(
    'getModelsByProvider groups every model under'
    + ' its own provider',
    () => {
        const byProvider = getModelsByProvider();
        let total = 0;
        for (const [provider, list] of byProvider) {
            for (const m of list) {
                assert.equal(m.provider, provider);
            }
            total += list.length;
        }
        assert.ok(total > 0);
    },
);

test(
    'findProviderModel returns the model by id'
    + ' or undefined when unknown',
    () => {
        const first = [...getModelsByProvider()
            .values()][0]![0]!;
        assert.equal(
            findProviderModel(first.id)?.id,
            first.id,
        );
        assert.equal(
            findProviderModel('missing'), undefined,
        );
    },
);
