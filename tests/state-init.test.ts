import { assertThrows } from '@std/assert';
import {
    STORAGE_KEY_SIDEBAR,
} from '../web-app/app/storage-keys.ts';
import {
    initState,
} from '../web-app/app/state.ts';
import { withLocalStorage } from
    './fixtures/local-storage.ts';

// The static import above is itself the purity assertion:
// state.ts must not throw on import — it touches neither
// localStorage nor window at module load, so the initial
// state is plain domain defaults. initState() hydrates the
// persisted sidebar preference at boot.
Deno.test('initState throws on a corrupt stored sidebar', () =>
    withLocalStorage({
        getItem: (k: string) =>
            k === STORAGE_KEY_SIDEBAR ? 'maybe' : null,
    }, () => {
        assertThrows(
            () => initState(),
            Error, 'corrupt stored sidebar',
        );
    }));
