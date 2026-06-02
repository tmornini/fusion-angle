import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    getProviderModels,
    getModelsByProvider,
    findProviderModel,
    isProviderModelId,
} from '../api/provider-models.ts';

test(
    'every model id is 22-char base62 and unique',
    () => {
        const models = getProviderModels();
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
        const first = getProviderModels()[0]!;
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
        assert.equal(
            total, getProviderModels().length,
        );
    },
);

test(
    'findProviderModel returns the model by id'
    + ' or undefined when unknown',
    () => {
        const first = getProviderModels()[0]!;
        assert.equal(
            findProviderModel(first.id)?.id,
            first.id,
        );
        assert.equal(
            findProviderModel('missing'), undefined,
        );
    },
);
