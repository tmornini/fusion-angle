import { assertStrictEquals } from '@std/assert';
import { flowAddress } from '../web-app/app/flow-address.ts';

const PAGE = 'http://local/flows/index.html';

Deno.test(
    'opening names the flow beside the organization',
    () => {
        assertStrictEquals(
            flowAddress(PAGE + '?organization=O1', 'F1'),
            '/flows/index.html?organization=O1&id=F1',
        );
    },
);

Deno.test('opening another replaces the id', () => {
    assertStrictEquals(
        flowAddress(PAGE + '?organization=O1&id=F1', 'F2'),
        '/flows/index.html?organization=O1&id=F2',
    );
});
