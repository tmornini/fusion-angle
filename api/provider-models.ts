import type {
    ModelId,
    ProviderModel,
} from './types.ts';

// Code-resident, not a DB table: the single source
// of truth the AI-worker validation gate checks
// `model` membership against.
const PROVIDER_MODELS: readonly ProviderModel[] = [
    {
        id: 'mnte677fU2G1V2B9vJp9z7',
        provider: 'Anthropic',
        name: 'Claude Opus 4.8',
        api_name: 'claude-opus-4-8',
    },
    {
        id: 'VIdXPkkC1H1xjav2aTKW3u',
        provider: 'Anthropic',
        name: 'Claude Sonnet 4.6',
        api_name: 'claude-sonnet-4-6',
    },
    {
        id: 'GAP8SsdtGNzocMmVB4otE3',
        provider: 'Anthropic',
        name: 'Claude Haiku 4.5',
        api_name: 'claude-haiku-4-5-20251001',
    },
    {
        id: 'B3yjKd4NnpGhVRrY6plL0o',
        provider: 'OpenAI',
        name: 'GPT-5.5',
        api_name: 'gpt-5.5',
    },
    {
        id: 'GCZAp9iRS5aeuKTRcq0dbM',
        provider: 'OpenAI',
        name: 'GPT-5.4',
        api_name: 'gpt-5.4',
    },
    {
        id: 'zRP3NFhPERUjRgavk6Gtms',
        provider: 'OpenAI',
        name: 'GPT-5.4 mini',
        api_name: 'gpt-5.4-mini',
    },
    {
        id: 'GI19ucwHLOy7ecnQOtD27v',
        provider: 'xAI',
        name: 'Grok 4.3',
        api_name: 'grok-4.3',
    },
    {
        id: '6GVJ1RWhrhcW8MYUTYgy9O',
        provider: 'xAI',
        name: 'Grok 4.20 Reasoning',
        api_name: 'grok-4.20-0309-reasoning',
    },
    {
        id: 'ijvuRL6gFCBcBp0y2Eb5qf',
        provider: 'xAI',
        name: 'Grok 4.20 Non-Reasoning',
        api_name: 'grok-4.20-0309-non-reasoning',
    },
];

export function getProviderModels(
): readonly ProviderModel[] {
    return PROVIDER_MODELS;
}

export function getModelsByProvider(
): ReadonlyMap<string, readonly ProviderModel[]> {
    const byProvider =
        new Map<string, ProviderModel[]>();
    for (const model of PROVIDER_MODELS) {
        const list = byProvider.get(model.provider);
        if (list) {
            list.push(model);
        } else {
            byProvider.set(model.provider, [model]);
        }
    }
    return byProvider;
}

export function findProviderModel(
    id: string,
): ProviderModel | undefined {
    return PROVIDER_MODELS.find(m => m.id === id);
}

export function isProviderModelId(
    id: string,
): id is ModelId {
    return PROVIDER_MODELS.some(m => m.id === id);
}
