import type { AreaEntry, HassLike, RoomConfig } from "./types";

export const climateSensors = [
  {
    key: "temperature_entity_id",
    deviceClass: "temperature",
    label: "temperature",
  },
  { key: "humidity_entity_id", deviceClass: "humidity", label: "humidity" },
  { key: "co2_entity_id", deviceClass: "carbon_dioxide", label: "co2" },
] as const;

export function entityArea(
  hass: HassLike,
  id: string,
): string | null | undefined {
  const entry = hass.entities[id];
  return (
    entry?.area_id ??
    (entry?.device_id ? hass.devices[entry.device_id]?.area_id : null)
  );
}

export function resolveRoomSensors(hass: HassLike, room: RoomConfig) {
  const area = hass.areas[room.area_id];
  return climateSensors.map(({ key, deviceClass, label }) => {
    const override =
      room[key] ?? (key === "co2_entity_id" ? null : area?.[key]);
    const entity = override
      ? hass.states[override]
      : Object.values(hass.states).find(
          (entity) =>
            entity.entity_id.startsWith("sensor.") &&
            entity.attributes.device_class === deviceClass &&
            entityArea(hass, entity.entity_id) === room.area_id &&
            !hass.entities[entity.entity_id]?.hidden &&
            !hass.entities[entity.entity_id]?.entity_category,
        );
    return { key, deviceClass, label, entity };
  });
}

export function isOutdoorArea(
  area: AreaEntry,
  floors: HassLike["floors"],
): boolean {
  const name =
    `${area.name} ${area.floor_id ? (floors?.[area.floor_id]?.name ?? "") : ""}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  return /\b(jardin|terrasse|exterieur|garden|terrace|outdoor|outside)\b/.test(
    name,
  );
}
