import {
    assertRejects,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import {
    withLocalStorage,
    withLocalStorageAsync,
} from './fixtures/local-storage.ts';

const FAKE: Partial<Storage> = {
    getItem: () => 'fake',
};

Deno.test(
    'withLocalStorage installs the fake for the body'
    + ' and restores the previous value after',
    () => {
        const previous = globalThis.localStorage;
        const result = withLocalStorage(FAKE, () => {
            assertStrictEquals(
                globalThis.localStorage, FAKE,
            );
            return 'body ran';
        });
        assertStrictEquals(result, 'body ran');
        assertStrictEquals(
            globalThis.localStorage, previous,
        );
    },
);

Deno.test(
    'withLocalStorage restores the previous value'
    + ' even when the body throws',
    () => {
        const previous = globalThis.localStorage;
        assertThrows(
            () => withLocalStorage(FAKE, () => {
                throw new Error('body exploded');
            }),
            Error,
            'body exploded',
        );
        assertStrictEquals(
            globalThis.localStorage, previous,
        );
    },
);

Deno.test(
    'withLocalStorageAsync installs the fake for the'
    + ' body and restores the previous value after',
    async () => {
        const previous = globalThis.localStorage;
        const result = await withLocalStorageAsync(
            FAKE,
            async () => {
                assertStrictEquals(
                    globalThis.localStorage, FAKE,
                );
                await Promise.resolve();
                assertStrictEquals(
                    globalThis.localStorage, FAKE,
                );
                return 'async body ran';
            },
        );
        assertStrictEquals(result, 'async body ran');
        assertStrictEquals(
            globalThis.localStorage, previous,
        );
    },
);

Deno.test(
    'withLocalStorageAsync restores the previous value'
    + ' even when the body rejects',
    async () => {
        const previous = globalThis.localStorage;
        await assertRejects(
            () => withLocalStorageAsync(
                FAKE,
                async () => {
                    await Promise.resolve();
                    throw new Error('async body exploded');
                },
            ),
            Error,
            'async body exploded',
        );
        assertStrictEquals(
            globalThis.localStorage, previous,
        );
    },
);
