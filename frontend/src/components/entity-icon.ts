import {
  AppWindow,
  Blinds,
  DoorOpen,
  Droplets,
  Fan,
  Footprints,
  Power,
  Speaker,
  ToggleRight,
  User,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { DeviceDomain, SensorClass } from "../room-view";

export const entityIcons: Record<DeviceDomain | SensorClass, LucideIcon> = {
  switch: Power,
  fan: Fan,
  cover: Blinds,
  media_player: Speaker,
  input_boolean: ToggleRight,
  door: DoorOpen,
  window: AppWindow,
  garage_door: Warehouse,
  moisture: Droplets,
  motion: Footprints,
  occupancy: User,
};
