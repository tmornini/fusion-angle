import { $required } from '../app/dom.ts';
import {
    html,
    setHtml,
    trusted,
} from '../app/safe-html.ts';
import {
    API_DOC_ROOMS,
    API_DOC_STATUSES,
} from './rooms.ts';
import { API_ELEVATION_SVG } from './elevation.ts';
import {
    roomHtml,
    statusHtml,
    unknownHtml,
} from './presenter.ts';

function hashId(): string {
    const raw = location.hash;
    return raw.startsWith('#') ? raw.slice(1) : raw;
}

export async function init(): Promise<void> {
    const elevation = $required(
        '#api-elevation', document,
    );
    const room = $required('#api-room', document);
    setHtml(elevation, trusted(API_ELEVATION_SVG));
    setHtml(room, html`
        <button type="button"
            class="btn btn-ghost"
            data-api-docs-back>Back</button>
        <div id="api-room-body"></div>
    `);
    const body = $required(
        '#api-room-body', room,
    );
    let sawHashChange = false;
    const paint = (): void => {
        const id = hashId();
        if (id === '') {
            elevation.hidden = false;
            room.hidden = true;
            return;
        }
        elevation.hidden = true;
        room.hidden = false;
        const foundRoom = API_DOC_ROOMS.find(
            (entry) => entry.hash === id,
        );
        if (foundRoom !== undefined) {
            setHtml(body, roomHtml(foundRoom));
            return;
        }
        const foundStatus = API_DOC_STATUSES.find(
            (entry) => entry.hash === id,
        );
        if (foundStatus !== undefined) {
            setHtml(body, statusHtml(foundStatus));
            return;
        }
        setHtml(body, unknownHtml(id));
    };
    window.addEventListener('hashchange', () => {
        sawHashChange = true;
        paint();
    });
    $required(
        '[data-api-docs-back]', room,
    ).addEventListener('click', () => {
        if (sawHashChange) {
            history.back();
            return;
        }
        location.hash = '';
    });
    paint();
}
