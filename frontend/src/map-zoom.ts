/** How the map sits in its frame: scaled from the top left corner, then shifted. */
export interface MapZoom {
  scale: number;
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Frame {
  width: number;
  height: number;
}

export const fitted: MapZoom = { scale: 1, x: 0, y: 0 };

const maxScale = 4;

/** Keeps the scaled map covering its frame, so no empty space shows at an edge. */
function clamp(zoom: MapZoom, frame: Frame): MapZoom {
  const scale = Math.min(maxScale, Math.max(1, zoom.scale));
  if (scale === 1) return fitted;
  return {
    scale,
    x: Math.min(0, Math.max(frame.width * (1 - scale), zoom.x)),
    y: Math.min(0, Math.max(frame.height * (1 - scale), zoom.y)),
  };
}

/** Scales by `factor` while keeping the map point under `focus` in place. */
export function zoomAt(
  zoom: MapZoom,
  factor: number,
  focus: Point,
  frame: Frame,
): MapZoom {
  const scale = Math.min(maxScale, Math.max(1, zoom.scale * factor));
  const ratio = scale / zoom.scale;
  return clamp(
    {
      scale,
      x: focus.x - (focus.x - zoom.x) * ratio,
      y: focus.y - (focus.y - zoom.y) * ratio,
    },
    frame,
  );
}

export function panBy(zoom: MapZoom, delta: Point, frame: Frame): MapZoom {
  return clamp(
    { scale: zoom.scale, x: zoom.x + delta.x, y: zoom.y + delta.y },
    frame,
  );
}

/** A double tap zooms into a fitted map and returns a zoomed map to its fit. */
export function toggleZoom(
  zoom: MapZoom,
  focus: Point,
  frame: Frame,
): MapZoom {
  return zoom.scale === 1 ? zoomAt(zoom, 2, focus, frame) : fitted;
}
