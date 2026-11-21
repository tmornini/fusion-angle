import {
    assert,
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    MAX_ZOOM,
    MIN_ZOOM,
    cameraZoomedAt,
    cameraZoomedToward,
    viewBoxPannedBy,
    viewBoxPointAt,
    viewBoxResized,
    wheelZoomDirection,
} from '../web-app/app/flow-camera.ts';
import type {
    Camera,
    ZoomDirection,
} from '../web-app/app/flow-camera.ts';
import {
    buildInteractionState,
    fitBoxToCanvas,
    frameBoxInCanvas,
    zoomIn,
    zoomOut,
} from '../web-app/app/flow-interactions.ts';
import type {
    FitBox,
    InteractionState,
    ViewBox,
} from '../web-app/app/flow-interactions.ts';
import { reduceFsm }
    from '../web-app/app/flow-fsm-reduce.ts';
import {
    FlowDesignerPresenter,
    buildInitialFlowSnapshot,
} from '../web-app/app/presenters/flow-designer.ts';
import {
    buildFlowHistorySnapshot,
} from '../web-app/app/flow-history.ts';
import type { FlowWithGraph } from '../shared/types.ts';
import { storedGraph } from '../shared/types.ts';
import { responseMessage } from './fixtures/response-message.ts';
import { flowGraphOf } from '../client/flow-queries.ts';

// The shared camera arithmetic, held equal to the Flow
// Designer's own zoom, pan, and resize. Every comparison
// is exact (assertEquals on the numbers), so a camera
// that rounds differently from the designer fails here.

// Both ends of the zoom range, a step above the floor, a
// step below the ceiling (where one more step clamps),
// and the opening zoom.
const ZOOMS: readonly number[] = [0.25, 0.3, 1, 1.95, 2];

const VIEW_BOXES: readonly ViewBox[] = [
    { x: -412.37, y: 88.125, w: 1200, h: 800 },
    { x: 0.1, y: -0.7, w: 913.3, h: 507.4 },
    { x: 1234.5678, y: -9876.54321, w: 4800, h: 3200 },
];

const POINT = { x: 317.25, y: -42.6 };
const FOCALS: readonly ({
    readonly x: number;
    readonly y: number;
} | null)[] = [null, POINT];

const DIRECTIONS: readonly ZoomDirection[] = ['in', 'out'];

function forEachCamera(
    check: (camera: Camera) => void,
): void {
    for (const zoom of ZOOMS) {
        for (const viewBox of VIEW_BOXES) {
            check({ zoom, viewBox });
        }
    }
}

// The designer's interaction state at a camera. The
// viewBox is copied: the designer may mutate its own.
function designerStateAt(
    camera: Camera,
): InteractionState {
    return {
        ...buildInteractionState(
            camera.viewBox.w, camera.viewBox.h,
        ),
        zoom: camera.zoom,
        viewBox: { ...camera.viewBox },
    };
}

function cameraOf(state: InteractionState): Camera {
    return { zoom: state.zoom, viewBox: state.viewBox };
}

Deno.test(
    'button zoom equals the designer\'s zoomIn and'
    + ' zoomOut',
    () => {
        forEachCamera((camera) => {
            for (const focal of FOCALS) {
                assertEquals(
                    cameraZoomedToward(
                        camera, 'in', focal,
                    ),
                    cameraOf(zoomIn(
                        designerStateAt(camera), focal,
                    )),
                );
                assertEquals(
                    cameraZoomedToward(
                        camera, 'out', focal,
                    ),
                    cameraOf(zoomOut(
                        designerStateAt(camera), focal,
                    )),
                );
            }
        });
    },
);

Deno.test(
    'wheel zoom equals the FSM\'s wheel',
    () => {
        forEachCamera((camera) => {
            for (const deltaY of [-1, 0, 3]) {
                const wheeled = reduceFsm(
                    designerStateAt(camera),
                    {
                        kind: 'wheel',
                        deltaY,
                        svgX: POINT.x,
                        svgY: POINT.y,
                        isAutoFit: false,
                    },
                ).state;
                assertEquals(
                    cameraZoomedAt(
                        camera,
                        wheelZoomDirection(deltaY),
                        POINT,
                    ),
                    cameraOf(wheeled),
                );
            }
        });
    },
);

