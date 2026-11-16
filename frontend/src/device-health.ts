import { numeric } from "./home-view";
import { entityArea } from "./room-sensors";
import type { HassLike } from "./types";

export interface OfflineDevice {
  /** `device:<id>`, or the entity ID for an entity without a device. */
  key: string;
  /** The first unavailable entity found for the device. */
  entityId: string;
  name: string;
  areaId: string | null;
  /** When each unavailable entity last changed, in epoch milliseconds. */
  changed: number[];
  entities: number;
}

export interface BatteryReading {
  entityId: string;
  name: string;
  areaId: string | null;
  level: number;
}

export interface DeviceHealth {
  offline: OfflineDevice[];
  batteries: BatteryReading[];
}

export function buildDeviceHealth(hass: HassLike): DeviceHealth {
  // A device is offline only when none of its entities responds. Many online devices
  // keep feature-gated entities unavailable, which is not a problem to report.
  const responding = new Set(
    Object.values(hass.states).flatMap((entity) => {
      const entry = hass.entities[entity.entity_id];
      return entry?.device_id && !entry.hidden && entity.state !== "unavailable"
        ? [entry.device_id]
        : [];
    }),
  );
  const offline = new Map<string, OfflineDevice>();
  const batteries: BatteryReading[] = [];
  for (const entity of Object.values(hass.states)) {
    const entry = hass.entities[entity.entity_id];
    if (entry?.hidden) continue;
    const name =
      entity.attributes.friendly_name ?? entry?.name ?? entity.entity_id;
    const areaId = entityArea(hass, entity.entity_id) ?? null;
    if (
      entity.state === "unavailable" &&
      entry?.entity_category !== "diagnostic" &&
      !(entry?.device_id && responding.has(entry.device_id))
    ) {
      const device = entry?.device_id
        ? hass.devices[entry.device_id]
        : undefined;
      const key = device ? `device:${device.id}` : entity.entity_id;
      const group = offline.get(key) ?? {
        key,
        entityId: entity.entity_id,
        name: device?.name_by_user ?? device?.name ?? name,
        areaId:
          device?.area_id && hass.areas[device.area_id]
            ? device.area_id
            : areaId,
        changed: [],
        entities: 0,
      };
      group.entities += 1;
      group.changed.push(Date.parse(entity.last_changed));
      offline.set(key, group);
    }
    const level = numeric(entity.state);
    if (
      entity.entity_id.startsWith("sensor.") &&
      entity.attributes.device_class === "battery" &&
      entity.attributes.unit_of_measurement === "%" &&
      level !== null &&
      level >= 0
    )
      batteries.push({ entityId: entity.entity_id, name, areaId, level });
  }
  return { offline: [...offline.values()], batteries };
}

/** Battery level below which a room card shows its lowest battery. */
const roomBatteryThreshold = 20;

export interface AreaHealth {
  offline: number;
  /** The area's lowest battery level, only when below the room threshold. */
  lowestBattery: number | null;
}

export function areaHealth(health: DeviceHealth, areaId: string): AreaHealth {
  const levels = health.batteries.flatMap((battery) =>
    battery.areaId === areaId && battery.level < roomBatteryThreshold
      ? [battery.level]
      : [],
  );
  return {
    offline: health.offline.filter((device) => device.areaId === areaId)
      .length,
    lowestBattery: levels.length ? Math.min(...levels) : null,
  };
}
