import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    pointAlongPolyline,
} from '../web-app/app/flow-graph.ts';

// A waypoint edge renders as a Q/T quadratic chain; its label
// is anchored via pointAlongPolyline, NOT the cubic bezierAt
// (which misreads the Q/T control numbers and floats the label
// off the route). These assert the BASE anchor lies ON the
// routed polyline — the deliberate two-way perpendicular offset
// is applied on top of this point, not tested here.
Deno.test('midpoint of a straight waypoint path is on the line',
() => {
    const p = pointAlongPolyline(
        [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 100, y: 0 },
        ],
        0.5,
    );
    assertStrictEquals(p.y, 0);   // exactly on the y=0 route
    assertStrictEquals(p.x, 50);  // arc-length midpoint
});

Deno.test('midpoint of an L-shaped waypoint path is on a segment',
() => {
    const p = pointAlongPolyline(
        [
            { x: 0, y: 0 },
            { x: 0, y: 100 },
            { x: 100, y: 100 },
        ],
        0.5,
    );
    // Total length 200; the half-length point lands exactly at
    // the corner, which lies on both segments of the route.
    assertStrictEquals(p.x, 0);
    assertStrictEquals(p.y, 100);
});

Deno.test('the polyline anchor hits the endpoints at t=0 and t=1',
() => {
    const pts = [
        { x: 5, y: 5 },
        { x: 20, y: 40 },
        { x: 60, y: 10 },
    ];
    assertEquals(
        pointAlongPolyline(pts, 0), { x: 5, y: 5 });
    assertEquals(
        pointAlongPolyline(pts, 1), { x: 60, y: 10 });
});