Deno.test(
    'wheel zoom keeps the anchor under the pointer',
    () => {
        const viewBox = VIEW_BOXES[0]!;
        const before = {
            x: (POINT.x - viewBox.x) / viewBox.w,
            y: (POINT.y - viewBox.y) / viewBox.h,
        };
        for (const direction of DIRECTIONS) {
            const next = cameraZoomedAt(
                { zoom: 1, viewBox }, direction, POINT,
            ).viewBox;
            assert(
                Math.abs(
                    (POINT.x - next.x) / next.w
                        - before.x,
                ) < 1e-12,
                `anchor keeps its x fraction (${direction})`,
            );
            assert(
                Math.abs(
                    (POINT.y - next.y) / next.h
                        - before.y,
                ) < 1e-12,
                `anchor keeps its y fraction (${direction})`,
            );
        }
    },
);

Deno.test(
    'wheelZoomDirection zooms out on a positive delta'
    + ' and in otherwise',
    () => {
        assertStrictEquals(wheelZoomDirection(3), 'out');
        assertStrictEquals(wheelZoomDirection(0), 'in');
        assertStrictEquals(wheelZoomDirection(-1), 'in');
    },
);

const RECT = { w: 900, h: 500 };
const PAN_START = { x: 433.5, y: 120.25 };
const PAN_MOVES: readonly {
    readonly clientX: number;
    readonly clientY: number;
}[] = [
    { clientX: 433.5, clientY: 120.25 },
    { clientX: 512.75, clientY: 96.5 },
    { clientX: -20.125, clientY: 733.4 },
];

Deno.test(
    'pan equals the FSM\'s pan',
    () => {
        forEachCamera((camera) => {
            for (const move of PAN_MOVES) {
                const panned = reduceFsm(
                    {
                        ...designerStateAt(camera),
                        pan: {
                            kind: 'panning',
                            startX: PAN_START.x,
                            startY: PAN_START.y,
                        },
                    },
                    {
                        kind: 'pointer-move',
                        svgX: 0,
                        svgY: 0,
                        clientX: move.clientX,
                        clientY: move.clientY,
                        isShift: false,
                        hoverNodeId: null,
                        svgRectW: RECT.w,
                        svgRectH: RECT.h,
                    },
                ).state;
                assertEquals(
                    viewBoxPannedBy(
                        camera.viewBox,
                        move.clientX - PAN_START.x,
                        move.clientY - PAN_START.y,
                        RECT,
                    ),
                    panned.viewBox,
                );
            }
        });
    },
);

const POINT_RECT = {
    left: 100, top: 40, w: 900, h: 500,
};

Deno.test(
    'viewBoxPointAt maps client pixels into the viewBox',
    () => {
        const viewBox = { x: 10, y: 20, w: 900, h: 500 };
        assertEquals(
            viewBoxPointAt(
                viewBox, POINT_RECT, 100, 40,
            ),
            { x: 10, y: 20 },
        );
        assertEquals(
            viewBoxPointAt(
                viewBox, POINT_RECT, 130, 0,
            ),
            { x: 40, y: -20 },
        );
        assertEquals(
            viewBoxPointAt(
                { x: 10, y: 20, w: 1800, h: 1000 },
                POINT_RECT, 130, 0,
            ),
            { x: 70, y: -60 },
        );
    },
);

Deno.test(
    'pan moves the view against the drag, one user'
    + ' unit per pixel at 1:1',
    () => {
        assertEquals(
            viewBoxPannedBy(
                { x: 10, y: 20, w: 900, h: 500 },
                30, -40, RECT,
            ),
            { x: -20, y: 60, w: 900, h: 500 },
        );
    },
);

// The message is the head a graph was read from. The
// presenter never reads it, so an empty flow's stands in.
const AUTO_FIT_OFF_GRAPH = flowGraphOf(
    responseMessage<FlowWithGraph>({
        id: 'aEsGMmBEFaVdWihhHXwCbw',
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        name: 'Camera Flow',
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: 0,
        graph: storedGraph({ nodes: [], edges: [] }),
    }),
);

const OPENED = { w: 1200, h: 800 };
const RESIZED = { w: 1000, h: 700 };

