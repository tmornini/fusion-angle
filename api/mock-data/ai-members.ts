import type { AIMemberEntity } from '../types.ts';

// The seeded AI members — the demo's model roster. Fixed
// data; the composition root writes each one's member,
// membership, AI-detail, and identity rows.
export function buildAiMembers(): AIMemberEntity[] {
    return [
        {
            id: 'wUkEhqRIJPaecPaeCOKZUg',
            name: 'Claude Opus 4.8',
            description:
                'Anthropic flagship — long'
                + ' context, deep reasoning.',
            skill_focus:
                'Long-context analysis and'
                + ' multi-step reasoning.',
            model: 'nqNVXnBkUBLoKlenbyPIZQ',
        },
        {
            id: 'MNwbRSuoYKwmVvCyxZCdwA',
            name: 'Claude Sonnet 4.6',
            description:
                'Anthropic mid-tier — fast'
                + ' and capable.',
            skill_focus:
                'Fast drafting and everyday'
                + ' task execution.',
            model: 'SPZPLkuAEWHeIabekzLYbg',
        },
        {
            id: 'TUEVODaACdRpdCoetLSzZg',
            name: 'GPT-5.5',
            description:
                'OpenAI multimodal flagship.',
            skill_focus:
                'Multimodal synthesis across'
                + ' text and images.',
            model: 'EurcZoFcUOmQiKURwJQvJQ',
        },
        {
            id: 'BhdhBLQPyktOCbdJzGsggg',
            name: 'Grok 4.3',
            description:
                'xAI heavy-compute model.',
            skill_focus:
                'High-compute exploration of'
                + ' open-ended problems.',
            model: 'HpWUIcbCpXjweboJAeQvpw',
        },
    ];
}
