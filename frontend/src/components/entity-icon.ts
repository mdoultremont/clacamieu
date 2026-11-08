import {
  Blinds,
  DoorClosed,
  DoorOpen,
  Droplets,
  Fan,
  Footprints,
  Power,
  Speaker,
  ToggleRight,
  User,
  Warehouse,
  createLucideIcon,
  type LucideIcon,
} from "lucide-react";
import type { DeviceDomain, SensorClass } from "../room-view";

// Lucide's window icons are application windows, so these draw a house window.
const WindowClosed = createLucideIcon("window-closed", [
  ["rect", { x: "5", y: "3", width: "14", height: "15", rx: "1", key: "frame" }],
  ["path", { d: "M12 3v15M5 10.5h14M3 21h18", key: "panes" }],
]);
const WindowOpen = createLucideIcon("window-open", [
  ["path", { d: "M12 3h6a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6zM12 10.5h7M3 21h18", key: "frame" }],
  ["path", { d: "M12 3 6 5.5v15L12 18", key: "sash" }],
]);

export const entityIcons: Record<DeviceDomain | SensorClass, LucideIcon> = {
  switch: Power,
  fan: Fan,
  cover: Blinds,
  media_player: Speaker,
  input_boolean: ToggleRight,
  door: DoorClosed,
  window: WindowClosed,
  garage_door: Warehouse,
  moisture: Droplets,
  motion: Footprints,
  occupancy: User,
};

/** Icons that show an active sensor's state, such as an open door. */
export const activeIcons: Partial<Record<SensorClass, LucideIcon>> = {
  door: DoorOpen,
  window: WindowOpen,
};
