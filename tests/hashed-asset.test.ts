import { assertStrictEquals } from '@std/assert';
import { isHashedAssetName } from
    '../shared/hashed-asset.ts';

Deno.test(
    'eight hex digits between dots name a hashed asset',
    () => {
        assertStrictEquals(
            isHashedAssetName('app.deadbeef.js'),
            true,
        );
        assertStrictEquals(
            isHashedAssetName(
                'mark.0123456789abcdef.png',
            ),
            true,
        );
        assertStrictEquals(
            isHashedAssetName('app.DEADBEEF.CSS'),
            true,
        );
    },
);

Deno.test(
    'a fixed name or a short hash is not hashed',
    () => {
        assertStrictEquals(
            isHashedAssetName('app.js'),
            false,
        );
        assertStrictEquals(
            isHashedAssetName('app.deadbee.js'),
            false,
        );
        assertStrictEquals(
            isHashedAssetName('app.deadbeef'),
            false,
        );
    },
);
