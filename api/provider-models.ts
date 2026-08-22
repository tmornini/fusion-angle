import type {
    ModelId,
    ProviderModel,
} from './types.ts';

// Code-resident, not a DB table: the single source
// of truth the AI-member validation gate checks
// `model` membership against.
const PROVIDER_MODELS: readonly ProviderModel[] = [
    {
        id: 'nqNVXnBkUBLoKlenbyPIZQ',
        provider: 'Anthropic',
        name: 'Claude Opus 4.8',
        api_name: 'claude-opus-4-8',
    },
    {
        id: 'SPZPLkuAEWHeIabekzLYbg',
        provider: 'Anthropic',
        name: 'Claude Sonnet 4.6',
        api_name: 'claude-sonnet-4-6',
    },
    {
        id: 'HgnzqdTAhvnUccCmjKuQew',
        provider: 'Anthropic',
        name: 'Claude Haiku 4.5',
        api_name: 'claude-haiku-4-5-20251001',
    },
    {
        id: 'EurcZoFcUOmQiKURwJQvJQ',
        provider: 'OpenAI',
        name: 'GPT-5.5',
        api_name: 'gpt-5.5',
    },
    {
        id: 'HibzgwQbzUqUKpHdpZlYCA',
        provider: 'OpenAI',
        name: 'GPT-5.4',
        api_name: 'gpt-5.4',
    },
    {
        id: 'ztvDETbwNPeJowtxTCBQOg',
        provider: 'OpenAI',
        name: 'GPT-5.4 mini',
        api_name: 'gpt-5.4-mini',
    },
    {
        id: 'HpWUIcbCpXjweboJAeQvpw',
        provider: 'xAI',
        name: 'Grok 4.3',
        api_name: 'grok-4.3',
    },
    {
        id: 'CjjRnBcDNdwLkxtysTScrA',
        provider: 'xAI',
        name: 'Grok 4.20 Reasoning',
        api_name: 'grok-4.20-0309-reasoning',
    },
    {
        id: 'hVdqqPtXqdbuPmPANZqpOQ',
        provider: 'xAI',
        name: 'Grok 4.20 Non-Reasoning',
        api_name: 'grok-4.20-0309-non-reasoning',
    },
];

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
