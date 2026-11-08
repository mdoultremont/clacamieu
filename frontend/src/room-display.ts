/**
 * How an element shows on its room page. Saved per entity in the room's
 * settings; elements without a saved display show as a control.
 */
export const entityDisplays = ["control", "power", "cycle", "hidden"] as const;
export type EntityDisplay = (typeof entityDisplays)[number];

export const isEntityDisplay = (value: unknown): value is EntityDisplay =>
  entityDisplays.includes(value as EntityDisplay);

/** The displays an element offers, in the order the room sheet lists them. */
export function displayOptions(element: {
  power?: unknown;
}): readonly EntityDisplay[] {
  return entityDisplays.filter(
    (display) => (display !== "power" && display !== "cycle") || !!element.power,
  );
}