Deno.test(
    'resize keeps centre and zoom like withCanvasSize',
    () => {
        forEachCamera((camera) => {
            const snapshot = buildInitialFlowSnapshot(
                AUTO_FIT_OFF_GRAPH,
                OPENED.w, OPENED.h, [], [], [],
            );
            const presenter = new FlowDesignerPresenter(
                {
                    ...snapshot,
                    interaction: designerStateAt(camera),
                },
                OPENED.w, OPENED.h,
                buildFlowHistorySnapshot(false),
            );
            const designer = presenter.withCanvasSize(
                RESIZED.w, RESIZED.h,
            ).interaction;
            const resized = viewBoxResized(
                camera.viewBox, camera.zoom,
                RESIZED.w, RESIZED.h,
            );
            assertEquals(resized, designer.viewBox);
            assertStrictEquals(designer.zoom, camera.zoom);
            assertStrictEquals(
                resized.w, RESIZED.w / camera.zoom,
            );
            assertStrictEquals(
                resized.h, RESIZED.h / camera.zoom,
            );
            assert(
                Math.abs(
                    resized.x + resized.w / 2
                        - (camera.viewBox.x
                            + camera.viewBox.w / 2),
                ) < 1e-9,
                'the centre keeps its x',
            );
            assert(
                Math.abs(
                    resized.y + resized.h / 2
                        - (camera.viewBox.y
                            + camera.viewBox.h / 2),
                ) < 1e-9,
                'the centre keeps its y',
            );
        });
    },
);

const STEPS = 30;

Deno.test(
    'zoom stays within 0.25..2 after 30 steps either'
    + ' way',
    () => {
        const steppers: readonly ((
            camera: Camera, direction: ZoomDirection,
        ) => Camera)[] = [
            (camera, direction) => cameraZoomedToward(
                camera, direction, null,
            ),
            (camera, direction) => cameraZoomedAt(
                camera, direction, POINT,
            ),
        ];
        for (const stepped of steppers) {
            let camera: Camera = {
                zoom: 1, viewBox: VIEW_BOXES[0]!,
            };
            for (let i = 0; i < STEPS; i++) {
                camera = stepped(camera, 'in');
                assert(camera.zoom <= MAX_ZOOM);
            }
            assertStrictEquals(camera.zoom, MAX_ZOOM);
            for (let i = 0; i < STEPS; i++) {
                camera = stepped(camera, 'out');
                assert(camera.zoom >= MIN_ZOOM);
            }
            assertStrictEquals(camera.zoom, MIN_ZOOM);
            for (let i = 0; i < STEPS; i++) {
                camera = stepped(camera, 'in');
                assert(camera.zoom <= MAX_ZOOM);
            }
            assertStrictEquals(camera.zoom, MAX_ZOOM);
        }
        assertStrictEquals(MIN_ZOOM, 0.25);
        assertStrictEquals(MAX_ZOOM, 2);
    },
);

const CANVAS = { w: 1200, h: 800 };
const PANEL_OFFSETS: readonly number[] = [0, 288];
// The margin fitBoxToCanvas leaves around the box.
const FIT_PADDING_PX = 70;

const BOXES_INSIDE_RANGE: readonly FitBox[] = [
    { minX: -200, minY: -100, maxX: 360, maxY: 164 },
    { minX: 12.5, minY: -730.25, maxX: 2410.75, maxY: 96 },
    { minX: -88.4, minY: 3.3, maxX: 640.9, maxY: 2204.6 },
];

Deno.test(
    'frameBoxInCanvas equals fitBoxToCanvas inside the'
    + ' range',
    () => {
        for (const box of BOXES_INSIDE_RANGE) {
            for (const panelOffsetPx of PANEL_OFFSETS) {
                const fit = fitBoxToCanvas(
                    box, CANVAS.w, CANVAS.h,
                    panelOffsetPx,
                );
                assert(
                    fit.zoom > MIN_ZOOM
                        && fit.zoom < MAX_ZOOM,
                    'the row fits without a clamp',
                );
                assertEquals(
                    frameBoxInCanvas(
                        box, CANVAS.w, CANVAS.h,
                        panelOffsetPx,
                    ),
                    fit,
                );
            }
        }
    },
);

Deno.test(
    'frameBoxInCanvas goes below MIN_ZOOM for a'
    + ' 20000-wide box',
    () => {
        const box: FitBox = {
            minX: 0, minY: 0, maxX: 20000, maxY: 400,
        };
        const frame = frameBoxInCanvas(
            box, CANVAS.w, CANVAS.h, 0,
        );
        const view = frame.viewBox;
        assert(frame.zoom < MIN_ZOOM);
        assertStrictEquals(frame.zoom, CANVAS.w / view.w);
        assert(view.x <= box.minX - FIT_PADDING_PX);
        assert(view.y <= box.minY - FIT_PADDING_PX);
        assert(
            view.x + view.w >= box.maxX + FIT_PADDING_PX,
        );
        assert(
            view.y + view.h >= box.maxY + FIT_PADDING_PX,
        );
        assertStrictEquals(
            fitBoxToCanvas(
                box, CANVAS.w, CANVAS.h, 0,
            ).zoom,
            MIN_ZOOM,
            'the designer\'s fit crops the same box',
        );
    },
);
