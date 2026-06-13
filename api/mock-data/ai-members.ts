import type { AIMemberEntity } from '../types.ts';

// The seeded AI members — the demo's model roster. Fixed
// data; the composition root writes each one's member,
// membership, AI-detail, and identity rows.
export function buildAiMembers(): AIMemberEntity[] {
    return [
        {
            id: 'tuJwPxYtBur2KCLquScShB',
            name: 'Claude Opus 4.8',
            description:
                'Anthropic flagship — long'
                + ' context, deep reasoning.',
            skill_focus:
                'Long-context analysis and'
                + ' multi-step reasoning.',
            model: 'mnte677fU2G1V2B9vJp9z7',
        },
        {
            id: 'LdoTR1fnyYpS1jPzEs57ek',
            name: 'Claude Sonnet 4.6',
            description:
                'Anthropic mid-tier — fast'
                + ' and capable.',
            skill_focus:
                'Fast drafting and everyday'
                + ' task execution.',
            model: 'VIdXPkkC1H1xjav2aTKW3u',
        },
        {
            id: 'Xv89xOCXR6awwoXcPvEY9Y',
            name: 'GPT-5.5',
            description:
                'OpenAI multimodal flagship.',
            skill_focus:
                'Multimodal synthesis across'
                + ' text and images.',
            model: 'B3yjKd4NnpGhVRrY6plL0o',
        },
        {
            id: '42vHYDCvtkaO3sTnoqg7aJ',
            name: 'Grok 4.3',
            description:
                'xAI heavy-compute model.',
            skill_focus:
                'High-compute exploration of'
                + ' open-ended problems.',
            model: 'GI19ucwHLOy7ecnQOtD27v',
        },
    ];
}
