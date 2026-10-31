import { assertStrictEquals } from '@std/assert';
import {
    classifyInboxDrop,
    inboxListKindFromHash,
} from '../web-app/app/workbox-inbox-drag.ts';

Deno.test(
    'available onto claimed-by-me Active is claim',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'claimed', 'claimed',
            ),
            'claim',
        );
    },
);

Deno.test(
    'claimed-by-me onto available is release',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'claimed', 'available', 'claimed',
            ),
            'release',
        );
    },
);

Deno.test(
    'claimed-by-me onto claimed-by-me is reorder',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'claimed', 'claimed', 'claimed',
            ),
            'reorder',
        );
    },
);

Deno.test(
    'available onto available is none',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'available', 'claimed',
            ),
            'none',
        );
    },
);

Deno.test(
    'any drop onto Archived by Me is none',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available',
                'archivedByMe',
                'archivedByMe',
            ),
            'none',
        );
        assertStrictEquals(
            classifyInboxDrop(
                'claimed',
                'archivedByMe',
                'archivedByMe',
            ),
            'none',
        );
    },
);

Deno.test(
    'any drop while Archived by Me is selected'
    + ' is none',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'available',
                'archivedByMe',
            ),
            'none',
        );
        assertStrictEquals(
            classifyInboxDrop(
                'claimed', 'available',
                'archivedByMe',
            ),
            'none',
        );
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'claimed',
                'archivedByMe',
            ),
            'none',
        );
    },
);

Deno.test(
    'a drop outside both cards is none',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'outside', 'claimed',
            ),
            'none',
        );
    },
);

Deno.test(
    '#archived selects archived-by-me',
    () => {
        assertStrictEquals(
            inboxListKindFromHash('#archived'),
            'archivedByMe',
        );
    },
);

Deno.test(
    'empty and #active select claimed-by-me Active',
    () => {
        assertStrictEquals(
            inboxListKindFromHash(''),
            'claimed',
        );
        assertStrictEquals(
            inboxListKindFromHash('#active'),
            'claimed',
        );
    },
);
