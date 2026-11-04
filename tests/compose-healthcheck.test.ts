import { assertEquals } from '@std/assert';

Deno.test(
    'compose server healthcheck fetches /status',
    async () => {
        const text = await Deno.readTextFile(
            'compose.yaml',
        );
        assertEquals(
            text.includes(
                "Deno.env.get('PORT') + '/status'",
            ),
            true,
        );
    },
);
