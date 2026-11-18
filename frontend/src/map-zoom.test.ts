import { describe, expect, it } from "vitest";
import { fitted, panBy, toggleZoom, zoomAt } from "./map-zoom";

const frame = { width: 400, height: 300 };

describe("map zoom", () => {
  it("keeps the pinched point under the fingers", () => {
    const zoom = zoomAt(fitted, 2, { x: 100, y: 100 }, frame);
    expect(zoom).toEqual({ scale: 2, x: -100, y: -100 });
    expect((100 - zoom.x) / zoom.scale).toBe(100);
  });

  it("never shows space beyond the map's edges", () => {
    const zoom = zoomAt(fitted, 2, { x: 0, y: 0 }, frame);
    expect(panBy(zoom, { x: 50, y: 50 }, frame)).toEqual(zoom);
    expect(panBy(zoom, { x: -1000, y: -1000 }, frame)).toEqual({
      scale: 2,
      x: -400,
      y: -300,
    });
  });

  it("stays between the fitted map and four times its size", () => {
    expect(zoomAt(fitted, 0.5, { x: 200, y: 150 }, frame)).toEqual(fitted);
    expect(zoomAt(fitted, 10, { x: 0, y: 0 }, frame).scale).toBe(4);
    const zoomed = zoomAt(fitted, 3, { x: 200, y: 150 }, frame);
    expect(zoomAt(zoomed, 0.1, { x: 200, y: 150 }, frame)).toEqual(fitted);
  });

  it("toggles between the fitted map and a closer look on double tap", () => {
    const zoomed = toggleZoom(fitted, { x: 200, y: 150 }, frame);
    expect(zoomed).toEqual({ scale: 2, x: -200, y: -150 });
    const panned = panBy(zoomed, { x: 30, y: 0 }, frame);
    expect(toggleZoom(panned, { x: 0, y: 0 }, frame)).toEqual(fitted);
  });
});
